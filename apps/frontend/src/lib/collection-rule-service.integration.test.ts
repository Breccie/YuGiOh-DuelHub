import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { buildCampaignRuleConfig } from "@/lib/campaign-rule-service";
import { addPulledCardsToCollection } from "@/lib/collection-rule-service";
import { deleteRunFixture } from "@/test-support/run-fixture-cleanup";

const prisma = new PrismaClient();

describe("collection sandbox rules", () => {
  afterAll(async () => prisma.$disconnect());

  it("caps duplicate pulls and atomically converts overflow into dust credits", async () => {
    const tag = `vitest-collection-rules-${Date.now()}`;
    let runId: string | undefined;
    let userId: string | undefined;
    let cardId: string | undefined;
    try {
      const user = await prisma.user.create({
        data: {
          duelistId: `${tag}-user`.toUpperCase(),
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Collection Rules Tester",
        },
      });
      userId = user.id;
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      runId = run.id;
      const config = buildCampaignRuleConfig(run);
      config.collection.duplicateRule = "CONVERT_CREDITS";
      config.collection.maxCopiesPerCard = 1;
      config.collection.dustingEnabled = true;
      config.collection.dustingCreditsPerCard = 7;
      const version = await prisma.campaignRuleVersion.create({
        data: {
          runId: run.id,
          version: 1,
          status: "ACTIVE",
          presetKey: "CUSTOM",
          config,
          createdById: user.id,
          activatedAt: new Date(),
        },
      });
      await prisma.playGroupRun.update({
        where: { id: run.id },
        data: { activeRuleVersionId: version.id },
      });
      await prisma.creditWallet.create({
        data: { runId: run.id, userId: user.id, balance: 0 },
      });
      const card = await prisma.card.create({
        data: {
          slug: `${tag}-card`,
          externalCardId: `${tag}-card`,
          name: `${tag} Card`,
          kind: CardKind.TRAP,
        },
      });
      cardId = card.id;

      const result = await prisma.$transaction((tx) =>
        addPulledCardsToCollection(tx, {
          runId: run.id,
          userId: user.id,
          pulls: [0, 1, 2].map((index) => ({
            cardId: card.id,
            setCardId: null,
            sourceReferenceId: `${tag}-opening-${index}`,
          })),
        }),
      );
      expect(result).toEqual({ kept: 1, converted: 2 });
      await expect(
        prisma.collectionEntry.count({ where: { runId: run.id, userId: user.id, cardId: card.id } }),
      ).resolves.toBe(1);
      await expect(
        prisma.creditWallet.findUniqueOrThrow({
          where: { runId_userId: { runId: run.id, userId: user.id } },
        }),
      ).resolves.toMatchObject({ balance: 14 });
      await expect(
        prisma.creditLedgerEntry.findFirst({
          where: { runId: run.id, userId: user.id, source: "DUST_CONVERSION" },
        }),
      ).resolves.toMatchObject({ amount: 14 });
    } finally {
      if (runId) await deleteRunFixture(prisma, runId);
      if (cardId) await prisma.card.deleteMany({ where: { id: cardId } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});
