import {
  CardKind,
  DeckSection,
  EntryLockState,
  ErrataPolicy,
  type PrismaClient,
} from "@prisma/client";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

type LoadedDeck = Awaited<ReturnType<typeof loadDecks>>[number];
type OwnershipSummary = {
  cardName: string;
  kind: CardKind;
  monsterType: string | null;
  imageUrl: string | null;
  currentOracleText: string | null;
  firstErrataDate: Date | null;
  totalCopies: number;
  availableCopies: number;
  reservedCopies: number;
  tradedCopies: number;
};

export type DeckIssueType =
  | "BANLIST"
  | "ERRATA"
  | "OWNERSHIP"
  | "DECK_SIZE"
  | "POINTS";

export type DeckIssueSummary = {
  cardId: string;
  cardName: string;
  type: DeckIssueType;
  message: string;
};

export type DeckCardResolution = {
  cardId: string;
  cardName: string;
  kind: CardKind;
  monsterType: string | null;
  imageUrl: string | null;
  section: DeckSection;
  quantity: number;
  allowedCopies: number;
  pointValue: number;
  availableCopies: number;
  reservedCopies: number;
  tradedCopies: number;
  activeTextLabel: string;
  activeTextSnippet: string;
  errataCutoff: string | null;
  issues: DeckIssueType[];
};

export type DeckLegalitySnapshot = {
  viewer: {
    id: string;
    displayName: string;
  };
  selectedDeckId: string | null;
  decks: Array<{
    id: string;
    name: string;
    snapshotDate: string | null;
    updatedAt: string;
    cardCount: number;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    formatName: string | null;
    banlistName: string | null;
    isLegal: boolean;
    issueCount: number;
  }>;
  activeDeck: null | {
    id: string;
    name: string;
    snapshotDate: string;
    updatedAt: string;
    formatName: string | null;
    banlistId: string | null;
    banlistName: string;
    pointLimit: number | null;
    pointTotal: number;
    usesPointLimit: boolean;
    errataPolicy: ErrataPolicy;
    isLegal: boolean;
    cardCount: number;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    issues: DeckIssueSummary[];
    cards: DeckCardResolution[];
  };
  editor: {
    availableBanlists: Array<{
      id: string;
      name: string;
      effectiveFrom: string;
      formatName: string;
      formatProfileId: string;
      errataPolicy: ErrataPolicy;
      pointLimit: number | null;
    }>;
    collectionCards: Array<{
      cardId: string;
      name: string;
      kind: CardKind;
      monsterType: string | null;
      imageUrl: string | null;
      oracleText: string | null;
      errataCutoff: string | null;
      totalCopies: number;
      availableCopies: number;
      reservedCopies: number;
      tradedCopies: number;
      deckCopies: number;
      mainCopies: number;
      extraCopies: number;
      sideCopies: number;
      legalLimit: number;
      pointValue: number;
    }>;
  };
};

function toIsoDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function clampSnippet(text: string | null) {
  if (!text) {
    return "Kein Text-Snapshot verfügbar.";
  }

  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

async function loadDecks(prisma: PrismaClient, userId: string, runId: string) {
  return prisma.deck.findMany({
    where: {
      userId,
      runId,
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    include: {
      cards: {
        orderBy: [
          {
            section: "asc",
          },
          {
            card: {
              name: "asc",
            },
          },
        ],
        include: {
          card: {
            include: {
              textVersions: {
                orderBy: {
                  effectiveFrom: "asc",
                },
              },
            },
          },
        },
      },
      banlist: {
        include: {
          formatProfile: true,
          entries: true,
        },
      },
      formatProfile: {
        include: {
          banlists: {
            orderBy: {
              effectiveFrom: "desc",
            },
            include: {
              entries: true,
            },
          },
        },
      },
    },
  });
}

async function loadAvailableBanlists(prisma: PrismaClient) {
  return prisma.banlist.findMany({
    orderBy: [
      {
        effectiveFrom: "desc",
      },
      {
        name: "asc",
      },
    ],
    include: {
      formatProfile: true,
    },
  });
}

function resolveSnapshotDate(
  deck: LoadedDeck,
  effectiveBanlist:
    | NonNullable<LoadedDeck["banlist"]>
    | NonNullable<LoadedDeck["formatProfile"]>["banlists"][number]
    | null,
) {
  return (
    deck.snapshotDate ??
    effectiveBanlist?.effectiveFrom ??
    deck.formatProfile?.startDate ??
    deck.updatedAt
  );
}

function resolveBanlist(deck: LoadedDeck, snapshotDate: Date) {
  if (deck.banlist) {
    return deck.banlist;
  }

  return (
    deck.formatProfile?.banlists.find((banlist) => banlist.effectiveFrom <= snapshotDate) ??
    deck.formatProfile?.banlists.at(0) ??
    null
  );
}

function resolveErrataPolicy(
  deck: LoadedDeck,
  banlist: ReturnType<typeof resolveBanlist>,
) {
  return (
    banlist?.errataPolicy ??
    deck.formatProfile?.defaultErrataPolicy ??
    ErrataPolicy.BAN_ON_ERRATA
  );
}

function resolveTextVersion(
  versions: LoadedDeck["cards"][number]["card"]["textVersions"],
  snapshotDate: Date,
  policy: ErrataPolicy,
) {
  if (versions.length === 0) {
    return null;
  }

  if (policy === ErrataPolicy.USE_LATEST_TEXT) {
    return versions.at(-1) ?? null;
  }

  return (
    [...versions]
      .reverse()
      .find((version) => {
        const from = version.effectiveFrom.getTime();
        const to = version.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
        const current = snapshotDate.getTime();

        return current >= from && current < to;
      }) ?? versions.at(-1) ?? null
  );
}

function getFirstErrataDate(
  versions: LoadedDeck["cards"][number]["card"]["textVersions"],
) {
  return (
    versions
      .filter((version) => version.isErrata)
      .sort(
        (left, right) =>
          left.effectiveFrom.getTime() - right.effectiveFrom.getTime(),
      )
      .at(0)?.effectiveFrom ?? null
  );
}

function buildDeckCounts(deck: LoadedDeck) {
  return deck.cards.reduce(
    (summary, deckCard) => {
      summary.cardCount += deckCard.quantity;

      if (deckCard.section === "MAIN") {
        summary.mainCount += deckCard.quantity;
      } else if (deckCard.section === "EXTRA") {
        summary.extraCount += deckCard.quantity;
      } else if (deckCard.section === "SIDE") {
        summary.sideCount += deckCard.quantity;
      }

      return summary;
    },
    {
      cardCount: 0,
      mainCount: 0,
      extraCount: 0,
      sideCount: 0,
    },
  );
}

function buildPlannedCopiesByCardId(deck: LoadedDeck) {
  const plannedCopiesByCardId = new Map<string, number>();

  for (const deckCard of deck.cards) {
    plannedCopiesByCardId.set(
      deckCard.cardId,
      (plannedCopiesByCardId.get(deckCard.cardId) ?? 0) + deckCard.quantity,
    );
  }

  return plannedCopiesByCardId;
}

function addDeckSizeIssues(
  issues: DeckIssueSummary[],
  counts: ReturnType<typeof buildDeckCounts>,
) {
  if (counts.mainCount < 40 || counts.mainCount > 60) {
    issues.push({
      cardId: "deck-size-main",
      cardName: "Deckgröße",
      type: "DECK_SIZE",
      message: "Das Main Deck muss zwischen 40 und 60 Karten enthalten.",
    });
  }

  if (counts.extraCount > 15) {
    issues.push({
      cardId: "deck-size-extra",
      cardName: "Deckgröße",
      type: "DECK_SIZE",
      message: "Das Extra Deck darf höchstens 15 Karten enthalten.",
    });
  }

  if (counts.sideCount > 15) {
    issues.push({
      cardId: "deck-size-side",
      cardName: "Deckgröße",
      type: "DECK_SIZE",
      message: "Das Side Deck darf höchstens 15 Karten enthalten.",
    });
  }
}

function dedupeIssues(issues: DeckIssueSummary[]) {
  return issues.filter(
    (issue, index, allIssues) =>
      allIssues.findIndex(
        (candidate) =>
          candidate.cardId === issue.cardId &&
          candidate.type === issue.type &&
          candidate.message === issue.message,
      ) === index,
  );
}

function evaluateDeck(
  deck: LoadedDeck,
  ownershipByCardId: Map<string, OwnershipSummary>,
) {
  const snapshotDate = resolveSnapshotDate(
    deck,
    deck.banlist ?? deck.formatProfile?.banlists.at(0) ?? null,
  );
  const effectiveBanlist = resolveBanlist(deck, snapshotDate);
  const errataPolicy = resolveErrataPolicy(deck, effectiveBanlist);
  const counts = buildDeckCounts(deck);
  const plannedCopiesByCardId = buildPlannedCopiesByCardId(deck);
  const issues: DeckIssueSummary[] = [];
  const pointLimit = effectiveBanlist?.pointLimit ?? null;
  let pointTotal = 0;

  addDeckSizeIssues(issues, counts);

  const cards = deck.cards.map((deckCard) => {
    const activeTextVersion = resolveTextVersion(
      deckCard.card.textVersions,
      snapshotDate,
      errataPolicy,
    );
    const firstErrataDate = getFirstErrataDate(deckCard.card.textVersions);
    const ownership = ownershipByCardId.get(deckCard.cardId) ?? {
      cardName: deckCard.card.name,
      kind: deckCard.card.kind,
      monsterType: deckCard.card.monsterType,
      imageUrl: getCardAssetUrl(deckCard.card.externalCardId),
      firstErrataDate: getFirstErrataDate(deckCard.card.textVersions),
      totalCopies: 0,
      availableCopies: 0,
      reservedCopies: 0,
      tradedCopies: 0,
    };
    const errataBan =
      errataPolicy === ErrataPolicy.BAN_ON_ERRATA &&
      firstErrataDate !== null &&
      firstErrataDate.getTime() <= snapshotDate.getTime();
    const banlistEntry = effectiveBanlist?.entries.find(
      (entry) => entry.cardId === deckCard.cardId,
    );
    const allowedCopies = errataBan ? 0 : banlistEntry?.allowedCopies ?? 3;
    const pointValue = banlistEntry?.pointValue ?? 0;
    const plannedCopies = plannedCopiesByCardId.get(deckCard.cardId) ?? deckCard.quantity;
    const cardIssues: DeckIssueType[] = [];

    pointTotal += pointValue * deckCard.quantity;

    if (errataBan) {
      cardIssues.push("ERRATA");
      issues.push({
        cardId: deckCard.cardId,
        cardName: deckCard.card.name,
        type: "ERRATA",
        message:
          "Diese Karte wird in diesem Format ab dem Errata-Datum automatisch illegal.",
      });
    } else if (plannedCopies > allowedCopies) {
      cardIssues.push("BANLIST");
      issues.push({
        cardId: deckCard.cardId,
        cardName: deckCard.card.name,
        type: "BANLIST",
        message: `Im Deck sind ${plannedCopies} Kopien über alle Bereiche geplant, erlaubt sind nur ${allowedCopies}.`,
      });
    }

    if (plannedCopies > ownership.availableCopies) {
      cardIssues.push("OWNERSHIP");
      issues.push({
        cardId: deckCard.cardId,
        cardName: deckCard.card.name,
        type: "OWNERSHIP",
        message: `Im Deck sind ${plannedCopies} Kopien über alle Bereiche geplant, aber verfügbar sind nur ${ownership.availableCopies}.`,
      });
    }

    return {
      cardId: deckCard.cardId,
      cardName: deckCard.card.name,
      kind: deckCard.card.kind,
      monsterType: deckCard.card.monsterType,
      imageUrl: ownership.imageUrl,
      section: deckCard.section,
      quantity: deckCard.quantity,
      allowedCopies,
      pointValue,
      availableCopies: ownership.availableCopies,
      reservedCopies: ownership.reservedCopies,
      tradedCopies: ownership.tradedCopies,
      activeTextLabel: activeTextVersion?.label ?? "Kein Textstand",
      activeTextSnippet: clampSnippet(
        activeTextVersion?.effectText ?? deckCard.card.currentOracleText,
      ),
      errataCutoff: firstErrataDate ? toIsoDateString(firstErrataDate) : null,
      issues: cardIssues,
    } satisfies DeckCardResolution;
  });

  if (pointLimit !== null && pointTotal > pointLimit) {
    issues.push({
      cardId: "deck-points",
      cardName: "Genesys-Punkte",
      type: "POINTS",
      message: `Das Deck hat ${pointTotal} Genesys-Punkte, erlaubt sind maximal ${pointLimit}.`,
    });
  }

  return {
    snapshotDate,
    effectiveBanlist,
    errataPolicy,
    pointLimit,
    pointTotal,
    counts,
    cards,
    issues: dedupeIssues(issues),
  };
}

export async function getDeckLegalitySnapshot(options: {
  viewerId: string;
  deckId?: string;
},
prisma: PrismaClient = getPrisma()): Promise<DeckLegalitySnapshot> {
  const viewer = await prisma.user.findUnique({
    where: {
      id: options.viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const activeRun = await getActiveRun(prisma, viewer.id);

  const [decks, collectionEntries, availableBanlists] = await Promise.all([
    loadDecks(prisma, viewer.id, activeRun.id),
    prisma.collectionEntry.findMany({
      where: {
        userId: viewer.id,
        runId: activeRun.id,
      },
      select: {
        cardId: true,
        lockState: true,
        card: {
          select: {
            name: true,
            kind: true,
            monsterType: true,
            externalCardId: true,
            currentOracleText: true,
            textVersions: {
              select: {
                effectiveFrom: true,
                isErrata: true,
              },
              orderBy: {
                effectiveFrom: "asc",
              },
            },
          },
        },
      },
    }),
    loadAvailableBanlists(prisma),
  ]);

  const selectedDeck =
    decks.find((deck) => deck.id === options.deckId) ??
    decks[0] ??
    null;

  const ownershipByCardId = new Map<string, OwnershipSummary>();

  for (const entry of collectionEntries) {
    if (!ownershipByCardId.has(entry.cardId)) {
      const firstErrataDate =
        entry.card.textVersions.find((version) => version.isErrata)?.effectiveFrom ?? null;

      ownershipByCardId.set(entry.cardId, {
        cardName: entry.card.name,
        kind: entry.card.kind,
        monsterType: entry.card.monsterType,
        imageUrl: getCardAssetUrl(entry.card.externalCardId),
        currentOracleText: entry.card.currentOracleText,
        firstErrataDate,
        totalCopies: 0,
        availableCopies: 0,
        reservedCopies: 0,
        tradedCopies: 0,
      });
    }

    const bucket = ownershipByCardId.get(entry.cardId)!;
    bucket.totalCopies += 1;

    if (entry.lockState === EntryLockState.AVAILABLE) {
      bucket.availableCopies += 1;
    } else if (entry.lockState === EntryLockState.RESERVED) {
      bucket.reservedCopies += 1;
    } else if (entry.lockState === EntryLockState.TRADED) {
      bucket.tradedCopies += 1;
    }
  }

  const summarizedDecks = decks.map((deck) => {
    const evaluation = evaluateDeck(deck, ownershipByCardId);

    return {
      id: deck.id,
      name: deck.name,
      snapshotDate: deck.snapshotDate?.toISOString() ?? evaluation.snapshotDate.toISOString(),
      updatedAt: deck.updatedAt.toISOString(),
      cardCount: evaluation.counts.cardCount,
      mainCount: evaluation.counts.mainCount,
      extraCount: evaluation.counts.extraCount,
      sideCount: evaluation.counts.sideCount,
      formatName: deck.formatProfile?.name ?? null,
      banlistName: evaluation.effectiveBanlist?.name ?? null,
      isLegal: evaluation.issues.length === 0,
      issueCount: evaluation.issues.length,
    };
  });

  const activeEvaluation = selectedDeck
    ? evaluateDeck(selectedDeck, ownershipByCardId)
    : null;
  const activeDeckCardCopies = new Map<
    string,
    {
      total: number;
      main: number;
      extra: number;
      side: number;
    }
  >();

  if (selectedDeck) {
    for (const deckCard of selectedDeck.cards) {
      const currentCopies = activeDeckCardCopies.get(deckCard.cardId) ?? {
        total: 0,
        main: 0,
        extra: 0,
        side: 0,
      };

      currentCopies.total += deckCard.quantity;

      if (deckCard.section === "MAIN") {
        currentCopies.main += deckCard.quantity;
      } else if (deckCard.section === "EXTRA") {
        currentCopies.extra += deckCard.quantity;
      } else if (deckCard.section === "SIDE") {
        currentCopies.side += deckCard.quantity;
      }

      activeDeckCardCopies.set(deckCard.cardId, currentCopies);
    }
  }

  const activeBanlistAllowanceByCardId = new Map<string, number>(
    activeEvaluation?.effectiveBanlist?.entries.map((entry) => [
      entry.cardId,
      entry.allowedCopies,
    ]) ?? [],
  );
  const activeBanlistPointsByCardId = new Map<string, number>(
    activeEvaluation?.effectiveBanlist?.entries.map((entry) => [
      entry.cardId,
      entry.pointValue ?? 0,
    ]) ?? [],
  );

  const editor = {
    availableBanlists: availableBanlists.map((banlist) => ({
      id: banlist.id,
      name: banlist.name,
      effectiveFrom: banlist.effectiveFrom.toISOString(),
      formatName: banlist.formatProfile.name,
      formatProfileId: banlist.formatProfileId,
      errataPolicy:
        banlist.errataPolicy ?? banlist.formatProfile.defaultErrataPolicy,
      pointLimit: banlist.pointLimit,
    })),
    collectionCards: [...ownershipByCardId.entries()]
      .map(([cardId, ownership]) => {
        const activeCopies = activeDeckCardCopies.get(cardId) ?? {
          total: 0,
          main: 0,
          extra: 0,
          side: 0,
        };
        const errataBlocked =
          activeEvaluation?.errataPolicy === ErrataPolicy.BAN_ON_ERRATA &&
          ownership.firstErrataDate !== null &&
          activeEvaluation.snapshotDate.getTime() >= ownership.firstErrataDate.getTime();

        return {
          cardId,
          name: ownership.cardName,
          kind: ownership.kind,
          monsterType: ownership.monsterType,
          imageUrl: ownership.imageUrl,
          oracleText: ownership.currentOracleText,
          errataCutoff: ownership.firstErrataDate
            ? toIsoDateString(ownership.firstErrataDate)
            : null,
          totalCopies: ownership.totalCopies,
          availableCopies: ownership.availableCopies,
          reservedCopies: ownership.reservedCopies,
          tradedCopies: ownership.tradedCopies,
          deckCopies: activeCopies.total,
          mainCopies: activeCopies.main,
          extraCopies: activeCopies.extra,
          sideCopies: activeCopies.side,
          legalLimit: errataBlocked
            ? 0
            : activeBanlistAllowanceByCardId.get(cardId) ?? 3,
          pointValue: activeBanlistPointsByCardId.get(cardId) ?? 0,
        };
      })
      .sort((left, right) => {
        if (right.availableCopies !== left.availableCopies) {
          return right.availableCopies - left.availableCopies;
        }

        return left.name.localeCompare(right.name, "de");
      }),
  };

  if (!selectedDeck || !activeEvaluation) {
    return {
      viewer: {
        id: viewer.id,
        displayName: viewer.displayName,
      },
      selectedDeckId: null,
      decks: summarizedDecks,
      activeDeck: null,
      editor,
    };
  }

  return {
    viewer: {
      id: viewer.id,
      displayName: viewer.displayName,
    },
    selectedDeckId: selectedDeck.id,
    decks: summarizedDecks,
    activeDeck: {
      id: selectedDeck.id,
      name: selectedDeck.name,
      snapshotDate:
        selectedDeck.snapshotDate?.toISOString() ??
        activeEvaluation.snapshotDate.toISOString(),
      updatedAt: selectedDeck.updatedAt.toISOString(),
      formatName: selectedDeck.formatProfile?.name ?? null,
      banlistId: activeEvaluation.effectiveBanlist?.id ?? selectedDeck.banlistId ?? null,
      banlistName: activeEvaluation.effectiveBanlist?.name ?? "Keine Bannliste gewählt",
      pointLimit: activeEvaluation.pointLimit,
      pointTotal: activeEvaluation.pointTotal,
      usesPointLimit: activeEvaluation.pointLimit !== null,
      errataPolicy: activeEvaluation.errataPolicy,
      isLegal: activeEvaluation.issues.length === 0,
      cardCount: activeEvaluation.counts.cardCount,
      mainCount: activeEvaluation.counts.mainCount,
      extraCount: activeEvaluation.counts.extraCount,
      sideCount: activeEvaluation.counts.sideCount,
      issues: activeEvaluation.issues,
      cards: activeEvaluation.cards,
    },
    editor,
  };
}
