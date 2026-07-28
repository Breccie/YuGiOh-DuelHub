import { CardKind, PrismaClient } from "@prisma/client";
import { DomainError } from "@ygo/domain";
import { afterAll, describe, expect, it } from "vitest";
import { duplicateDeck, upsertDeckCard } from "@/lib/deck-editor";

const prisma = new PrismaClient();

type DeckFixture = {
  userId: string;
  runId: string;
  cardId: string;
  deckId: string;
};

async function createDeckFixture(label: string): Promise<DeckFixture> {
  const tag = `vitest-deck-copy-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      duelistId: `${tag}-USER`.toUpperCase(),
      email: `${tag}@example.test`,
      passwordHash: "test-hash",
      displayName: "Deck Copy Tester",
    },
  });
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
      currentOracleText: "Deck copy limit test card.",
    },
  });
  const deck = await prisma.deck.create({
    data: {
      userId: user.id,
      runId: run.id,
      name: `${tag} deck`,
      deckBoxKey: label === "duplicate" ? "void-eye" : "inferno-vortex",
    },
  });

  return {
    userId: user.id,
    runId: run.id,
    cardId: card.id,
    deckId: deck.id,
  };
}

async function deleteDeckFixture(fixture: DeckFixture) {
  await prisma.playGroupRun.deleteMany({ where: { id: fixture.runId } });
  await prisma.card.deleteMany({ where: { id: fixture.cardId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
}

function expectCopyLimitError(reason: unknown) {
  expect(reason).toBeInstanceOf(DomainError);
  expect(reason).toMatchObject({
    code: "deck_card_copy_limit_exceeded",
    status: 409,
  });
}

describe("deck card copy limit", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns a domain conflict when sections would exceed three copies", async () => {
    const fixture = await createDeckFixture("sequential");

    try {
      await upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
        cardId: fixture.cardId,
        section: "MAIN",
        quantity: 2,
      });

      await expect(
        upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
          cardId: fixture.cardId,
          section: "SIDE",
          quantity: 2,
        }),
      ).rejects.toMatchObject({
        code: "deck_card_copy_limit_exceeded",
        status: 409,
        details: {
          cardId: fixture.cardId,
          maximum: 3,
          requestedTotal: 4,
        },
      });
    } finally {
      await deleteDeckFixture(fixture);
    }
  });

  it("serializes parallel section changes and commits at most three copies", async () => {
    const fixture = await createDeckFixture("parallel");

    try {
      await upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
        cardId: fixture.cardId,
        section: "MAIN",
        quantity: 1,
      });

      const results = await Promise.allSettled([
        upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
          cardId: fixture.cardId,
          section: "EXTRA",
          quantity: 2,
        }),
        upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
          cardId: fixture.cardId,
          section: "SIDE",
          quantity: 2,
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      if (!rejected || rejected.status !== "rejected") {
        throw new Error("Ein paralleles Deckupdate hätte abgelehnt werden müssen.");
      }
      expectCopyLimitError(rejected.reason);

      const persisted = await prisma.deckCard.aggregate({
        where: {
          deckId: fixture.deckId,
          cardId: fixture.cardId,
        },
        _sum: { quantity: true },
      });
      expect(persisted._sum.quantity).toBe(3);
    } finally {
      await deleteDeckFixture(fixture);
    }
  });

  it("duplicates deck metadata and cards inside the active campaign", async () => {
    const fixture = await createDeckFixture("duplicate");

    try {
      await upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
        cardId: fixture.cardId,
        section: "MAIN",
        quantity: 2,
      });

      const duplicated = await duplicateDeck(
        prisma,
        fixture.userId,
        fixture.deckId,
      );
      const persisted = await prisma.deck.findUniqueOrThrow({
        where: { id: duplicated.id },
        include: { cards: true },
      });

      expect(persisted.id).not.toBe(fixture.deckId);
      expect(persisted.runId).toBe(fixture.runId);
      expect(persisted.name).toMatch(/ Kopie$/);
      expect(persisted.deckBoxKey).toBe("void-eye");
      expect(persisted.cards).toMatchObject([
        {
          cardId: fixture.cardId,
          section: "MAIN",
          quantity: 2,
        },
      ]);
    } finally {
      await deleteDeckFixture(fixture);
    }
  });
});
