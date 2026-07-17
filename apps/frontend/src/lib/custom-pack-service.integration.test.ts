import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  createCustomPack,
  openCustomPackVersion,
  publishCustomPackVersion,
  updateCustomPackDraft,
} from "@/lib/custom-pack-service";

const prisma = new PrismaClient();

describe("custom pack publishing and opening", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("freezes published versions and reproduces pulls for the same seed", async () => {
    const tag = `vitest-custom-pack-${Date.now()}`;
    const cardIds: string[] = [];
    let runId: string | undefined;
    let userId: string | undefined;
    let generatedSetId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: `${tag}-user`.toUpperCase(),
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Custom Pack Tester",
        },
      });
      userId = user.id;
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          startingCredits: 1_000,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      runId = run.id;
      const cards = await Promise.all(
        ["Common", "Rare", "Super Rare", "Ultra Rare"].map((rarity, index) =>
          prisma.card.create({
            data: {
              slug: `${tag}-${index}`,
              externalCardId: `${tag}-${index}`,
              name: `${tag} ${rarity}`,
              kind: CardKind.SPELL,
              currentOracleText: "Custom pack integration fixture.",
            },
          }),
        ),
      );
      cardIds.push(...cards.map((card) => card.id));

      const definition = await createCustomPack(prisma, user.id, run.id, {
        name: `${tag} pack`,
        code: `CP${Date.now()}`,
        era: "EARLY_TCG",
        packSize: 9,
        displaySize: 24,
        price: 100,
      });
      const version = definition.versions[0]!;
      const draft = {
        poolEntries: cards.map((card, index) => ({
          cardId: card.id,
          setCardId: null,
          rarity: ["Common", "Rare", "Super Rare", "Ultra Rare"][index]!,
          weight: 1,
        })),
        slots: version.slots.map((slot) => ({
          slotIndex: slot.slotIndex,
          count: slot.count,
          allowedRarities: slot.allowedRarities as string[],
          weight: slot.weight,
        })),
      };
      await updateCustomPackDraft(prisma, user.id, run.id, version.id, draft);
      const published = await publishCustomPackVersion(prisma, user.id, run.id, version.id);
      generatedSetId = published.generatedSetId ?? undefined;

      await expect(updateCustomPackDraft(prisma, user.id, run.id, version.id, draft))
        .rejects.toThrow(/unveränderlich/i);

      const first = await openCustomPackVersion(prisma, user.id, run.id, version.id, "stable-seed");
      const second = await openCustomPackVersion(prisma, user.id, run.id, version.id, "stable-seed");
      expect(first.pulls.map((pull) => pull.cardId)).toEqual(second.pulls.map((pull) => pull.cardId));
      expect(first.auditHash).toBe(second.auditHash);

      const [opening, ownedCards] = await Promise.all([
        prisma.packOpening.findUniqueOrThrow({ where: { id: first.id } }),
        prisma.collectionEntry.count({ where: { runId: run.id, userId: user.id } }),
      ]);
      expect(opening.customPackVersionId).toBe(version.id);
      expect(opening.ruleVersionId).toBeTruthy();
      expect(ownedCards).toBe(18);
    } finally {
      if (runId) await prisma.playGroupRun.deleteMany({ where: { id: runId } });
      if (generatedSetId) await prisma.cardSet.deleteMany({ where: { id: generatedSetId } });
      if (cardIds.length > 0) await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});
