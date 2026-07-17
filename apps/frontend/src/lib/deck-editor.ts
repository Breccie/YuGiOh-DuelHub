import { DeckSection, type PrismaClient } from "@prisma/client";
import { getActiveRun } from "@/lib/run-service";

function parseSnapshotDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Ungültiges Snapshot-Datum.");
  }

  return parsed;
}

async function requireOwnedDeck(
  prisma: PrismaClient,
  deckId: string,
  userId: string,
  runId: string,
) {
  const deck = await prisma.deck.findFirst({
    where: {
      id: deckId,
      userId,
      runId,
    },
  });

  if (!deck) {
    throw new Error("Deck wurde nicht gefunden.");
  }

  return deck;
}

async function resolveBanlist(prisma: PrismaClient, banlistId: string | null | undefined) {
  if (!banlistId) {
    return null;
  }

  const banlist = await prisma.banlist.findUnique({
    where: {
      id: banlistId,
    },
  });

  if (!banlist) {
    throw new Error("Gewählte Bannliste wurde nicht gefunden.");
  }

  return banlist;
}

export async function createDeck(
  prisma: PrismaClient,
  viewerId: string,
  input: {
    name: string;
    banlistId?: string | null;
    snapshotDate?: string | null;
  },
) {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const name = input.name.trim();

  if (!name) {
    throw new Error("Deckname darf nicht leer sein.");
  }

  const banlist = await resolveBanlist(prisma, input.banlistId);
  const snapshotDate =
    parseSnapshotDate(input.snapshotDate) ?? banlist?.effectiveFrom ?? null;
  const activeRun = await getActiveRun(prisma, viewer.id);

  const deck = await prisma.deck.create({
    data: {
      userId: viewer.id,
      runId: activeRun.id,
      name,
      formatProfileId: banlist?.formatProfileId ?? null,
      banlistId: banlist?.id ?? null,
      snapshotDate,
    },
  });

  return deck;
}

export async function updateDeckMetadata(
  prisma: PrismaClient,
  viewerId: string,
  deckId: string,
  input: {
    name: string;
    banlistId?: string | null;
    snapshotDate?: string | null;
  },
) {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  await requireOwnedDeck(prisma, deckId, viewer.id, activeRun.id);

  const name = input.name.trim();

  if (!name) {
    throw new Error("Deckname darf nicht leer sein.");
  }

  const banlist = await resolveBanlist(prisma, input.banlistId);
  const snapshotDate =
    parseSnapshotDate(input.snapshotDate) ?? banlist?.effectiveFrom ?? null;

  const deck = await prisma.deck.update({
    where: {
      id: deckId,
    },
    data: {
      name,
      formatProfileId: banlist?.formatProfileId ?? null,
      banlistId: banlist?.id ?? null,
      snapshotDate,
    },
  });

  return deck;
}

export async function deleteDeck(prisma: PrismaClient, viewerId: string, deckId: string) {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  await requireOwnedDeck(prisma, deckId, viewer.id, activeRun.id);

  await prisma.deck.delete({
    where: {
      id: deckId,
    },
  });
}

export async function upsertDeckCard(
  prisma: PrismaClient,
  viewerId: string,
  deckId: string,
  input: {
    cardId: string;
    section: DeckSection;
    quantity: number;
  },
) {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  await requireOwnedDeck(prisma, deckId, viewer.id, activeRun.id);

  if (!input.cardId) {
    throw new Error("Keine Karte ausgewählt.");
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 3) {
    throw new Error("Die Menge muss zwischen 1 und 3 liegen.");
  }

  const card = await prisma.card.findUnique({
    where: {
      id: input.cardId,
    },
  });

  if (!card) {
    throw new Error("Die ausgewählte Karte wurde nicht gefunden.");
  }

  const copiesInOtherSections = await prisma.deckCard.aggregate({
    where: {
      deckId,
      cardId: input.cardId,
      section: { not: input.section },
    },
    _sum: { quantity: true },
  });

  if ((copiesInOtherSections._sum.quantity ?? 0) + input.quantity > 3) {
    throw new Error(
      "Von einer Kartenidentität sind höchstens drei Kopien über Main, Extra und Side erlaubt.",
    );
  }

  return prisma.deckCard.upsert({
    where: {
      deckId_cardId_section: {
        deckId,
        cardId: input.cardId,
        section: input.section,
      },
    },
    update: {
      quantity: input.quantity,
    },
    create: {
      deckId,
      cardId: input.cardId,
      section: input.section,
      quantity: input.quantity,
    },
  });
}

export async function removeDeckCard(
  prisma: PrismaClient,
  viewerId: string,
  deckId: string,
  input: {
    cardId: string;
    section: DeckSection;
  },
) {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  await requireOwnedDeck(prisma, deckId, viewer.id, activeRun.id);

  await prisma.deckCard.deleteMany({
    where: {
      deckId,
      cardId: input.cardId,
      section: input.section,
    },
  });
}
