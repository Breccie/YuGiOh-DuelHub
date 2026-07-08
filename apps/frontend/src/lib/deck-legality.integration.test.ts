import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";

const prisma = new PrismaClient();

describe("deck legality", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flags Genesys decks that exceed the point limit", async () => {
    const tag = `vitest-genesys-${Date.now()}`;
    const createdIds: {
      userId?: string;
      runId?: string;
      cardIds: string[];
      formatProfileId?: string;
    } = {
      cardIds: [],
    };

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: `${tag.toUpperCase()}-USER`,
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Genesys Tester",
        },
      });
      createdIds.userId = user.id;

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          startingCredits: 0,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
      });
      createdIds.runId = run.id;

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeRunId: run.id,
        },
      });

      const [card, linkCard] = await Promise.all([
        prisma.card.create({
          data: {
            slug: `${tag}-staple`,
            externalCardId: `${tag}-staple`,
            name: `${tag} Staple`,
            kind: CardKind.SPELL,
            currentOracleText: "Test card.",
          },
        }),
        prisma.card.create({
          data: {
            slug: `${tag}-link`,
            externalCardId: `${tag}-link`,
            name: `${tag} Link Monster`,
            kind: CardKind.MONSTER,
            monsterType: "Cyberse / Link",
            currentOracleText: "Test Link Monster.",
          },
        }),
      ]);
      createdIds.cardIds.push(card.id, linkCard.id);

      const formatProfile = await prisma.formatProfile.create({
        data: {
          slug: `${tag}-genesys`,
          name: `${tag} Genesys`,
          type: "CUSTOM",
          region: "TCG",
          defaultErrataPolicy: "USE_LATEST_TEXT",
        },
      });
      createdIds.formatProfileId = formatProfile.id;

      const banlist = await prisma.banlist.create({
        data: {
          formatProfileId: formatProfile.id,
          name: `${tag} Genesys Points`,
          effectiveFrom: new Date("2026-06-23T00:00:00.000Z"),
          errataPolicy: "USE_LATEST_TEXT",
          pointLimit: 100,
          entries: {
            create: [
              {
                cardId: card.id,
                allowedCopies: 3,
                pointValue: 60,
              },
              {
                cardId: linkCard.id,
                allowedCopies: 3,
                pointValue: 0,
              },
            ],
          },
        },
      });

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
          {
            userId: user.id,
            runId: run.id,
            cardId: linkCard.id,
            source: "MANUAL_GRANT",
          },
        ],
      });

      const deck = await prisma.deck.create({
        data: {
          userId: user.id,
          runId: run.id,
          formatProfileId: formatProfile.id,
          banlistId: banlist.id,
          name: `${tag} deck`,
          cards: {
            create: [
              {
                cardId: card.id,
                section: "MAIN",
                quantity: 2,
              },
              {
                cardId: linkCard.id,
                section: "EXTRA",
                quantity: 1,
              },
            ],
          },
        },
      });

      const snapshot = await getDeckLegalitySnapshot(
        {
          viewerId: user.id,
          deckId: deck.id,
        },
        prisma,
      );

      expect(snapshot.activeDeck).toEqual(
        expect.objectContaining({
          pointLimit: 100,
          pointTotal: 120,
          usesPointLimit: true,
          isLegal: false,
        }),
      );
      expect(snapshot.activeDeck?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "POINTS",
          }),
          expect.objectContaining({
            cardId: linkCard.id,
            type: "BANLIST",
          }),
        ]),
      );
      expect(
        snapshot.editor.collectionCards.find((entry) => entry.cardId === card.id),
      ).toEqual(
        expect.objectContaining({
          pointValue: 60,
        }),
      );
      expect(
        snapshot.editor.collectionCards.find((entry) => entry.cardId === linkCard.id),
      ).toEqual(
        expect.objectContaining({
          legalLimit: 0,
          pointValue: 0,
        }),
      );
    } finally {
      if (createdIds.runId) {
        await prisma.playGroupRun.deleteMany({
          where: {
            id: createdIds.runId,
          },
        });
      }

      if (createdIds.userId) {
        await prisma.user.deleteMany({
          where: {
            id: createdIds.userId,
          },
        });
      }

      if (createdIds.formatProfileId) {
        await prisma.formatProfile.deleteMany({
          where: {
            id: createdIds.formatProfileId,
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
  });
});
