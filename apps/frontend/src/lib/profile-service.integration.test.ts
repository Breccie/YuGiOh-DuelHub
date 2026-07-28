import { CardKind, EntryLockState, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getPublicProfileByDuelistId } from "@/lib/profile-service";

const prisma = new PrismaClient();

describe("public profile metrics", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("uses real deck and collection data while excluding traded copies", async () => {
    const tag = `vitest-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        duelistId: `${tag}-user`.toUpperCase(),
        email: `${tag}@example.test`,
        passwordHash: "test-hash",
        displayName: "Profile Metrics",
        bio: "Control Duelist",
        favoriteEra: "GX",
      },
    });
    const run = await prisma.playGroupRun.create({
      data: {
        ownerId: user.id,
        name: `${tag} Run`,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { activeRunId: run.id },
    });
    const cards = await Promise.all(
      ["alpha", "beta"].map((label) =>
        prisma.card.create({
          data: {
            slug: `${tag}-${label}`,
            name: `${tag} ${label}`,
            kind: CardKind.MONSTER,
          },
        }),
      ),
    );

    try {
      await prisma.collectionEntry.createMany({
        data: [
          {
            userId: user.id,
            runId: run.id,
            cardId: cards[0].id,
            source: "MANUAL_GRANT",
            lockState: EntryLockState.AVAILABLE,
          },
          {
            userId: user.id,
            runId: run.id,
            cardId: cards[0].id,
            source: "MANUAL_GRANT",
            lockState: EntryLockState.RESERVED,
          },
          {
            userId: user.id,
            runId: run.id,
            cardId: cards[1].id,
            source: "MANUAL_GRANT",
            lockState: EntryLockState.TRADED,
          },
        ],
      });
      await prisma.deck.create({
        data: {
          userId: user.id,
          runId: run.id,
          name: "Void Control",
          deckBoxKey: "void-eye",
          cards: {
            create: [
              { cardId: cards[0].id, section: "MAIN", quantity: 2 },
              { cardId: cards[1].id, section: "SIDE", quantity: 1 },
            ],
          },
        },
      });

      const profile = await getPublicProfileByDuelistId(
        prisma,
        user.duelistId,
        user.id,
      );

      expect(profile.counts).toMatchObject({
        decks: 1,
        uniqueCards: 1,
        copies: 2,
      });
      expect(profile.decks[0]).toMatchObject({
        name: "Void Control",
        deckBoxKey: "void-eye",
        mainCount: 2,
        extraCount: 0,
        sideCount: 1,
        cardCount: 3,
      });
    } finally {
      await prisma.playGroupRun.deleteMany({ where: { id: run.id } });
      await prisma.card.deleteMany({
        where: { id: { in: cards.map((card) => card.id) } },
      });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
});
