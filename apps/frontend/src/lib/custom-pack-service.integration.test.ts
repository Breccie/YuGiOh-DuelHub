import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  createCustomPack,
  openCustomPackVersion,
  publishCustomPackVersion,
  updateCustomPackDraft,
} from "@/lib/custom-pack-service";
import { updateCampaignPackAccess } from "@/lib/campaign-pack-access-service";
import { deleteRunFixture } from "@/test-support/run-fixture-cleanup";

const prisma = new PrismaClient();

describe("custom pack publishing and opening", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("freezes published versions and makes paid openings idempotent", async () => {
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
        ["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare"].map((rarity, index) =>
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
          rarity: ["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare"][index]!,
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

      await expect(openCustomPackVersion(prisma, user.id, run.id, version.id, {
        idempotencyKey: "   ",
      })).rejects.toMatchObject({ code: "idempotency_key_required", status: 400 });

      await expect(openCustomPackVersion(prisma, user.id, run.id, version.id, {
        idempotencyKey: "before-player-release",
      })).rejects.toMatchObject({ code: "custom_pack_unavailable", status: 409 });

      await updateCampaignPackAccess(prisma, {
        viewerId: user.id,
        runId: run.id,
        input: {
          kind: "CUSTOM",
          productId: version.id,
          availabilityStatus: "AVAILABLE",
          price: 100,
          displaySize: null,
          rewardOnly: false,
          reason: "Integrationstest: veröffentlichte Version für Spieler freigeben.",
        },
      });

      const first = await openCustomPackVersion(prisma, user.id, run.id, version.id, {
        idempotencyKey: "stable-purchase-intent",
      });
      const retry = await openCustomPackVersion(prisma, user.id, run.id, version.id, {
        idempotencyKey: "stable-purchase-intent",
      });
      expect(retry.id).toBe(first.id);
      expect(retry.pulls.map((pull) => pull.cardId)).toEqual(first.pulls.map((pull) => pull.cardId));
      expect(retry.auditHash).toBe(first.auditHash);

      const second = await openCustomPackVersion(prisma, user.id, run.id, version.id, {
        idempotencyKey: "second-purchase-intent",
      });
      expect(second.id).not.toBe(first.id);
      expect(second.seed).not.toBe(first.seed);

      await updateCampaignPackAccess(prisma, {
        viewerId: user.id,
        runId: run.id,
        input: {
          kind: "CUSTOM",
          productId: version.id,
          availabilityStatus: "LOCKED",
          price: 100,
          displaySize: null,
          rewardOnly: false,
          reason: "Integrationstest: neue Öffnungen sperren.",
        },
      });
      await expect(openCustomPackVersion(prisma, user.id, run.id, version.id, {
        idempotencyKey: "after-soft-lock",
      })).rejects.toMatchObject({ code: "pack_locked", status: 409 });

      const [opening, ownedCards, wallet, purchases] = await Promise.all([
        prisma.packOpening.findUniqueOrThrow({ where: { id: first.id } }),
        prisma.collectionEntry.count({ where: { runId: run.id, userId: user.id } }),
        prisma.creditWallet.findUniqueOrThrow({ where: { runId_userId: { runId: run.id, userId: user.id } } }),
        prisma.creditLedgerEntry.count({ where: { runId: run.id, userId: user.id, source: "PACK_PURCHASE" } }),
      ]);
      expect(opening.customPackVersionId).toBe(version.id);
      expect(opening.ruleVersionId).toBeTruthy();
      expect(ownedCards).toBe(18);
      expect(wallet.balance).toBe(800);
      expect(purchases).toBe(2);
    } finally {
      if (runId) await deleteRunFixture(prisma, runId);
      if (generatedSetId) await prisma.cardSet.deleteMany({ where: { id: generatedSetId } });
      if (cardIds.length > 0) await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});
