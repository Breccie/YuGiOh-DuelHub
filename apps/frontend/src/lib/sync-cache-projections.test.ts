import { describe, expect, it } from "vitest";
import type { LocalSyncCache } from "@/lib/sync-cache";
import {
  buildCachedCollectionPagePayload,
  buildCachedDeckOverviewPayload,
  buildCachedPackSelectionPayload,
} from "@/lib/sync-cache-projections";

function createCache(): LocalSyncCache {
  return {
    version: 1,
    updatedAt: "2026-07-09T12:00:00.000Z",
    cursor: "2026-07-09T12:00:00.000Z",
    bootstrap: {
      serverTime: "2026-07-09T12:00:00.000Z",
      cursor: "2026-07-09T12:00:00.000Z",
      viewer: {
        userId: "user-1",
        duelistId: "YUGI",
        displayName: "Yugi",
      },
      activeRunId: "run-1",
      catalog: {
        cards: 300,
        sets: 2,
        openableSets: 2,
        banlists: 1,
        packSets: [
          {
            id: "set-1",
            code: "LOB",
            name: "Legend of Blue Eyes White Dragon",
            releaseDate: "2002-03-08T00:00:00.000Z",
            productType: "CORE_BOOSTER",
            packSize: 9,
            imageUrl: "/packs/lob.png",
            cardPoolSize: 126,
          },
          {
            id: "set-2",
            code: "MRD",
            name: "Metal Raiders",
            releaseDate: "2002-06-26T00:00:00.000Z",
            productType: "CORE_BOOSTER",
            packSize: 9,
            imageUrl: "/packs/mrd.png",
            cardPoolSize: 144,
          },
        ],
        runSetUnlocks: [
          {
            id: "unlock-1",
            setId: "set-1",
            unlockedAt: "2026-07-09T12:00:00.000Z",
            rewardOnly: false,
            packPrice: 120,
            displaySize: 24,
          },
        ],
      },
      run: {
        id: "run-1",
        defaultPackPrice: 100,
        defaultDisplaySize: 24,
      },
      wallet: {
        balance: 2400,
      },
      counts: {
        collectionEntries: 18,
        decks: 1,
        binders: 1,
        trades: 0,
        tournaments: 0,
        pendingRewards: 0,
      },
    },
    collectionEntries: [],
    decks: [],
    binders: [],
    trades: [],
    tournaments: [],
    packOpenings: [
      {
        id: "opening-1",
        setId: "set-1",
        openedAt: "2026-07-09T12:05:00.000Z",
      },
      {
        id: "opening-2",
        setId: "set-1",
        openedAt: "2026-07-09T12:06:00.000Z",
      },
    ],
    rewards: [],
  };
}

function createCollectionCache(): LocalSyncCache {
  const cache = createCache();
  cache.collectionEntries = [
    {
      id: "entry-1",
      cardId: "card-1",
      acquiredAt: "2026-07-09T12:10:00.000Z",
      source: "PACK_OPENING",
      lockState: "AVAILABLE",
      card: {
        id: "card-1",
        name: "Dark Magician",
        slug: "dark-magician",
        externalCardId: "46986414",
        kind: "MONSTER",
      },
      setCard: {
        id: "set-card-1",
        setCode: "LOB-005",
        rarity: "Ultra Rare",
        set: {
          code: "LOB",
          name: "Legend of Blue Eyes White Dragon",
        },
      },
    },
    {
      id: "entry-2",
      cardId: "card-1",
      acquiredAt: "2026-07-09T12:11:00.000Z",
      source: "PACK_OPENING",
      lockState: "RESERVED",
      card: {
        id: "card-1",
        name: "Dark Magician",
        slug: "dark-magician",
        externalCardId: "46986414",
        kind: "MONSTER",
      },
      setCard: {
        id: "set-card-1",
        setCode: "LOB-005",
        rarity: "Ultra Rare",
        set: {
          code: "LOB",
          name: "Legend of Blue Eyes White Dragon",
        },
      },
    },
  ];
  cache.binders = [
    {
      id: "binder-1",
      name: "Main Binder",
      coverKey: "inferno-vortex",
      isActive: true,
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
    },
  ];

  return cache;
}

describe("sync cache projections", () => {
  it("builds pack selection payloads from cached bootstrap and changes", () => {
    const payload = buildCachedPackSelectionPayload(createCache());

    expect(payload).toMatchObject({
      viewer: {
        displayName: "Yugi",
      },
      wallet: {
        balance: 2400,
      },
      activeRunId: "run-1",
      collectionProgress: {
        owned: 18,
        total: 300,
      },
      selectedSetId: "set-1",
    });
    expect(payload?.sets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "set-1",
          canBuy: true,
          packPrice: 120,
          displayCost: 2880,
          totalOpened: 2,
          lastOpenedAt: "2026-07-09T12:06:00.000Z",
        }),
        expect.objectContaining({
          id: "set-2",
          canBuy: false,
          packPrice: null,
        }),
      ]),
    );
  });

  it("returns null without cached pack catalog data", () => {
    const cache = createCache();
    cache.bootstrap = null;

    expect(buildCachedPackSelectionPayload(cache)).toBeNull();
  });

  it("builds collection payloads from cached entries", () => {
    const payload = buildCachedCollectionPagePayload(createCollectionCache());

    expect(payload).toMatchObject({
      viewer: {
        displayName: "Yugi",
      },
      totals: {
        totalCopies: 2,
        uniqueCards: 1,
        cardsWithDuplicates: 1,
        availableCopies: 1,
        reservedCopies: 1,
      },
    });
    expect(payload?.cards[0]).toMatchObject({
      cardId: "card-1",
      name: "Dark Magician",
      totalCopies: 2,
      availableCopies: 1,
      reservedCopies: 1,
      printings: [
        expect.objectContaining({
          setCode: "LOB-005",
          copies: 2,
        }),
      ],
    });
    expect(payload?.recentEntries[0]).toMatchObject({
      id: "entry-2",
      lockState: "RESERVED",
      printingLabel: "LOB · Legend of Blue Eyes White Dragon",
    });
    expect(payload?.binders[0]).toMatchObject({
      id: "binder-1",
      name: "Main Binder",
      isActive: true,
    });
  });

  it("builds deck overview payloads from cached decks and collection", () => {
    const cache = createCollectionCache();
    cache.decks = [
      {
        id: "deck-1",
        name: "Magician Control",
        createdAt: "2026-07-09T12:00:00.000Z",
        updatedAt: "2026-07-09T12:20:00.000Z",
        cards: [
          {
            id: "deck-card-1",
            cardId: "card-1",
            section: "MAIN",
            quantity: 2,
            card: {
              id: "card-1",
              name: "Dark Magician",
              externalCardId: "46986414",
              kind: "MONSTER",
            },
          },
          {
            id: "deck-card-2",
            cardId: "card-2",
            section: "SIDE",
            quantity: 1,
            card: {
              id: "card-2",
              name: "Mystical Space Typhoon",
              externalCardId: "05318639",
              kind: "SPELL",
            },
          },
        ],
      },
    ];

    const payload = buildCachedDeckOverviewPayload(cache, "deck-1");

    expect(payload).toMatchObject({
      viewer: {
        displayName: "Yugi",
      },
      collectionProgress: {
        owned: "1",
        total: "300",
      },
      selectedDeckId: "deck-1",
      latestBanlistName: "Lokaler Cache",
    });
    expect(payload?.decks[0]).toMatchObject({
      id: "deck-1",
      name: "Magician Control",
      mainCount: 2,
      extraCount: 0,
      sideCount: 1,
      previewLabel: "Dark Magician",
    });
    expect(payload?.activeDeck).toBeNull();
    expect(payload?.collectionCards[0]).toMatchObject({
      cardId: "card-1",
      name: "Dark Magician",
      totalCopies: 2,
    });
  });
});
