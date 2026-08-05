import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  createAuction,
  placeAuctionBid,
  settleAuction,
} from "@/lib/auction-service";
import { buildCampaignRuleConfig } from "@/lib/campaign-rule-service";

const prisma = new PrismaClient();

describe("auction service", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reserves bids, releases an outbid wallet, and settles card plus credits atomically", async () => {
    const tag = `vitest-auction-${Date.now()}`;
    const userIds: string[] = [];
    const cardIds: string[] = [];
    let runId: string | null = null;

    try {
      const [seller, firstBidder, secondBidder] = await Promise.all(
        ["Seller", "First", "Second"].map((label, index) =>
          prisma.user.create({
            data: {
              duelistId: `${tag.toUpperCase()}-${index}`,
              email: `${tag}-${index}@example.test`,
              passwordHash: "test-hash",
              displayName: label,
            },
          })
        ),
      );
      userIds.push(seller.id, firstBidder.id, secondBidder.id);

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: seller.id,
          name: `${tag} run`,
          memberships: {
            create: [
              { userId: seller.id, role: "OWNER" },
              { userId: firstBidder.id, role: "PLAYER" },
              { userId: secondBidder.id, role: "PLAYER" },
            ],
          },
        },
      });
      runId = run.id;

      const ruleConfig = buildCampaignRuleConfig(run);
      ruleConfig.trades.allowCredits = true;
      ruleConfig.trades.modes = ["DIRECT", "AUCTION"];
      ruleConfig.trades.maxCreditsPerTrade = 1_000;
      const ruleVersion = await prisma.campaignRuleVersion.create({
        data: {
          runId: run.id,
          version: 1,
          status: "ACTIVE",
          presetKey: "CUSTOM",
          config: ruleConfig,
          createdById: seller.id,
          activatedAt: new Date(),
        },
      });
      await Promise.all([
        prisma.playGroupRun.update({
          where: { id: run.id },
          data: { activeRuleVersionId: ruleVersion.id },
        }),
        prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { activeRunId: run.id },
        }),
        prisma.creditWallet.createMany({
          data: [
            { runId: run.id, userId: seller.id, balance: 1_000 },
            { runId: run.id, userId: firstBidder.id, balance: 500 },
            { runId: run.id, userId: secondBidder.id, balance: 500 },
          ],
        }),
      ]);

      const card = await prisma.card.create({
        data: {
          slug: `${tag}-card`,
          externalCardId: `${tag}-card`,
          name: "Auction Dragon",
          kind: CardKind.MONSTER,
        },
      });
      cardIds.push(card.id);
      const entry = await prisma.collectionEntry.create({
        data: {
          runId: run.id,
          userId: seller.id,
          cardId: card.id,
          source: "MANUAL_GRANT",
        },
      });
      const binder = await prisma.collectionBinder.create({
        data: {
          userId: seller.id,
          runId: run.id,
          name: "Auction binder",
          coverKey: "inferno-vortex",
          pages: {
            create: {
              pageIndex: 0,
              slots: {
                create: {
                  slotIndex: 0,
                  collectionEntryId: entry.id,
                  entryReferenceId: entry.id,
                  snapshotCardId: card.id,
                  snapshotCardName: card.name,
                },
              },
            },
          },
        },
        include: { pages: { include: { slots: true } } },
      });

      const auction = await createAuction(prisma, seller.id, {
        collectionEntryId: entry.id,
        startingBid: 100,
        minIncrement: 10,
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await expect(
        placeAuctionBid(prisma, seller.id, auction.id, 100),
      ).rejects.toThrow("eigene Auktion");
      expect(
        (await prisma.collectionEntry.findUniqueOrThrow({ where: { id: entry.id } })).lockState,
      ).toBe("RESERVED");

      await placeAuctionBid(prisma, firstBidder.id, auction.id, 120);
      await expect(
        placeAuctionBid(prisma, secondBidder.id, auction.id, 2_000),
      ).rejects.toThrow("höchstens 1000");
      expect(
        (await prisma.creditWallet.findUniqueOrThrow({
          where: { runId_userId: { runId: run.id, userId: secondBidder.id } },
        })).reservedBalance,
      ).toBe(0);

      await placeAuctionBid(prisma, secondBidder.id, auction.id, 150);
      let wallets = await prisma.creditWallet.findMany({ where: { runId: run.id } });
      expect(wallets.find((wallet) => wallet.userId === firstBidder.id)?.reservedBalance).toBe(0);
      expect(wallets.find((wallet) => wallet.userId === secondBidder.id)?.reservedBalance).toBe(150);

      await placeAuctionBid(prisma, firstBidder.id, auction.id, 180);
      wallets = await prisma.creditWallet.findMany({ where: { runId: run.id } });
      expect(wallets.find((wallet) => wallet.userId === firstBidder.id)?.reservedBalance).toBe(180);
      expect(wallets.find((wallet) => wallet.userId === secondBidder.id)?.reservedBalance).toBe(0);

      await prisma.auction.update({
        where: { id: auction.id },
        data: { endsAt: new Date(Date.now() - 1_000) },
      });
      await settleAuction(prisma, seller.id, auction.id);

      const [settledAuction, transferredEntry, settledWallets, ledger, binderSlot] = await Promise.all([
        prisma.auction.findUniqueOrThrow({ where: { id: auction.id } }),
        prisma.collectionEntry.findUniqueOrThrow({ where: { id: entry.id } }),
        prisma.creditWallet.findMany({ where: { runId: run.id } }),
        prisma.creditLedgerEntry.findMany({
          where: { referenceType: { startsWith: "Auction:" }, referenceId: auction.id },
        }),
        prisma.collectionBinderSlot.findUniqueOrThrow({
          where: { id: binder.pages[0].slots[0].id },
        }),
      ]);
      expect(settledAuction.status).toBe("SETTLED");
      expect(transferredEntry.userId).toBe(firstBidder.id);
      expect(transferredEntry.lockState).toBe("AVAILABLE");
      expect(settledWallets.find((wallet) => wallet.userId === seller.id)?.balance).toBe(1_180);
      expect(settledWallets.find((wallet) => wallet.userId === firstBidder.id)?.balance).toBe(320);
      expect(settledWallets.every((wallet) => wallet.reservedBalance === 0)).toBe(true);
      expect(ledger).toHaveLength(2);
      expect(ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
      expect(binderSlot.collectionEntryId).toBeNull();
      expect(binderSlot.entryReferenceId).toBeNull();
      expect(binderSlot.snapshotCardId).toBeNull();
    } finally {
      if (runId) {
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { activeRunId: null },
        });
        await prisma.playGroupRun.updateMany({
          where: { id: runId },
          data: { activeRuleVersionId: null },
        });
        await prisma.playGroupRun.deleteMany({ where: { id: runId } });
      }
      await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });
});
