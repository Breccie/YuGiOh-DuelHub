import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getCollectionSnapshot } from "@/lib/collection-ledger";
import { createDeck, updateDeckMetadata } from "@/lib/deck-editor";
import { createDuelRequest } from "@/lib/duel-service";
import { createTradeOffer } from "@/lib/trade-service";

const prisma = new PrismaClient();

describe("run isolation", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps collection, decks, trades, and duels scoped to the active run", async () => {
    const tag = `vitest-run-isolation-${Date.now()}`;
    const createdIds: {
      ownerId?: string;
      playerId?: string;
      cardId?: string;
      setId?: string;
      runIds: string[];
    } = {
      runIds: [],
    };

    try {
      const [owner, player] = await Promise.all([
        prisma.user.create({
          data: {
            duelistId: `${tag.toUpperCase()}-OWNER`,
            email: `${tag}-owner@example.test`,
            passwordHash: "test-hash",
            displayName: "Run A Owner",
          },
        }),
        prisma.user.create({
          data: {
            duelistId: `${tag.toUpperCase()}-PLAYER`,
            email: `${tag}-player@example.test`,
            passwordHash: "test-hash",
            displayName: "Run A Player",
          },
        }),
      ]);
      createdIds.ownerId = owner.id;
      createdIds.playerId = player.id;

      await prisma.friendship.create({
        data: {
          requesterId: owner.id,
          addresseeId: player.id,
          status: "ACCEPTED",
        },
      });

      const [runA, runB] = await Promise.all([
        prisma.playGroupRun.create({
          data: {
            ownerId: owner.id,
            name: `${tag} run A`,
            startingCredits: 0,
            memberships: {
              create: [
                { userId: owner.id, role: "OWNER" },
                { userId: player.id, role: "PLAYER" },
              ],
            },
          },
        }),
        prisma.playGroupRun.create({
          data: {
            ownerId: owner.id,
            name: `${tag} run B`,
            startingCredits: 0,
            memberships: {
              create: [
                { userId: owner.id, role: "OWNER" },
                { userId: player.id, role: "PLAYER" },
              ],
            },
          },
        }),
      ]);
      createdIds.runIds.push(runA.id, runB.id);
      await prisma.user.update({
        where: { id: owner.id },
        data: { activeRunId: runA.id },
      });

      const card = await prisma.card.create({
        data: {
          slug: `${tag}-dragon`,
          externalCardId: `${tag}-dragon`,
          name: `${tag} Dragon`,
          kind: CardKind.MONSTER,
        },
      });
      createdIds.cardId = card.id;
      const set = await prisma.cardSet.create({
        data: {
          code: `${tag}-SET`,
          name: `${tag} Booster`,
          releaseDate: new Date("2002-03-08T00:00:00.000Z"),
          region: "TCG",
          productType: "CORE_BOOSTER",
          isOpenable: true,
          packSize: 9,
        },
      });
      createdIds.setId = set.id;
      const setCard = await prisma.setCard.create({
        data: {
          setId: set.id,
          cardId: card.id,
          setCode: `${tag}-001`,
          rarity: "Common",
        },
      });

      const [runAEntry, runBEntry] = await Promise.all([
        prisma.collectionEntry.create({
          data: {
            userId: owner.id,
            runId: runA.id,
            cardId: card.id,
            setCardId: setCard.id,
            source: "MANUAL_GRANT",
          },
        }),
        prisma.collectionEntry.create({
          data: {
            userId: player.id,
            runId: runB.id,
            cardId: card.id,
            setCardId: setCard.id,
            source: "MANUAL_GRANT",
          },
        }),
      ]);

      await expect(getCollectionSnapshot({ viewerId: owner.id }, prisma)).resolves.toEqual(
        expect.objectContaining({
          totals: expect.objectContaining({
            totalCopies: 1,
          }),
          recentEntries: [expect.objectContaining({ id: runAEntry.id })],
        }),
      );

      await expect(
        createTradeOffer(prisma, owner.id, {
          responderDuelistId: player.duelistId,
          offeredEntryIds: [runAEntry.id],
          requestedEntryIds: [runBEntry.id],
          note: null,
        }),
      ).rejects.toMatchObject({
        status: 409,
      });

      const deck = await createDeck(prisma, owner.id, {
        name: `${tag} deck`,
      });
      expect(deck.runId).toBe(runA.id);

      await prisma.user.update({
        where: { id: owner.id },
        data: { activeRunId: runB.id },
      });

      await expect(
        updateDeckMetadata(prisma, owner.id, deck.id, {
          name: `${tag} moved deck`,
        }),
      ).rejects.toThrow("Deck wurde nicht gefunden.");

      await expect(
        createDuelRequest(prisma, owner.id, {
          opponentDuelistId: player.duelistId,
          requesterDeckId: deck.id,
        }),
      ).rejects.toThrow("Ausgewähltes Deck wurde nicht gefunden.");
    } finally {
      if (createdIds.runIds.length > 0) {
        await prisma.playGroupRun.deleteMany({
          where: {
            id: {
              in: createdIds.runIds,
            },
          },
        });
      }
      if (createdIds.ownerId || createdIds.playerId) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [createdIds.ownerId, createdIds.playerId].filter(Boolean) as string[],
            },
          },
        });
      }
      if (createdIds.setId) {
        await prisma.cardSet.deleteMany({ where: { id: createdIds.setId } });
      }
      if (createdIds.cardId) {
        await prisma.card.deleteMany({ where: { id: createdIds.cardId } });
      }
    }
  });
});
