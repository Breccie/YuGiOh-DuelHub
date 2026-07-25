import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  listWishlistItems,
  removeWishlistItem,
  upsertWishlistItem,
} from "@/lib/wishlist-service";

const prisma = new PrismaClient();

describe("wishlist service", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("tracks missing quantities in the active campaign and removes the item", async () => {
    const tag = `vitest-wishlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let userId: string | undefined;
    let runId: string | undefined;
    let cardId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: tag.toUpperCase(),
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Wishlist Tester",
        },
      });
      userId = user.id;
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
      });
      runId = run.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { activeRunId: run.id },
      });
      const card = await prisma.card.create({
        data: {
          slug: `${tag}-card`,
          externalCardId: `${tag}-card`,
          name: `${tag} Card`,
          kind: CardKind.SPELL,
          currentOracleText: "Wishlist integration test card.",
        },
      });
      cardId = card.id;

      const created = await upsertWishlistItem(prisma, user.id, {
        cardId: card.id,
        desiredQuantity: 2,
        priority: "HIGH",
        note: "Für das Testdeck",
      });
      expect(created).toMatchObject([
        {
          cardId: card.id,
          desiredQuantity: 2,
          ownedQuantity: 0,
          missingQuantity: 2,
          completed: false,
          priority: "HIGH",
        },
      ]);

      await prisma.collectionEntry.createMany({
        data: [
          {
            userId: user.id,
            runId: run.id,
            cardId: card.id,
            source: "MANUAL_GRANT",
          },
          {
            userId: user.id,
            runId: run.id,
            cardId: card.id,
            source: "MANUAL_GRANT",
          },
        ],
      });

      const completed = await listWishlistItems(prisma, user.id);
      expect(completed[0]).toMatchObject({
        ownedQuantity: 2,
        missingQuantity: 0,
        completed: true,
      });

      await removeWishlistItem(prisma, user.id, completed[0]!.id);
      await expect(listWishlistItems(prisma, user.id)).resolves.toEqual([]);
    } finally {
      if (runId) {
        await prisma.playGroupRun.deleteMany({ where: { id: runId } });
      }
      if (cardId) {
        await prisma.card.deleteMany({ where: { id: cardId } });
      }
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    }
  });
});
