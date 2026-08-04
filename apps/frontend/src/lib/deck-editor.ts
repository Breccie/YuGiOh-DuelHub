import { DeckSection, type PrismaClient } from "@prisma/client";
import { DomainError } from "@ygo/domain";
import { getActiveRun } from "@/lib/run-service";
import { defaultDeckBoxKey } from "@/lib/deckbox-config";
import { resolveOwnedMediaAsset } from "@/lib/media-service";

const MAX_COPIES_PER_CARD_IDENTITY = 3;

function deckCopyLimitError(cardId: string, requestedTotal: number) {
  return new DomainError({
    code: "deck_card_copy_limit_exceeded",
    message:
      "Von einer Kartenidentität sind höchstens drei Kopien über Main, Extra und Side erlaubt.",
    status: 409,
    details: {
      cardId,
      maximum: MAX_COPIES_PER_CARD_IDENTITY,
      requestedTotal,
    },
  });
}

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
    deckBoxKey?: string;
    deckBoxAssetId?: string | null;
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
  await resolveOwnedMediaAsset(prisma, viewer.id, input.deckBoxAssetId, "DECKBOX");

  const deck = await prisma.deck.create({
    data: {
      userId: viewer.id,
      runId: activeRun.id,
      name,
      deckBoxKey: input.deckBoxKey ?? defaultDeckBoxKey,
      deckBoxAssetId: input.deckBoxAssetId ?? null,
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
    deckBoxKey?: string;
    deckBoxAssetId?: string | null;
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
  if (input.deckBoxAssetId !== undefined) {
    await resolveOwnedMediaAsset(prisma, viewer.id, input.deckBoxAssetId, "DECKBOX");
  }

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
      deckBoxKey: input.deckBoxKey ?? defaultDeckBoxKey,
      ...(input.deckBoxAssetId !== undefined ? { deckBoxAssetId: input.deckBoxAssetId } : {}),
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

export async function duplicateDeck(
  prisma: PrismaClient,
  viewerId: string,
  deckId: string,
) {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new DomainError({
      code: "viewer_not_found",
      message: "Spielerprofil wurde nicht gefunden.",
      status: 404,
    });
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  const sourceDeck = await prisma.deck.findFirst({
    where: {
      id: deckId,
      userId: viewer.id,
      runId: activeRun.id,
    },
    include: {
      cards: {
        select: {
          cardId: true,
          section: true,
          quantity: true,
        },
      },
    },
  });

  if (!sourceDeck) {
    throw new DomainError({
      code: "deck_not_found",
      message: "Deck wurde nicht gefunden.",
      status: 404,
    });
  }

  return prisma.deck.create({
    data: {
      userId: viewer.id,
      runId: activeRun.id,
      name: `${sourceDeck.name} Kopie`,
      deckBoxKey: sourceDeck.deckBoxKey,
      deckBoxAssetId: sourceDeck.deckBoxAssetId,
      formatProfileId: sourceDeck.formatProfileId,
      banlistId: sourceDeck.banlistId,
      snapshotDate: sourceDeck.snapshotDate,
      cards: {
        create: sourceDeck.cards.map((card) => ({
          cardId: card.cardId,
          section: card.section,
          quantity: card.quantity,
        })),
      },
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
    throw new DomainError({
      code: "viewer_not_found",
      message: "Spielerprofil wurde nicht gefunden.",
      status: 404,
    });
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  if (!input.cardId) {
    throw new DomainError({
      code: "card_required",
      message: "Keine Karte ausgewählt.",
      status: 400,
    });
  }

  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > MAX_COPIES_PER_CARD_IDENTITY
  ) {
    throw new DomainError({
      code: "deck_card_quantity_invalid",
      message: "Die Menge muss zwischen 1 und 3 liegen.",
      status: 400,
      details: {
        minimum: 1,
        maximum: MAX_COPIES_PER_CARD_IDENTITY,
        received: input.quantity,
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    // Updating the parent deck gives every writer for this deck the same database
    // lock row. The aggregate below therefore observes all previously committed
    // section changes before deciding whether the requested total is valid.
    const lockedDeck = await tx.deck.updateMany({
      where: {
        id: deckId,
        userId: viewer.id,
        runId: activeRun.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    if (lockedDeck.count !== 1) {
      throw new DomainError({
        code: "deck_not_found",
        message: "Deck wurde nicht gefunden.",
        status: 404,
      });
    }

    const card = await tx.card.findUnique({
      where: {
        id: input.cardId,
      },
      select: {
        id: true,
      },
    });

    if (!card) {
      throw new DomainError({
        code: "card_not_found",
        message: "Die ausgewählte Karte wurde nicht gefunden.",
        status: 404,
      });
    }

    const copiesInOtherSections = await tx.deckCard.aggregate({
      where: {
        deckId,
        cardId: input.cardId,
        section: { not: input.section },
      },
      _sum: { quantity: true },
    });
    const requestedTotal =
      (copiesInOtherSections._sum.quantity ?? 0) + input.quantity;

    if (requestedTotal > MAX_COPIES_PER_CARD_IDENTITY) {
      throw deckCopyLimitError(input.cardId, requestedTotal);
    }

    return tx.deckCard.upsert({
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

export async function moveDeckCard(
  prisma: PrismaClient,
  viewerId: string,
  deckId: string,
  input: {
    cardId: string;
    fromSection: DeckSection;
    toSection: DeckSection;
    quantity: number;
  },
) {
  if (input.fromSection === input.toSection) {
    throw new DomainError({
      code: "deck_card_move_same_section",
      message: "Quelle und Ziel der Kartenverschiebung sind identisch.",
      status: 400,
    });
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 3) {
    throw new DomainError({
      code: "deck_card_move_quantity_invalid",
      message: "Es können zwischen einer und drei Kopien verschoben werden.",
      status: 400,
    });
  }

  const viewer = await prisma.user.findUnique({ where: { id: viewerId } });
  if (!viewer) {
    throw new DomainError({
      code: "viewer_not_found",
      message: "Spielerprofil wurde nicht gefunden.",
      status: 404,
    });
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  return prisma.$transaction(async (tx) => {
    const lockedDeck = await tx.deck.updateMany({
      where: {
        id: deckId,
        userId: viewer.id,
        runId: activeRun.id,
      },
      data: { updatedAt: new Date() },
    });

    if (lockedDeck.count !== 1) {
      throw new DomainError({
        code: "deck_not_found",
        message: "Deck wurde nicht gefunden.",
        status: 404,
      });
    }

    const [source, target] = await Promise.all([
      tx.deckCard.findUnique({
        where: {
          deckId_cardId_section: {
            deckId,
            cardId: input.cardId,
            section: input.fromSection,
          },
        },
      }),
      tx.deckCard.findUnique({
        where: {
          deckId_cardId_section: {
            deckId,
            cardId: input.cardId,
            section: input.toSection,
          },
        },
      }),
    ]);

    if (!source || source.quantity < input.quantity) {
      throw new DomainError({
        code: "deck_card_move_source_missing",
        message: "Im Quellbereich sind nicht genügend Kopien vorhanden.",
        status: 409,
      });
    }

    const nextTargetQuantity = (target?.quantity ?? 0) + input.quantity;
    if (nextTargetQuantity > MAX_COPIES_PER_CARD_IDENTITY) {
      throw deckCopyLimitError(input.cardId, nextTargetQuantity);
    }

    if (source.quantity === input.quantity) {
      await tx.deckCard.delete({ where: { id: source.id } });
    } else {
      await tx.deckCard.update({
        where: { id: source.id },
        data: { quantity: source.quantity - input.quantity },
      });
    }

    return tx.deckCard.upsert({
      where: {
        deckId_cardId_section: {
          deckId,
          cardId: input.cardId,
          section: input.toSection,
        },
      },
      update: { quantity: nextTargetQuantity },
      create: {
        deckId,
        cardId: input.cardId,
        section: input.toSection,
        quantity: input.quantity,
      },
    });
  });
}
