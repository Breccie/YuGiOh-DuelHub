import { CardKind, PrismaClient } from "@prisma/client";
import { DomainError } from "@ygo/domain";
import { afterAll, describe, expect, it } from "vitest";
import {
  duplicateDeck,
  moveDeckCard,
  upsertDeckCard,
  updateDeckMetadata,
} from "@/lib/deck-editor";

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

  it("moves one copy between sections in a single transaction", async () => {
    const fixture = await createDeckFixture("move");

    try {
      await upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
        cardId: fixture.cardId,
        section: "MAIN",
        quantity: 2,
      });
      await upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
        cardId: fixture.cardId,
        section: "SIDE",
        quantity: 1,
      });

      await moveDeckCard(prisma, fixture.userId, fixture.deckId, {
        cardId: fixture.cardId,
        fromSection: "MAIN",
        toSection: "SIDE",
        quantity: 1,
      });

      const cards = await prisma.deckCard.findMany({
        where: { deckId: fixture.deckId, cardId: fixture.cardId },
        orderBy: { section: "asc" },
      });
      expect(cards).toMatchObject([
        { section: "MAIN", quantity: 1 },
        { section: "SIDE", quantity: 2 },
      ]);
    } finally {
      await deleteDeckFixture(fixture);
    }
  });

  it("rejects stale deck metadata revisions without overwriting the newer state", async () => {
    const fixture = await createDeckFixture("revision");

    try {
      const first = await updateDeckMetadata(prisma, fixture.userId, fixture.deckId, {
        name: "Bestätigter Name",
        revision: 0,
      });
      expect(first.revision).toBe(1);

      await expect(
        updateDeckMetadata(prisma, fixture.userId, fixture.deckId, {
          name: "Veralteter Name",
          revision: 0,
        }),
      ).rejects.toMatchObject({
        code: "deck_revision_conflict",
        status: 409,
        details: { currentRevision: 1 },
      });

      const persisted = await prisma.deck.findUniqueOrThrow({
        where: { id: fixture.deckId },
      });
      expect(persisted.name).toBe("Bestätigter Name");
      expect(persisted.revision).toBe(1);
    } finally {
      await deleteDeckFixture(fixture);
    }
  });

  it("locks an entered tournament deck against metadata and card changes", async () => {
    const fixture = await createDeckFixture("tournament-lock");

    try {
      const tournament = await prisma.tournament.create({
        data: {
          runId: fixture.runId,
          hostId: fixture.userId,
          title: "Locked deck tournament",
          status: "DRAFT",
          participants: {
            create: {
              userId: fixture.userId,
              status: "ACCEPTED",
              joinedAt: new Date(),
              checkedInAt: new Date(),
              registeredDeckId: fixture.deckId,
            },
          },
        },
      });

      await expect(
        updateDeckMetadata(prisma, fixture.userId, fixture.deckId, {
          name: "Nicht erlaubt",
          revision: 0,
        }),
      ).rejects.toMatchObject({ code: "tournament_deck_locked", status: 409 });
      await expect(
        upsertDeckCard(prisma, fixture.userId, fixture.deckId, {
          cardId: fixture.cardId,
          section: "MAIN",
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: "tournament_deck_locked", status: 409 });

      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await expect(
        updateDeckMetadata(prisma, fixture.userId, fixture.deckId, {
          name: "Nach Turnierende erlaubt",
          revision: 0,
        }),
      ).resolves.toMatchObject({ name: "Nach Turnierende erlaubt", revision: 1 });
    } finally {
      await deleteDeckFixture(fixture);
    }
  });
});
