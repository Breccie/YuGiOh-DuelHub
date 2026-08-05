import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  acceptTradeVersion,
  approveTradeCompletion,
  confirmTradeCompletion,
  createTradeCounterOffer,
  createTradeOffer,
  getTradeDetail,
} from "@/lib/trade-service";
import { buildCampaignRuleConfig } from "@/lib/campaign-rule-service";

const prisma = new PrismaClient();

describe("trade service", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs the full counter-offer, reservation, and two-confirmation ownership transfer flow", async () => {
    const tag = `vitest-trade-${Date.now()}`;
    const createdIds: {
      userIds: string[];
      runId?: string;
      cardIds: string[];
    } = {
      userIds: [],
      cardIds: [],
    };

    try {
      const [proposer, responder] = await Promise.all([
        prisma.user.create({
          data: {
            duelistId: `${tag.toUpperCase()}-P1`,
            email: `${tag}-p1@example.test`,
            passwordHash: "test-hash",
            displayName: "Trade Proposer",
          },
        }),
        prisma.user.create({
          data: {
            duelistId: `${tag.toUpperCase()}-P2`,
            email: `${tag}-p2@example.test`,
            passwordHash: "test-hash",
            displayName: "Trade Responder",
          },
        }),
      ]);
      createdIds.userIds.push(proposer.id, responder.id);

      await prisma.friendship.create({
        data: {
          requesterId: proposer.id,
          addresseeId: responder.id,
          status: "ACCEPTED",
        },
      });

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: proposer.id,
          name: `${tag} run`,
          memberships: {
            create: [
              {
                userId: proposer.id,
                role: "OWNER",
              },
              {
                userId: responder.id,
                role: "PLAYER",
              },
            ],
          },
        },
      });
      createdIds.runId = run.id;

      const ruleConfig = buildCampaignRuleConfig(run);
      ruleConfig.trades.allowCredits = true;
      ruleConfig.trades.organizerApproval = true;
      const ruleVersion = await prisma.campaignRuleVersion.create({
        data: {
          runId: run.id,
          version: 1,
          status: "ACTIVE",
          presetKey: "CUSTOM",
          config: ruleConfig,
          createdById: proposer.id,
          activatedAt: new Date(),
        },
      });
      await prisma.playGroupRun.update({ where: { id: run.id }, data: { activeRuleVersionId: ruleVersion.id } });
      await prisma.creditWallet.createMany({
        data: [
          { runId: run.id, userId: proposer.id, balance: 1000 },
          { runId: run.id, userId: responder.id, balance: 1000 },
        ],
      });

      await prisma.user.updateMany({
        where: {
          id: {
            in: [proposer.id, responder.id],
          },
        },
        data: {
          activeRunId: run.id,
        },
      });

      const [proposerCardA, proposerCardB, responderCardA, responderCardB] =
        await Promise.all(
          ["Proposer A", "Proposer B", "Responder A", "Responder B"].map((name, index) =>
            prisma.card.create({
              data: {
                slug: `${tag}-${index}`,
                externalCardId: `${tag}-${index}`,
                name: `${tag} ${name}`,
                kind: CardKind.MONSTER,
              },
            }),
          ),
        );
      createdIds.cardIds.push(
        proposerCardA.id,
        proposerCardB.id,
        responderCardA.id,
        responderCardB.id,
      );

      const [
        proposerEntryA,
        proposerEntryB,
        responderEntryA,
        responderEntryB,
      ] = await Promise.all([
        prisma.collectionEntry.create({
          data: {
            userId: proposer.id,
            runId: run.id,
            cardId: proposerCardA.id,
            source: "MANUAL_GRANT",
          },
        }),
        prisma.collectionEntry.create({
          data: {
            userId: proposer.id,
            runId: run.id,
            cardId: proposerCardB.id,
            source: "MANUAL_GRANT",
          },
        }),
        prisma.collectionEntry.create({
          data: {
            userId: responder.id,
            runId: run.id,
            cardId: responderCardA.id,
            source: "MANUAL_GRANT",
          },
        }),
        prisma.collectionEntry.create({
          data: {
            userId: responder.id,
            runId: run.id,
            cardId: responderCardB.id,
            source: "MANUAL_GRANT",
          },
        }),
      ]);
      const proposerBinder = await prisma.collectionBinder.create({
        data: {
          userId: proposer.id,
          runId: run.id,
          name: "Trade binder",
          coverKey: "inferno-vortex",
          pages: {
            create: {
              pageIndex: 0,
              slots: {
                create: {
                  slotIndex: 0,
                  collectionEntryId: proposerEntryB.id,
                  entryReferenceId: proposerEntryB.id,
                  snapshotCardId: proposerCardB.id,
                  snapshotCardName: proposerCardB.name,
                },
              },
            },
          },
        },
        include: { pages: { include: { slots: true } } },
      });

      const createdTrade = await createTradeOffer(prisma, proposer.id, {
        responderDuelistId: responder.duelistId,
        note: "Initial offer",
        offeredEntryIds: [proposerEntryA.id],
        requestedEntryIds: [responderEntryA.id],
      });

      expect(createdTrade.status).toBe("PENDING");
      expect(createdTrade.allowedActions).toContain("cancel");
      await expect(
        getTradeDetail(prisma, responder.id, createdTrade.id),
      ).resolves.toEqual(
        expect.objectContaining({
          allowedActions: expect.arrayContaining(["accept", "reject", "counter"]),
        }),
      );

      await createTradeCounterOffer(prisma, responder.id, createdTrade.id, {
        note: "Counter offer",
        offeredEntryIds: [responderEntryB.id],
        requestedEntryIds: [proposerEntryB.id],
        offeredCredits: 200,
        requestedCredits: 50,
      });

      const counteredTrade = await getTradeDetail(
        prisma,
        proposer.id,
        createdTrade.id,
      );
      expect(counteredTrade.status).toBe("PENDING");
      expect(counteredTrade.activeVersion?.versionNumber).toBe(2);
      expect(counteredTrade.allowedActions).toEqual(
        expect.arrayContaining(["accept", "reject", "counter"]),
      );

      await acceptTradeVersion(prisma, proposer.id, createdTrade.id);

      const reservedWallets = await prisma.creditWallet.findMany({ where: { runId: run.id } });
      expect(reservedWallets.find((wallet) => wallet.userId === responder.id)?.reservedBalance).toBe(200);
      expect(reservedWallets.find((wallet) => wallet.userId === proposer.id)?.reservedBalance).toBe(50);

      const acceptedEntries = await prisma.collectionEntry.findMany({
        where: {
          id: {
            in: [
              proposerEntryA.id,
              responderEntryA.id,
              proposerEntryB.id,
              responderEntryB.id,
            ],
          },
        },
        orderBy: {
          id: "asc",
        },
      });
      const entryById = new Map(acceptedEntries.map((entry) => [entry.id, entry]));

      expect(entryById.get(proposerEntryA.id)?.lockState).toBe("AVAILABLE");
      expect(entryById.get(responderEntryA.id)?.lockState).toBe("AVAILABLE");
      expect(entryById.get(proposerEntryB.id)?.lockState).toBe("RESERVED");
      expect(entryById.get(responderEntryB.id)?.lockState).toBe("RESERVED");

      await confirmTradeCompletion(prisma, responder.id, createdTrade.id);
      const afterFirstConfirmation = await getTradeDetail(
        prisma,
        proposer.id,
        createdTrade.id,
      );
      expect(afterFirstConfirmation.status).toBe("ACCEPTED");
      expect(afterFirstConfirmation.responderConfirmedAt).not.toBeNull();
      expect(afterFirstConfirmation.proposerConfirmedAt).toBeNull();

      await confirmTradeCompletion(prisma, proposer.id, createdTrade.id);
      const waitingForApproval = await getTradeDetail(
        prisma,
        proposer.id,
        createdTrade.id,
      );
      expect(waitingForApproval.status).toBe("ACCEPTED");
      expect(waitingForApproval.requiresOrganizerApproval).toBe(true);
      expect(waitingForApproval.approvedAt).toBeNull();

      await approveTradeCompletion(prisma, proposer.id, createdTrade.id);
      const completedTrade = await getTradeDetail(prisma, proposer.id, createdTrade.id);
      expect(completedTrade.status).toBe("COMPLETED");
      expect(completedTrade.proposerConfirmedAt).not.toBeNull();
      expect(completedTrade.responderConfirmedAt).not.toBeNull();
      expect(completedTrade.timeline.map((entry) => entry.type)).toEqual(
        expect.arrayContaining([
          "VERSION_CREATED",
          "TRADE_ACCEPTED",
          "TRADE_CONFIRMED",
          "TRADE_APPROVED",
          "TRADE_COMPLETED",
        ]),
      );

      const transferredEntries = await prisma.collectionEntry.findMany({
        where: {
          id: {
            in: [proposerEntryB.id, responderEntryB.id],
          },
        },
      });
      const transferredById = new Map(
        transferredEntries.map((entry) => [entry.id, entry]),
      );

      expect(transferredById.get(proposerEntryB.id)).toEqual(
        expect.objectContaining({
          userId: responder.id,
          lockState: "AVAILABLE",
          source: "TRADE",
          sourceReferenceId: createdTrade.id,
        }),
      );
      expect(transferredById.get(responderEntryB.id)).toEqual(
        expect.objectContaining({
          userId: proposer.id,
          lockState: "AVAILABLE",
          source: "TRADE",
          sourceReferenceId: createdTrade.id,
        }),
      );
      const finalWallets = await prisma.creditWallet.findMany({ where: { runId: run.id } });
      expect(finalWallets.find((wallet) => wallet.userId === proposer.id)).toMatchObject({ balance: 1150, reservedBalance: 0 });
      expect(finalWallets.find((wallet) => wallet.userId === responder.id)).toMatchObject({ balance: 850, reservedBalance: 0 });
      expect(await prisma.creditLedgerEntry.count({ where: { runId: run.id, source: "TRADE_TRANSFER" } })).toBe(4);
      expect(
        await prisma.collectionBinderSlot.findUniqueOrThrow({
          where: { id: proposerBinder.pages[0].slots[0].id },
        }),
      ).toMatchObject({
        collectionEntryId: null,
        entryReferenceId: null,
        snapshotCardId: null,
      });
    } finally {
      if (createdIds.runId) {
        await prisma.playGroupRun.deleteMany({
          where: {
            id: createdIds.runId,
          },
        });
      }

      if (createdIds.userIds.length > 0) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: createdIds.userIds,
            },
          },
        });
      }

      if (createdIds.cardIds.length > 0) {
        await prisma.card.deleteMany({
          where: {
            id: {
              in: createdIds.cardIds,
            },
          },
        });
      }
    }
  }, 20_000);
});
