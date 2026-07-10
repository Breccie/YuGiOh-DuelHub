import type { PackSelectionResponse } from "@ygo/contracts";
import { getCardAssetUrl } from "@/lib/asset-urls";
import {
  binderCoverCatalog,
  getBinderCoverMeta,
  type BinderCoverKey,
} from "@/lib/collection-showcase-config";
import type { DeckLegalitySnapshot } from "@/lib/deck-legality";
import type { LocalSyncCache } from "@/lib/sync-cache";

type CachedRun = {
  id?: unknown;
  defaultPackPrice?: unknown;
  defaultDisplaySize?: unknown;
};

type CachedWallet = {
  balance?: unknown;
};

type CachedPackOpening = {
  setId?: unknown;
  openedAt?: unknown;
};

type CachedCollectionEntry = {
  id?: unknown;
  cardId?: unknown;
  acquiredAt?: unknown;
  source?: unknown;
  lockState?: unknown;
  card?: {
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    externalCardId?: unknown;
    kind?: unknown;
  };
  setCard?: {
    id?: unknown;
    setCode?: unknown;
    rarity?: unknown;
    set?: {
      code?: unknown;
      name?: unknown;
    } | null;
  } | null;
};

type CachedBinder = {
  id?: unknown;
  name?: unknown;
  coverKey?: unknown;
  description?: unknown;
  isActive?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type CachedDeck = {
  id?: unknown;
  name?: unknown;
  banlistId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  cards?: Array<{
    id?: unknown;
    cardId?: unknown;
    section?: unknown;
    quantity?: unknown;
    card?: {
      id?: unknown;
      name?: unknown;
      externalCardId?: unknown;
      kind?: unknown;
    };
  }>;
};

export type CachedDeckOverviewPayload = {
  viewer: {
    displayName: string;
  };
  collectionProgress: {
    owned: string;
    total: string;
  };
  latestBanlistName: string;
  selectedDeckId: string | null;
  decks: Array<{
    id: string;
    name: string;
    updatedAt: string;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    isLegal: boolean;
    issueCount: number;
    banlistName: string | null;
    previewImageUrl: string | null;
    previewLabel: string;
  }>;
  recentCollectionCards: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
    setCode: string | null;
  }>;
  activeDeck: DeckLegalitySnapshot["activeDeck"];
  availableBanlists: DeckLegalitySnapshot["editor"]["availableBanlists"];
  collectionCards: DeckLegalitySnapshot["editor"]["collectionCards"];
};

export type CachedCollectionPagePayload = {
  viewer: {
    id: string;
    displayName: string;
  };
  binders: Array<{
    id: string;
    name: string;
    coverKey: string;
    coverName: string;
    coverImageUrl: string;
    description: string;
    accentColor: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    pageCount: number;
    pages: Array<never>;
  }>;
  presets: [];
  totals: {
    totalCopies: number;
    uniqueCards: number;
    cardsWithDuplicates: number;
    availableCopies: number;
    reservedCopies: number;
    tradedCopies: number;
  };
  cards: Array<{
    cardId: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
    currentOracleText: string | null;
    totalCopies: number;
    availableCopies: number;
    reservedCopies: number;
    tradedCopies: number;
    latestAcquiredAt: string;
    printings: Array<{
      key: string;
      setLabel: string;
      setCode: string | null;
      rarity: string | null;
      copies: number;
    }>;
    sources: Array<{
      source: string;
      label: string;
      copies: number;
    }>;
  }>;
  recentEntries: Array<{
    id: string;
    acquiredAt: string;
    source: string;
    sourceLabel: string;
    lockState: "AVAILABLE" | "RESERVED" | "TRADED";
    card: {
      id: string;
      name: string;
      kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
      imageUrl: string | null;
    };
    printingLabel: string;
  }>;
  totalCards: number;
};

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function asCardKind(value: unknown): "MONSTER" | "SPELL" | "TRAP" | "TOKEN" {
  return value === "SPELL" || value === "TRAP" || value === "TOKEN"
    ? value
    : "MONSTER";
}

function asLockState(value: unknown): "AVAILABLE" | "RESERVED" | "TRADED" {
  return value === "RESERVED" || value === "TRADED" ? value : "AVAILABLE";
}

function asDeckSection(value: unknown): "MAIN" | "EXTRA" | "SIDE" {
  return value === "EXTRA" || value === "SIDE" ? value : "MAIN";
}

function getSourceLabel(source: string) {
  switch (source) {
    case "PACK_OPENING":
      return "Pack";
    case "TRADE":
      return "Tausch";
    case "ADMIN_IMPORT":
      return "Import";
    case "MANUAL_GRANT":
      return "Manuell";
    default:
      return source;
  }
}

function getPrintingLabel(entry: CachedCollectionEntry) {
  const code = asString(entry.setCard?.set?.code ?? entry.setCard?.setCode);
  const name = asString(entry.setCard?.set?.name);

  if (code && name) {
    return `${code} · ${name}`;
  }

  return "Ohne Set-Zuordnung";
}

export function buildCachedPackSelectionPayload(
  cache: LocalSyncCache,
): PackSelectionResponse | null {
  const bootstrap = cache.bootstrap;

  if (!bootstrap || bootstrap.catalog.packSets.length === 0) {
    return null;
  }

  const run = (bootstrap.run ?? {}) as CachedRun;
  const wallet = (bootstrap.wallet ?? {}) as CachedWallet;
  const defaultPackPrice = asNumber(run.defaultPackPrice, 100);
  const defaultDisplaySize = asNumber(run.defaultDisplaySize, 24);
  const unlockBySetId = new Map(
    bootstrap.catalog.runSetUnlocks.map((unlock) => [unlock.setId, unlock]),
  );
  const openingStatsBySetId = new Map<
    string,
    {
      totalOpened: number;
      lastOpenedAt: string | null;
    }
  >();

  for (const opening of cache.packOpenings as CachedPackOpening[]) {
    const setId = asString(opening.setId);

    if (!setId) {
      continue;
    }

    const openedAt = asString(opening.openedAt);
    const current = openingStatsBySetId.get(setId) ?? {
      totalOpened: 0,
      lastOpenedAt: null,
    };

    openingStatsBySetId.set(setId, {
      totalOpened: current.totalOpened + 1,
      lastOpenedAt:
        openedAt && (!current.lastOpenedAt || openedAt > current.lastOpenedAt)
          ? openedAt
          : current.lastOpenedAt,
    });
  }

  const sortedSets = [...bootstrap.catalog.packSets].sort(
    (left, right) =>
      new Date(left.releaseDate).getTime() - new Date(right.releaseDate).getTime(),
  );
  const latestUnlockedSetIndex = sortedSets.reduce((latestIndex, set, index) => {
    return unlockBySetId.has(set.id) ? Math.max(latestIndex, index) : latestIndex;
  }, -1);
  const visibleSetLimit = Math.max(latestUnlockedSetIndex + 25, 32);
  const displaySets = sortedSets.filter(
    (set, index) => unlockBySetId.has(set.id) || index < visibleSetLimit,
  );
  const sets = displaySets.map((set) => {
    const unlock = unlockBySetId.get(set.id) ?? null;
    const packPrice = unlock ? unlock.packPrice ?? defaultPackPrice : null;
    const displaySize = unlock ? unlock.displaySize ?? defaultDisplaySize : null;
    const openingStats = openingStatsBySetId.get(set.id);

    return {
      id: set.id,
      code: set.code,
      name: set.name,
      releaseDate: set.releaseDate,
      productType: set.productType,
      packSize: set.packSize,
      cardPoolSize: set.cardPoolSize,
      imageUrl: set.imageUrl,
      totalOpened: openingStats?.totalOpened ?? 0,
      lastOpenedAt: openingStats?.lastOpenedAt ?? null,
      isUnlocked: Boolean(unlock),
      rewardOnly: unlock?.rewardOnly ?? false,
      packPrice,
      displaySize,
      displayCost: packPrice !== null && displaySize !== null ? packPrice * displaySize : null,
      canBuy: Boolean(unlock && !unlock.rewardOnly),
    };
  });

  return {
    viewer: {
      displayName: bootstrap.viewer.displayName,
    },
    wallet:
      typeof wallet.balance === "number"
        ? {
            balance: wallet.balance,
          }
        : null,
    activeRunId: asString(run.id) ?? bootstrap.activeRunId,
    collectionProgress: {
      owned: bootstrap.counts.collectionEntries,
      total: bootstrap.catalog.cards,
    },
    latestBanlistName: "Lokaler Cache",
    selectedSetId:
      sets.find((set) => set.productType === "CORE_BOOSTER" && set.canBuy)?.id ??
      sets.find((set) => set.canBuy)?.id ??
      sets[0]?.id ??
      null,
    sets,
    recentCollectionCards: [],
    activeDeck: null,
  };
}

export function buildCachedCollectionPagePayload(
  cache: LocalSyncCache,
): CachedCollectionPagePayload | null {
  const bootstrap = cache.bootstrap;

  if (!bootstrap) {
    return null;
  }

  const entries = (cache.collectionEntries as CachedCollectionEntry[])
    .filter((entry) => asString(entry.id) && asString(entry.cardId) && entry.card)
    .sort((left, right) =>
      (asString(right.acquiredAt) ?? "").localeCompare(asString(left.acquiredAt) ?? ""),
    );
  const groupedCards = new Map<string, CachedCollectionPagePayload["cards"][number]>();
  const sourceTotals = new Map<string, number>();
  let availableCopies = 0;
  let reservedCopies = 0;
  let tradedCopies = 0;

  for (const entry of entries) {
    const cardId = asString(entry.cardId);
    const card = entry.card;

    if (!cardId || !card) {
      continue;
    }

    const source = asString(entry.source) ?? "PACK_OPENING";
    const lockState = asLockState(entry.lockState);
    const acquiredAt = asString(entry.acquiredAt) ?? bootstrap.serverTime;
    const externalCardId = asString(card.externalCardId);
    const kind = asCardKind(card.kind);
    const setCardId = asString(entry.setCard?.id);
    const printingKey = setCardId ?? `loose:${source}`;
    const setCode = asString(entry.setCard?.setCode);
    const rarity = asString(entry.setCard?.rarity);

    sourceTotals.set(source, (sourceTotals.get(source) ?? 0) + 1);

    if (lockState === "AVAILABLE") {
      availableCopies += 1;
    } else if (lockState === "RESERVED") {
      reservedCopies += 1;
    } else {
      tradedCopies += 1;
    }

    if (!groupedCards.has(cardId)) {
      groupedCards.set(cardId, {
        cardId,
        name: asString(card.name) ?? "Unbekannte Karte",
        slug: asString(card.slug) ?? cardId,
        imageUrl: externalCardId ? getCardAssetUrl(externalCardId) : null,
        kind,
        currentOracleText: null,
        totalCopies: 0,
        availableCopies: 0,
        reservedCopies: 0,
        tradedCopies: 0,
        latestAcquiredAt: acquiredAt,
        printings: [],
        sources: [],
      });
    }

    const group = groupedCards.get(cardId)!;
    group.totalCopies += 1;

    if (lockState === "AVAILABLE") {
      group.availableCopies += 1;
    } else if (lockState === "RESERVED") {
      group.reservedCopies += 1;
    } else {
      group.tradedCopies += 1;
    }

    if (acquiredAt > group.latestAcquiredAt) {
      group.latestAcquiredAt = acquiredAt;
    }

    const printing = group.printings.find((item) => item.key === printingKey);
    if (printing) {
      printing.copies += 1;
    } else {
      group.printings.push({
        key: printingKey,
        setLabel: getPrintingLabel(entry),
        setCode,
        rarity,
        copies: 1,
      });
    }

    const sourceLine = group.sources.find((item) => item.source === source);
    if (sourceLine) {
      sourceLine.copies += 1;
    } else {
      group.sources.push({
        source,
        label: getSourceLabel(source),
        copies: 1,
      });
    }
  }

  const cards = [...groupedCards.values()].sort((left, right) => {
    if (right.totalCopies !== left.totalCopies) {
      return right.totalCopies - left.totalCopies;
    }

    return right.latestAcquiredAt.localeCompare(left.latestAcquiredAt);
  });
  const binders = (cache.binders as CachedBinder[]).map((binder, index) => {
    const coverKey = asString(binder.coverKey) ?? binderCoverCatalog[0].key;
    const cover = getBinderCoverMeta(coverKey as BinderCoverKey);
    const createdAt = asString(binder.createdAt) ?? cache.updatedAt;
    const updatedAt = asString(binder.updatedAt) ?? createdAt;

    return {
      id: asString(binder.id) ?? `cached-binder-${index}`,
      name: asString(binder.name) ?? "Binder",
      coverKey,
      coverName: cover.name,
      coverImageUrl: cover.imageUrl,
      description: asString(binder.description) ?? cover.description,
      accentColor: cover.accentColor,
      isActive: asBoolean(binder.isActive),
      createdAt,
      updatedAt,
      pageCount: 0,
      pages: [],
    };
  });

  return {
    viewer: {
      id: bootstrap.viewer.userId,
      displayName: bootstrap.viewer.displayName,
    },
    binders,
    presets: [],
    totals: {
      totalCopies: entries.length,
      uniqueCards: groupedCards.size,
      cardsWithDuplicates: cards.filter((card) => card.totalCopies > 1).length,
      availableCopies,
      reservedCopies,
      tradedCopies,
    },
    cards,
    recentEntries: entries.slice(0, 12).map((entry) => {
      const card = entry.card!;
      const externalCardId = asString(card.externalCardId);

      return {
        id: asString(entry.id) ?? crypto.randomUUID(),
        acquiredAt: asString(entry.acquiredAt) ?? bootstrap.serverTime,
        source: asString(entry.source) ?? "PACK_OPENING",
        sourceLabel: getSourceLabel(asString(entry.source) ?? "PACK_OPENING"),
        lockState: asLockState(entry.lockState),
        card: {
          id: asString(entry.cardId) ?? asString(card.id) ?? "unknown",
          name: asString(card.name) ?? "Unbekannte Karte",
          kind: asCardKind(card.kind),
          imageUrl: externalCardId ? getCardAssetUrl(externalCardId) : null,
        },
        printingLabel: getPrintingLabel(entry),
      };
    }),
    totalCards: bootstrap.catalog.cards,
  };
}

export function buildCachedDeckOverviewPayload(
  cache: LocalSyncCache,
  selectedDeckId?: string | null,
): CachedDeckOverviewPayload | null {
  const bootstrap = cache.bootstrap;

  if (!bootstrap) {
    return null;
  }

  const decks = (cache.decks as CachedDeck[])
    .filter((deck) => asString(deck.id))
    .sort((left, right) =>
      (asString(right.updatedAt) ?? "").localeCompare(asString(left.updatedAt) ?? ""),
    )
    .map((deck, index) => {
      const cards = Array.isArray(deck.cards) ? deck.cards : [];
      const counts = cards.reduce(
        (current, card) => {
          const section = asDeckSection(card.section);
          const quantity = Math.max(0, asNumber(card.quantity, 0));

          if (section === "EXTRA") {
            current.extra += quantity;
          } else if (section === "SIDE") {
            current.side += quantity;
          } else {
            current.main += quantity;
          }

          return current;
        },
        {
          main: 0,
          extra: 0,
          side: 0,
        },
      );
      const previewCard = cards.find((card) => card.card) ?? null;
      const previewExternalId = asString(previewCard?.card?.externalCardId);
      const name = asString(deck.name) ?? `Deck ${index + 1}`;

      return {
        id: asString(deck.id) ?? `cached-deck-${index}`,
        name,
        updatedAt:
          asString(deck.updatedAt) ??
          asString(deck.createdAt) ??
          cache.updatedAt ??
          bootstrap.serverTime,
        mainCount: counts.main,
        extraCount: counts.extra,
        sideCount: counts.side,
        isLegal: true,
        issueCount: 0,
        banlistName: null,
        previewImageUrl: previewExternalId ? getCardAssetUrl(previewExternalId) : null,
        previewLabel: asString(previewCard?.card?.name) ?? name,
      };
    });

  const collectionPayload = buildCachedCollectionPagePayload(cache);
  const selectedDeck =
    decks.find((deck) => deck.id === selectedDeckId) ?? decks[0] ?? null;

  return {
    viewer: {
      displayName: bootstrap.viewer.displayName,
    },
    collectionProgress: {
      owned: new Intl.NumberFormat("de-DE").format(
        collectionPayload?.totals.uniqueCards ?? bootstrap.counts.collectionEntries,
      ),
      total: new Intl.NumberFormat("de-DE").format(bootstrap.catalog.cards),
    },
    latestBanlistName: "Lokaler Cache",
    selectedDeckId: selectedDeck?.id ?? null,
    decks,
    recentCollectionCards:
      collectionPayload?.recentEntries.slice(0, 8).map((entry) => ({
        id: entry.id,
        name: entry.card.name,
        imageUrl: entry.card.imageUrl,
        rarity: null,
        setCode: entry.printingLabel === "Ohne Set-Zuordnung" ? null : entry.printingLabel,
      })) ?? [],
    activeDeck: null,
    availableBanlists: [],
    collectionCards:
      collectionPayload?.cards.map((card) => ({
        cardId: card.cardId,
        name: card.name,
        kind: card.kind,
        monsterType: null,
        imageUrl: card.imageUrl,
        oracleText: card.currentOracleText,
        errataCutoff: null,
        totalCopies: card.totalCopies,
        availableCopies: card.availableCopies,
        reservedCopies: card.reservedCopies,
        tradedCopies: card.tradedCopies,
        deckCopies: 0,
        mainCopies: 0,
        extraCopies: 0,
        sideCopies: 0,
        legalLimit: 3,
        pointValue: 0,
        rarities: card.printings
          .map((printing) => printing.rarity)
          .filter((rarity): rarity is string => Boolean(rarity)),
      })) ?? [],
  };
}
