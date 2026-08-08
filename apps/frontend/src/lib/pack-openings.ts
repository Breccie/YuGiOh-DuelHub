import { createHash, randomUUID } from "node:crypto";
import {
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  DomainError,
  normalizeDuelistId,
  normalizePackEconomy,
} from "@ygo/domain";
import { getCardAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";
import {
  getActiveCampaignRuleConfig,
  getActiveCampaignRuleVersionId,
} from "@/lib/campaign-rule-service";
import {
  assertPackAccessAvailable,
  isCampaignPackAvailableNow,
} from "@/lib/campaign-pack-access-service";
import {
  generatePackCards,
  getCanonicalSetCards,
  getEffectiveSetConfiguration,
} from "@/lib/pack-collation";
import { isStandardProgressionPack } from "@/lib/pack-product-classification";
import {
  creditWallet,
  ensureCampaignStartingAssets,
  getOrCreateWallet,
  requireRunMembership,
  serializeWallet,
} from "@/lib/run-service";
import { openCustomPackVersion } from "@/lib/custom-pack-service";
import { getMediaAssetUrl } from "@/lib/media-service";
import { addPulledCardsToCollection } from "@/lib/collection-rule-service";

async function debitWalletAtomically(
  tx: Prisma.TransactionClient,
  walletId: string,
  cost: number,
) {
  const [updatedWallet] = await tx.creditWallet.updateManyAndReturn({
    where: { id: walletId, balance: { gte: cost } },
    data: { balance: { decrement: cost } },
    select: { balance: true },
  });
  if (!updatedWallet) {
    const wallet = await tx.creditWallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { balance: true },
    });
    throw new DomainError({
      code: "insufficient_credits",
      message: "Nicht genug Credits für diesen Kauf.",
      status: 409,
      details: { balance: wallet.balance, cost },
    });
  }
  return updatedWallet.balance;
}

export type PackDashboardSnapshot = {
  viewer: {
    id: string;
    displayName: string;
  };
  wallet: {
    balance: number;
  } | null;
  selectedSetId: string | null;
  sets: Array<{
    id: string;
    code: string;
    name: string;
    releaseDate: string;
    productType: string;
    packSize: number;
    cardPoolSize: number;
    imageUrl: string | null;
    totalOpened: number;
    lastOpenedAt: string | null;
    isUnlocked: boolean;
    rewardOnly: boolean;
    packPrice: number | null;
    displaySize: number | null;
    displayCost: number | null;
    canBuy: boolean;
  }>;
  recentOpenings: PackOpeningSummary[];
};

export type PackOpeningSummary = {
  id: string;
  openedAt: string;
  addedToCollection: number;
  set: {
    id: string;
    code: string;
    name: string;
    packSize: number;
  };
  pulls: Array<{
    id: string;
    slotIndex: number;
    cardName: string;
    cardImageUrl: string | null;
    rarity: string | null;
    setCode: string;
  }>;
};

type PackOpeningBatchSummary = {
  id: string;
  runId: string;
  userId: string;
  setId: string;
  type: "SINGLE_PACK" | "DISPLAY" | "REWARD";
  quantity: number;
  totalCost: number;
  createdAt: string;
};

type RewardGrantWithPackSource = Prisma.RewardGrantGetPayload<{
  include: {
    packSet: true;
    customPackVersion: {
      include: {
        definition: true;
      };
    };
  };
}>;

async function enforcePackPurchaseRules(
  tx: Prisma.TransactionClient,
  options: {
    runId: string;
    userId: string;
    type: "PACK" | "DISPLAY";
  },
) {
  const rules = await getActiveCampaignRuleConfig(tx, options.runId);
  if (!rules.economy.purchaseTypes.includes(options.type)) {
    throw new DomainError({
      code: "pack_purchase_type_disabled",
      message: options.type === "DISPLAY"
        ? "Displaykäufe sind in dieser Kampagne deaktiviert."
        : "Einzelpackkäufe sind in dieser Kampagne deaktiviert.",
      status: 409,
    });
  }
  const limit = options.type === "DISPLAY"
    ? rules.economy.displayPurchaseLimitPerDay
    : rules.economy.packPurchaseLimitPerDay;
  if (limit === null) return;
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const purchases = await tx.packOpeningBatch.count({
    where: {
      runId: options.runId,
      userId: options.userId,
      type: options.type === "DISPLAY" ? "DISPLAY" : "SINGLE_PACK",
      createdAt: { gte: dayStart },
    },
  });
  if (purchases >= limit) {
    throw new DomainError({
      code: "daily_pack_purchase_limit_reached",
      message: `Das tägliche Kauflimit von ${limit} ${options.type === "DISPLAY" ? "Displays" : "Packs"} ist erreicht.`,
      status: 409,
    });
  }
}

type CachedPackCatalogSet = {
  id: string;
  code: string;
  name: string;
  releaseDate: Date;
  productType: string;
  packSize: number;
  imageUrl: string | null;
  cardPoolSize: number;
};

const INTERNAL_SAMPLE_SET_CODES = new Set(["SMP-START"]);
const PACK_CATALOG_CACHE_TTL_MS = 1000 * 60 * 15;
const PACK_COLLATION_CACHE_TTL_MS = 1000 * 60 * 15;

let packCatalogCache:
  | {
      expiresAt: number;
      sets: CachedPackCatalogSet[];
    }
  | null = null;
let pendingPackCatalogLoad: Promise<CachedPackCatalogSet[]> | null = null;

type LoadedPackSetRecord = Prisma.CardSetGetPayload<{
  include: {
    setCards: {
      include: {
        card: true;
      };
    };
  };
}>;

const packCollationCache = new Map<
  string,
  {
    expiresAt: number;
    set: LoadedPackSetRecord;
  }
>();
const pendingPackCollationLoads = new Map<
  string,
  Promise<LoadedPackSetRecord | null>
>();

function isInternalSampleSet(set: { code: string }) {
  return INTERNAL_SAMPLE_SET_CODES.has(set.code.toUpperCase());
}

async function loadStandardPackCatalog(
  prisma: PrismaClient,
): Promise<CachedPackCatalogSet[]> {
  const now = Date.now();

  if (packCatalogCache && packCatalogCache.expiresAt > now) {
    return packCatalogCache.sets;
  }

  if (pendingPackCatalogLoad) {
    return pendingPackCatalogLoad;
  }

  pendingPackCatalogLoad = prisma.cardSet
    .findMany({
      where: {
        isOpenable: true,
        productType: "CORE_BOOSTER",
      },
      orderBy: {
        releaseDate: "asc",
      },
      select: {
        id: true,
        code: true,
        name: true,
        releaseDate: true,
        productType: true,
        packSize: true,
        isOpenable: true,
        imageUrl: true,
        _count: {
          select: {
            setCards: true,
          },
        },
      },
    })
    .then((sets) =>
      sets
        .filter(
          (set) =>
            set.isOpenable &&
            !isInternalSampleSet(set) &&
            isStandardProgressionPack({
              code: set.code,
              name: set.name,
              productType: set.productType,
              isOpenable: set.isOpenable,
            }),
        )
        .map((set) => ({
          id: set.id,
          code: set.code,
          name: set.name,
          releaseDate: set.releaseDate,
          productType: set.productType,
          packSize: set.packSize,
          imageUrl: set.imageUrl,
          cardPoolSize: set._count.setCards,
        })),
    )
    .then((sets) => {
      packCatalogCache = {
        expiresAt: Date.now() + PACK_CATALOG_CACHE_TTL_MS,
        sets,
      };

      return sets;
    })
    .finally(() => {
      pendingPackCatalogLoad = null;
    });

  return pendingPackCatalogLoad;
}

type PackOpeningPrisma = PrismaClient | Prisma.TransactionClient;

async function loadCachedPackSet(
  prisma: PrismaClient,
  setId: string,
): Promise<LoadedPackSetRecord | null> {
  const now = Date.now();
  const cached = packCollationCache.get(setId);

  if (cached && cached.expiresAt > now) {
    return cached.set;
  }

  const pending = pendingPackCollationLoads.get(setId);
  if (pending) {
    return pending;
  }

  const load = prisma.cardSet
    .findUnique({
      where: {
        id: setId,
      },
      include: {
        setCards: {
          include: {
            card: true,
          },
        },
      },
    })
    .then((set) => {
      if (set) {
        packCollationCache.set(setId, {
          expiresAt: Date.now() + PACK_COLLATION_CACHE_TTL_MS,
          set,
        });
      }

      return set;
    })
    .finally(() => {
      pendingPackCollationLoads.delete(setId);
    });

  pendingPackCollationLoads.set(setId, load);
  return load;
}

async function loadSetOrThrow(
  prisma: PackOpeningPrisma,
  setId?: string,
  options: { cacheCollation?: boolean } = {},
) {
  const candidateSets = setId
    ? [
        options.cacheCollation
          ? await loadCachedPackSet(prisma as PrismaClient, setId)
          : await prisma.cardSet.findUnique({
              where: {
                id: setId,
              },
              include: {
                setCards: {
                  include: {
                    card: true,
                  },
                },
              },
            }),
      ].filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : await prisma.cardSet.findMany({
        orderBy: {
          releaseDate: "asc",
        },
        include: {
          setCards: {
            include: {
              card: true,
            },
          },
        },
      });

  if (candidateSets.length === 0) {
    throw new Error("No set found. Seed the database before opening packs.");
  }

  const hydratedSets = candidateSets
    .map((candidateSet) => {
      const canonicalSetCards = getCanonicalSetCards(candidateSet.setCards);

      return {
        ...candidateSet,
        setCards: canonicalSetCards,
        effectiveConfiguration: getEffectiveSetConfiguration(
          candidateSet,
          canonicalSetCards,
        ),
      };
    })
    .filter(
      (candidateSet) =>
        candidateSet.setCards.length > 0 && !isInternalSampleSet(candidateSet),
    );

  const set =
    (setId
      ? hydratedSets[0]
      : hydratedSets.find((candidateSet) => {
          return (
            candidateSet.effectiveConfiguration.isOpenable &&
            candidateSet.effectiveConfiguration.productType === "CORE_BOOSTER"
          );
        }) ??
        hydratedSets.find((candidateSet) => {
          return candidateSet.effectiveConfiguration.isOpenable;
        })) ?? null;

  if (!set) {
    throw new Error("No openable set found. Seed the database before opening packs.");
  }

  if (!set.effectiveConfiguration.isOpenable) {
    throw new Error(`Set "${set.name}" is not configured as an openable pack product.`);
  }

  return set;
}

function assertSetIsPurchasableInRun(options: {
  setId: string;
  setName: string;
  unlock: {
    rewardOnly: boolean;
    availabilityStatus: "AVAILABLE" | "LOCKED" | "SCHEDULED";
    availableFrom: Date | null;
    availableUntil: Date | null;
  } | null;
}) {
  if (!options.unlock) {
    throw new DomainError({
      code: "pack_locked",
      message: `"${options.setName}" ist in dieser Kampagne noch nicht freigeschaltet.`,
      status: 403,
      details: {
        setId: options.setId,
      },
    });
  }

  if (options.unlock.rewardOnly) {
    throw new DomainError({
      code: "reward_only_pack",
      message: "Dieses Pack ist nur als Reward verfügbar.",
      status: 409,
      details: {
        setId: options.setId,
      },
    });
  }

  assertPackAccessAvailable({
    ...options.unlock,
    productName: options.setName,
  });
}
function buildPackPulls(
  set: Awaited<ReturnType<typeof loadSetOrThrow>>,
) {
  const cardMetadataBySetCardId = new Map(
    set.setCards.map((setCard) => [setCard.id, setCard.card] as const),
  );

  return generatePackCards(set, set.setCards).map((selectedSetCard, index) => {
    if (!selectedSetCard.id) {
      throw new Error(
        `Set "${set.name}" returned a sampled card without a persisted SetCard id.`,
      );
    }

    const card = cardMetadataBySetCardId.get(selectedSetCard.id);
    if (!card) {
      throw new Error(`Card data for SetCard ${selectedSetCard.id} was not found.`);
    }

    return {
      id: randomUUID(),
      slotIndex: index + 1,
      cardId: selectedSetCard.cardId,
      setCardId: selectedSetCard.id,
      rarity: selectedSetCard.rarity,
      cardName: card.name,
      cardExternalId: card.externalCardId,
      setCode: selectedSetCard.setCode,
    };
  });
}

async function fetchOpeningSummary(prisma: PrismaClient, openingId: string) {
  const opening = await prisma.packOpening.findUnique({
    where: {
      id: openingId,
    },
    include: {
      set: true,
      pulls: {
        orderBy: {
          slotIndex: "asc",
        },
        include: {
          card: true,
          setCard: true,
        },
      },
    },
  });

  if (!opening) {
    throw new Error(`Pack opening ${openingId} was not found.`);
  }

  return opening;
}

async function findOpeningByIdempotencyKey(
  prisma: PrismaClient,
  options: {
    runId: string;
    userId: string;
    idempotencyKey: string;
  },
) {
  const batch = await prisma.packOpeningBatch.findUnique({
    where: {
      runId_userId_idempotencyKey: options,
    },
    select: {
      openings: {
        orderBy: {
          openedAt: "asc",
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  return batch?.openings[0]?.id ?? null;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function serializeOpening(
  opening: Awaited<ReturnType<typeof fetchOpeningSummary>>,
): PackOpeningSummary {
  return {
    id: opening.id,
    openedAt: opening.openedAt.toISOString(),
    addedToCollection: opening.pulls.length,
    set: {
      id: opening.set.id,
      code: opening.set.code,
      name: opening.set.name,
      packSize: opening.pulls.length,
    },
    pulls: opening.pulls.map((pull) => ({
      id: pull.id,
      slotIndex: pull.slotIndex,
      cardName: pull.card.name,
      cardImageUrl: getCardAssetUrl(pull.card.externalCardId),
      rarity: pull.rarity ?? pull.setCard.rarity,
      setCode: pull.setCard.setCode,
    })),
  };
}

function serializeBatch(
  batch: Prisma.PackOpeningBatchGetPayload<Record<string, never>>,
): PackOpeningBatchSummary {
  return {
    id: batch.id,
    runId: batch.runId,
    userId: batch.userId,
    setId: batch.setId,
    type: batch.type,
    quantity: batch.quantity,
    totalCost: batch.totalCost,
    createdAt: batch.createdAt.toISOString(),
  };
}

function serializeRewardGrant(grant: RewardGrantWithPackSource) {
  return {
    id: grant.id,
    runId: grant.runId,
    recipientId: grant.recipientId,
    grantedById: grant.grantedById,
    amountCredits: grant.amountCredits,
    packSetId: grant.packSetId,
    customPackVersionId: grant.customPackVersionId,
    packQuantity: grant.packQuantity,
    reason: grant.reason,
    status: grant.status,
    createdAt: grant.createdAt.toISOString(),
    claimedAt: grant.claimedAt?.toISOString() ?? null,
    packSet: grant.packSet
      ? {
          id: grant.packSet.id,
          code: grant.packSet.code,
          name: grant.packSet.name,
          packSize: grant.packSet.packSize,
          imageUrl: resolveAppImageUrl(grant.packSet.imageUrl),
        }
      : null,
    customPack: grant.customPackVersion
      ? {
          id: grant.customPackVersion.id,
          code: grant.customPackVersion.definition.code,
          name: grant.customPackVersion.definition.name,
          version: grant.customPackVersion.version,
          packSize: grant.customPackVersion.packSize,
          imageUrl: getMediaAssetUrl(grant.customPackVersion.packImageAssetId),
        }
      : null,
  };
}

async function fetchBatchResult(prisma: PrismaClient, batchId: string) {
  const batch = await prisma.packOpeningBatch.findUnique({
    where: {
      id: batchId,
    },
    include: {
      openings: {
        orderBy: {
          openedAt: "asc",
        },
        include: {
          set: true,
          pulls: {
            orderBy: {
              slotIndex: "asc",
            },
            include: {
              card: true,
              setCard: true,
            },
          },
        },
      },
    },
  });

  if (!batch) {
    throw new Error(`Pack opening batch ${batchId} was not found.`);
  }

  return batch;
}

async function fetchRewardGrantWithPackSource(
  prisma: PackOpeningPrisma,
  rewardGrantId: string,
) {
  return prisma.rewardGrant.findUnique({
    where: {
      id: rewardGrantId,
    },
    include: {
      packSet: true,
      customPackVersion: {
        include: {
          definition: true,
        },
      },
    },
  });
}

function ensureRewardPackGrant(
  grant: RewardGrantWithPackSource,
  options: {
    runId: string;
    viewerId: string;
  },
) {
  if (grant.runId !== options.runId) {
    throw new DomainError({
      code: "reward_not_found",
      message: "Diese Belohnung wurde nicht gefunden.",
      status: 404,
    });
  }

  if (grant.recipientId !== options.viewerId) {
    throw new DomainError({
      code: "not_reward_recipient",
      message: "Nur der Empfänger kann diese Belohnung claimen.",
      status: 403,
    });
  }

  if (grant.status === "CLAIMED") {
    throw new DomainError({
      code: "reward_already_claimed",
      message: "Diese Belohnung wurde bereits geclaimt.",
      status: 409,
    });
  }

  if (grant.status !== "PENDING") {
    throw new DomainError({
      code: "reward_not_pack",
      message: "Diese Belohnung ist nicht claimbar.",
      status: 409,
    });
  }

  if ((!grant.packSetId && !grant.customPackVersionId) || grant.packQuantity <= 0) {
    throw new DomainError({
      code: "reward_not_pack",
      message: "Diese Belohnung enthält kein Tournament-Pack.",
      status: 409,
    });
  }

  if ((grant.packSetId && !grant.packSet) || (grant.customPackVersionId && !grant.customPackVersion)) {
    throw new DomainError({
      code: "reward_pack_unavailable",
      message: "Das Reward-Pack ist nicht mehr verfügbar.",
      status: 409,
    });
  }
}

export async function getPackDashboardSnapshot(
  prisma: PrismaClient,
  viewerId: string,
  runId?: string | null,
): Promise<PackDashboardSnapshot> {
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }
  const [catalogSets, openingStats, recentOpenings, run, wallet, setUnlocks] =
    await Promise.all([
    loadStandardPackCatalog(prisma),
    prisma.packOpening.groupBy({
      by: ["setId"],
      where: {
        userId: viewer.id,
        runId: runId ?? undefined,
      },
      _count: {
        _all: true,
      },
      _max: {
        openedAt: true,
      },
    }),
    prisma.packOpening.findMany({
      where: {
        userId: viewer.id,
        runId: runId ?? undefined,
      },
      orderBy: {
        openedAt: "desc",
      },
      take: 6,
      include: {
        set: true,
        pulls: {
          orderBy: {
            slotIndex: "asc",
          },
          include: {
            card: true,
            setCard: true,
          },
        },
      },
    }),
    runId
      ? prisma.playGroupRun.findUnique({
          where: {
            id: runId,
          },
          select: {
            defaultPackPrice: true,
            defaultDisplaySize: true,
          },
        })
      : Promise.resolve(null),
    runId
      ? getOrCreateWallet(prisma, {
          runId,
          userId: viewer.id,
        })
      : Promise.resolve(null),
    runId
      ? prisma.runSetUnlock.findMany({
          where: {
            runId,
          },
          select: {
            setId: true,
            packPrice: true,
            displaySize: true,
            rewardOnly: true,
            availabilityStatus: true,
            availableFrom: true,
            availableUntil: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const openingStatsBySetId = new Map(
    openingStats.map((entry) => [
      entry.setId,
      {
        totalOpened: entry._count._all,
        lastOpenedAt: entry._max.openedAt?.toISOString() ?? null,
      },
    ]),
  );
  const unlockBySetId = new Map(setUnlocks.map((unlock) => [unlock.setId, unlock]));

  const hydratedSets = catalogSets;
  // The regular pack catalog is already restricted to openable progression
  // boosters. Return the complete chronology so the selection does not stop
  // at an arbitrary catalog index (previously the 32nd pack, SOI).
  const displaySets = hydratedSets;

  return {
    viewer: {
      id: viewer.id,
      displayName: viewer.displayName,
    },
    wallet: wallet
      ? {
          balance: wallet.balance,
        }
      : null,
    selectedSetId:
      displaySets.find((set) => {
        const unlock = unlockBySetId.get(set.id);
        const available = unlock ? isCampaignPackAvailableNow(unlock) : false;

        return (
          set.productType === "CORE_BOOSTER" &&
          (!runId || (unlock && available && !unlock.rewardOnly))
        );
      })
        ?.id ??
      displaySets.find((set) => {
        const unlock = unlockBySetId.get(set.id);
        const available = unlock ? isCampaignPackAvailableNow(unlock) : false;

        return !runId || (unlock && available && !unlock.rewardOnly);
      })?.id ??
      displaySets[0]?.id ??
      null,
    sets: displaySets.map((set) => {
      const unlock = unlockBySetId.get(set.id) ?? null;
      const available = unlock ? isCampaignPackAvailableNow(unlock) : false;
      const economy =
        run && unlock
          ? normalizePackEconomy({
              packPrice: unlock.packPrice,
              displaySize: unlock.displaySize,
              defaultPackPrice: run.defaultPackPrice,
              defaultDisplaySize: run.defaultDisplaySize,
            })
          : null;

      return {
        id: set.id,
        code: set.code,
        name: set.name,
        releaseDate: set.releaseDate.toISOString(),
        productType: set.productType,
        packSize: set.packSize,
        cardPoolSize: set.cardPoolSize,
        imageUrl: resolveAppImageUrl(set.imageUrl),
        totalOpened: openingStatsBySetId.get(set.id)?.totalOpened ?? 0,
        lastOpenedAt: openingStatsBySetId.get(set.id)?.lastOpenedAt ?? null,
        isUnlocked: runId ? Boolean(unlock && available) : true,
        rewardOnly: unlock?.rewardOnly ?? false,
        packPrice: economy?.packPrice ?? null,
        displaySize: economy?.displaySize ?? null,
        displayCost: economy?.displayCost ?? null,
        canBuy: runId ? Boolean(unlock && available && !unlock.rewardOnly) : true,
      };
    }),
    recentOpenings: recentOpenings.map(serializeOpening),
  };
}

export async function getFocusedPackDashboardSnapshot(
  prisma: PrismaClient,
  viewerId: string,
  setId: string,
  runId?: string | null,
): Promise<PackDashboardSnapshot | null> {
  const [viewer, set, openingStats, run, wallet, unlock] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: viewerId,
      },
      select: {
        id: true,
        displayName: true,
      },
    }),
    prisma.cardSet.findUnique({
      where: {
        id: setId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        releaseDate: true,
        productType: true,
        packSize: true,
        isOpenable: true,
        imageUrl: true,
        _count: {
          select: {
            setCards: true,
          },
        },
      },
    }),
    prisma.packOpening.aggregate({
      where: {
        userId: viewerId,
        runId: runId ?? undefined,
        setId,
      },
      _count: {
        _all: true,
      },
      _max: {
        openedAt: true,
      },
    }),
    runId
      ? prisma.playGroupRun.findUnique({
          where: {
            id: runId,
          },
          select: {
            defaultPackPrice: true,
            defaultDisplaySize: true,
          },
        })
      : Promise.resolve(null),
    runId
      ? getOrCreateWallet(prisma, {
          runId,
          userId: viewerId,
        })
      : Promise.resolve(null),
    runId
      ? prisma.runSetUnlock.findUnique({
          where: {
            runId_setId: {
              runId,
              setId,
            },
          },
          select: {
            packPrice: true,
            displaySize: true,
            rewardOnly: true,
            availabilityStatus: true,
            availableFrom: true,
            availableUntil: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (
    !viewer ||
    !set ||
    !set.isOpenable ||
    isInternalSampleSet(set) ||
    !isStandardProgressionPack({
      code: set.code,
      name: set.name,
      productType: set.productType,
      isOpenable: set.isOpenable,
    })
  ) {
    return null;
  }

  const economy =
    run && unlock
      ? normalizePackEconomy({
          packPrice: unlock.packPrice,
          displaySize: unlock.displaySize,
          defaultPackPrice: run.defaultPackPrice,
          defaultDisplaySize: run.defaultDisplaySize,
        })
      : null;
  const available = unlock ? isCampaignPackAvailableNow(unlock) : false;

  return {
    viewer,
    wallet: wallet
      ? {
          balance: wallet.balance,
        }
      : null,
    selectedSetId: set.id,
    sets: [
      {
        id: set.id,
        code: set.code,
        name: set.name,
        releaseDate: set.releaseDate.toISOString(),
        productType: set.productType,
        packSize: set.packSize,
        cardPoolSize: set._count.setCards,
        imageUrl: resolveAppImageUrl(set.imageUrl),
        totalOpened: openingStats._count._all,
        lastOpenedAt: openingStats._max.openedAt?.toISOString() ?? null,
        isUnlocked: runId ? Boolean(unlock && available) : true,
        rewardOnly: unlock?.rewardOnly ?? false,
        packPrice: economy?.packPrice ?? null,
        displaySize: economy?.displaySize ?? null,
        displayCost: economy?.displayCost ?? null,
        canBuy: runId ? Boolean(unlock && available && !unlock.rewardOnly) : true,
      },
    ],
    recentOpenings: [],
  };
}

export async function listRunRewardGrants(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
) {
  await requireRunMembership(prisma, {
    runId,
    userId: viewerId,
  });
  await ensureCampaignStartingAssets(prisma, { runId, userId: viewerId });

  const rewards = await prisma.rewardGrant.findMany({
    where: {
      runId,
      recipientId: viewerId,
    },
    orderBy: [
      {
        status: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
    include: {
      packSet: true,
      customPackVersion: {
        include: {
          definition: true,
        },
      },
    },
  });

  return {
    rewards: rewards.map(serializeRewardGrant),
  };
}

export async function createRunRewardGrant(
  prisma: PrismaClient,
  options: {
    organizerId: string;
    runId: string;
    recipientDuelistId: string;
    amountCredits?: number;
    packSetId?: string | null;
    customPackVersionId?: string | null;
    packQuantity?: number;
    reason?: string | null;
  },
) {
  await requireRunMembership(prisma, {
    runId: options.runId,
    userId: options.organizerId,
    organizerOnly: true,
  });

  const amountCredits = options.amountCredits ?? 0;
  const packQuantity = options.packQuantity ?? 0;
  const packSetId = options.packSetId ?? null;
  const customPackVersionId = options.customPackVersionId ?? null;

  if (packSetId && customPackVersionId) {
    throw new DomainError({
      code: "reward_pack_source_conflict",
      message: "Ein Reward kann nur eine Packquelle verwenden.",
      status: 400,
    });
  }

  if (amountCredits <= 0 && packQuantity <= 0) {
    throw new DomainError({
      code: "reward_empty",
      message: "Ein Reward braucht Credits oder Packs.",
      status: 400,
    });
  }

  const recipient = await prisma.user.findUnique({
    where: {
      duelistId: normalizeDuelistId(options.recipientDuelistId),
    },
  });

  if (!recipient) {
    throw new DomainError({
      code: "recipient_not_found",
      message: "Dieser Duelist wurde nicht gefunden.",
      status: 404,
    });
  }

  await requireRunMembership(prisma, {
    runId: options.runId,
    userId: recipient.id,
  });

  if (packQuantity > 0) {
    if (!packSetId && !customPackVersionId) {
      throw new DomainError({
        code: "reward_pack_required",
        message: "Für Pack-Rewards muss ein Pack-Set angegeben werden.",
        status: 400,
      });
    }

    if (packSetId) {
      await loadSetOrThrow(prisma, packSetId);
    } else {
      const [version, rules] = await Promise.all([
        prisma.customPackVersion.findFirst({
          where: {
            id: customPackVersionId!,
            status: "PUBLISHED",
            definition: { runId: options.runId },
          },
        }),
        getActiveCampaignRuleConfig(prisma, options.runId),
      ]);
      if (!version) {
        throw new DomainError({
          code: "reward_custom_pack_unavailable",
          message: "Diese veröffentlichte Custom-Pack-Version ist nicht verfügbar.",
          status: 409,
        });
      }
      if (!rules.tournaments.rewardSources.includes("CUSTOM_PACK")) {
        throw new DomainError({
          code: "reward_source_disabled",
          message: "Custom Packs sind in dieser Kampagne nicht als Rewardquelle erlaubt.",
          status: 409,
        });
      }
    }
  }

  const grant = await prisma.$transaction(async (tx) => {
    const ruleVersionId = await getActiveCampaignRuleVersionId(tx, options.runId);
    const createdGrant = await tx.rewardGrant.create({
      data: {
        runId: options.runId,
        recipientId: recipient.id,
        grantedById: options.organizerId,
        amountCredits,
        packSetId,
        customPackVersionId,
        packQuantity,
        reason: options.reason?.trim() || null,
        status: packQuantity > 0 ? "PENDING" : "CLAIMED",
        claimedAt: packQuantity > 0 ? null : new Date(),
        ruleVersionId,
      },
      include: {
        packSet: true,
        customPackVersion: {
          include: {
            definition: true,
          },
        },
      },
    });

    if (createdGrant.amountCredits > 0) {
      await creditWallet(tx, {
        runId: options.runId,
        userId: recipient.id,
        amount: createdGrant.amountCredits,
        source: "MANUAL_GRANT",
        referenceType: "RewardGrant",
        referenceId: createdGrant.id,
        note: createdGrant.reason,
      });
    }

    return createdGrant;
  });

  return {
    reward: serializeRewardGrant(grant),
  };
}

export async function claimRewardPack(
  prisma: PrismaClient,
  options: {
    viewerId: string;
    runId: string;
    rewardGrantId: string;
  },
) {
  const sourceGrant = await fetchRewardGrantWithPackSource(prisma, options.rewardGrantId);
  if (!sourceGrant) {
    throw new DomainError({
      code: "reward_not_found",
      message: "Diese Belohnung wurde nicht gefunden.",
      status: 404,
    });
  }
  ensureRewardPackGrant(sourceGrant, {
    runId: options.runId,
    viewerId: options.viewerId,
  });

  if (sourceGrant.customPackVersion) {
    const version = sourceGrant.customPackVersion;
    const results = [];
    for (let index = 0; index < sourceGrant.packQuantity; index += 1) {
      results.push(await openCustomPackVersion(
        prisma,
        options.viewerId,
        options.runId,
        version.id,
        {
          idempotencyKey: `reward:${sourceGrant.id}:${index}`,
          chargeCredits: false,
          allowRewardOnly: true,
        },
      ));
    }

    const sourceOpenings = await prisma.packOpening.findMany({
      where: { id: { in: results.map((result) => result.id) } },
      select: {
        id: true,
        openedAt: true,
        batch: true,
      },
    });
    const openingsById = new Map(sourceOpenings.map((opening) => [opening.id, opening]));
    const claim = await prisma.rewardGrant.updateMany({
      where: {
        id: sourceGrant.id,
        runId: options.runId,
        recipientId: options.viewerId,
        status: "PENDING",
      },
      data: { status: "CLAIMED", claimedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new DomainError({
        code: "reward_already_claimed",
        message: "Diese Belohnung wurde bereits geclaimt.",
        status: 409,
      });
    }
    const reward = await fetchRewardGrantWithPackSource(prisma, sourceGrant.id);
    const firstBatch = openingsById.get(results[0]!.id)?.batch;
    if (!reward || !firstBatch || !version.generatedSetId) {
      throw new DomainError({
        code: "reward_pack_unavailable",
        message: "Das Custom-Pack-Reward konnte nicht vollständig geladen werden.",
        status: 409,
      });
    }

    return {
      reward: serializeRewardGrant(reward),
      batch: {
        ...serializeBatch(firstBatch),
        quantity: results.length,
        totalCost: 0,
      },
      openings: results.map((result) => ({
        id: result.id,
        openedAt: openingsById.get(result.id)?.openedAt.toISOString() ?? new Date().toISOString(),
        addedToCollection: result.pulls.length,
        set: {
          id: version.generatedSetId!,
          code: version.definition.code,
          name: version.definition.name,
          packSize: version.packSize,
        },
        pulls: result.pulls.map((pull) => ({
          id: pull.id,
          slotIndex: pull.slotIndex,
          cardName: pull.cardName,
          cardImageUrl: pull.cardImageUrl,
          rarity: pull.rarity,
          setCode: pull.setCode ?? version.definition.code,
        })),
      })),
    };
  }

  const claimedBatchId = await prisma.$transaction(async (tx) => {
    await requireRunMembership(tx, {
      runId: options.runId,
      userId: options.viewerId,
    });

    const grant = await fetchRewardGrantWithPackSource(tx, options.rewardGrantId);

    if (!grant) {
      throw new DomainError({
        code: "reward_not_found",
        message: "Diese Belohnung wurde nicht gefunden.",
        status: 404,
      });
    }

    ensureRewardPackGrant(grant, {
      runId: options.runId,
      viewerId: options.viewerId,
    });

    const packSetId = grant.packSetId;
    if (!packSetId) {
      throw new DomainError({
        code: "reward_not_pack",
        message: "Diese Belohnung enthält kein Tournament-Pack.",
        status: 409,
      });
    }

    const set = await loadSetOrThrow(tx, packSetId);

    if (set.id !== packSetId) {
      throw new DomainError({
        code: "reward_pack_unavailable",
        message: "Das Reward-Pack ist nicht mehr verfügbar.",
        status: 409,
      });
    }

    const claimedAt = new Date();
    const claim = await tx.rewardGrant.updateMany({
      where: {
        id: grant.id,
        runId: options.runId,
        recipientId: options.viewerId,
        status: "PENDING",
      },
      data: {
        status: "CLAIMED",
        claimedAt,
      },
    });

    if (claim.count !== 1) {
      const latestGrant = await fetchRewardGrantWithPackSource(tx, options.rewardGrantId);

      if (!latestGrant) {
        throw new DomainError({
          code: "reward_not_found",
          message: "Diese Belohnung wurde nicht gefunden.",
          status: 404,
        });
      }

      ensureRewardPackGrant(latestGrant, {
        runId: options.runId,
        viewerId: options.viewerId,
      });
    }

    const idempotencyKey = `reward:${grant.id}`;
    const existingBatch = await tx.packOpeningBatch.findUnique({
      where: {
        runId_userId_idempotencyKey: {
          runId: options.runId,
          userId: options.viewerId,
          idempotencyKey,
        },
      },
    });

    if (existingBatch) {
      return existingBatch.id;
    }

    const ruleVersionId = grant.ruleVersionId
      ?? await getActiveCampaignRuleVersionId(tx, options.runId);

    const batch = await tx.packOpeningBatch.create({
      data: {
        runId: options.runId,
        userId: options.viewerId,
        setId: set.id,
        type: "REWARD",
        quantity: grant.packQuantity,
        totalCost: 0,
        idempotencyKey,
        ruleVersionId,
      },
    });

    const rewardOpenedAtBase = Date.now();
    const rewardOpenings = Array.from({ length: grant.packQuantity }, (_, index) => {
      const id = randomUUID();
      const randomSeed = randomUUID();
      const auditHash = createHash("sha1")
        .update(`${options.viewerId}:${set.id}:${randomSeed}:${rewardOpenedAtBase}:reward:${grant.id}:${index}`)
        .digest("hex");
      return {
        id,
        randomSeed,
        auditHash,
        openedAt: new Date(rewardOpenedAtBase + index),
        pulls: buildPackPulls(set),
      };
    });

    await tx.packOpening.createMany({
      data: rewardOpenings.map((opening) => ({
        id: opening.id,
        userId: options.viewerId,
        setId: set.id,
        runId: options.runId,
        batchId: batch.id,
        randomSeed: opening.randomSeed,
        auditHash: opening.auditHash,
        openedAt: opening.openedAt,
        notes: `RewardGrant:${grant.id}`,
        ruleVersionId,
      })),
    });
    await tx.packPull.createMany({
      data: rewardOpenings.flatMap((opening) =>
        opening.pulls.map((pull) => ({
          openingId: opening.id,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          slotIndex: pull.slotIndex,
          rarity: pull.rarity,
        })),
      ),
    });
    await addPulledCardsToCollection(tx, {
      userId: options.viewerId,
      runId: options.runId,
      pulls: rewardOpenings.flatMap((opening) =>
        opening.pulls.map((pull) => ({
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          sourceReferenceId: opening.id,
        })),
      ),
    });

    return batch.id;
  }, {
    maxWait: 10_000,
    timeout: 60_000,
  });

  const [reward, batch] = await Promise.all([
    fetchRewardGrantWithPackSource(prisma, options.rewardGrantId),
    fetchBatchResult(prisma, claimedBatchId),
  ]);

  if (!reward) {
    throw new DomainError({
      code: "reward_not_found",
      message: "Diese Belohnung wurde nicht gefunden.",
      status: 404,
    });
  }

  return {
    reward: serializeRewardGrant(reward),
    batch: serializeBatch(batch),
    openings: batch.openings.map(serializeOpening),
  };
}

export async function openPack(
  prisma: PrismaClient,
  options: {
    viewerId: string;
    setId?: string;
    runId?: string | null;
    idempotencyKey?: string | null;
    chargeCredits?: boolean;
  },
) {
  const runId = options.runId ?? null;
  const [viewer, set, ruleVersionId, existingWallet, existingOpeningId] =
    await Promise.all([
      prisma.user.findUnique({
        where: {
          id: options.viewerId,
        },
      }),
      loadSetOrThrow(prisma, options.setId, { cacheCollation: true }),
      runId ? getActiveCampaignRuleVersionId(prisma, runId) : null,
      runId
        ? prisma.creditWallet.findUnique({
            where: {
              runId_userId: {
                runId,
                userId: options.viewerId,
              },
            },
          })
        : null,
      runId && options.idempotencyKey
        ? findOpeningByIdempotencyKey(prisma, {
            runId,
            userId: options.viewerId,
            idempotencyKey: options.idempotencyKey,
          })
        : null,
    ]);

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  if (existingOpeningId) {
    return serializeOpening(await fetchOpeningSummary(prisma, existingOpeningId));
  }

  const wallet =
    runId && !existingWallet
      ? await getOrCreateWallet(prisma, {
          runId,
          userId: viewer.id,
        })
      : existingWallet;
  const randomSeed = randomUUID();
  const openingId = randomUUID();
  const batchId = runId ? randomUUID() : null;
  const openedAt = new Date();
  const auditHash = createHash("sha1")
    .update(`${viewer.id}:${set.id}:${randomSeed}:${Date.now()}`)
    .digest("hex");

  const pulls = buildPackPulls(set);
  const nestedPulls = pulls.map((pull) => ({
    id: pull.id,
    cardId: pull.cardId,
    setCardId: pull.setCardId,
    slotIndex: pull.slotIndex,
    rarity: pull.rarity,
  }));

  try {
    await prisma.$transaction(
      async (tx) => {
        let totalCost = 0;

        if (runId) {
          const run = await tx.playGroupRun.findUnique({
            where: {
              id: runId,
            },
            select: {
              defaultPackPrice: true,
              defaultDisplaySize: true,
              memberships: {
                where: {
                  userId: viewer.id,
                },
                select: {
                  id: true,
                },
                take: 1,
              },
              setUnlocks: {
                where: {
                  setId: set.id,
                },
                select: {
                  packPrice: true,
                  displaySize: true,
                  rewardOnly: true,
                  availabilityStatus: true,
                  availableFrom: true,
                  availableUntil: true,
                },
                take: 1,
              },
            },
          });

          if (!run || run.memberships.length === 0) {
            throw new DomainError({
              code: "not_run_member",
              message: "Du bist kein Mitglied dieser Runde.",
              status: 403,
            });
          }

          const unlock = run.setUnlocks[0] ?? null;
          assertSetIsPurchasableInRun({
            setId: set.id,
            setName: set.name,
            unlock,
          });

          const economy = normalizePackEconomy({
            packPrice: unlock?.packPrice,
            displaySize: unlock?.displaySize,
            defaultPackPrice: run.defaultPackPrice,
            defaultDisplaySize: run.defaultDisplaySize,
          });
          totalCost = options.chargeCredits === false ? 0 : economy.packPrice;

          if (options.chargeCredits !== false) {
            await enforcePackPurchaseRules(tx, {
              runId,
              userId: viewer.id,
              type: "PACK",
            });
          }

          if (!wallet || !batchId) {
            throw new Error("Wallet oder Pack-Batch konnte nicht vorbereitet werden.");
          }

          if (totalCost > 0) {
            const balanceAfter = await debitWalletAtomically(
              tx,
              wallet.id,
              totalCost,
            );
            await tx.creditLedgerEntry.create({
              data: {
                runId,
                walletId: wallet.id,
                userId: viewer.id,
                amount: -totalCost,
                balanceAfter,
                source: "PACK_PURCHASE",
                referenceType: "PackOpeningBatch",
                referenceId: batchId,
                idempotencyKey: options.idempotencyKey ?? null,
                note: `Pack gekauft: ${set.name}`,
              },
            });
          }

          await tx.packOpeningBatch.create({
            data: {
              id: batchId,
              runId,
              userId: viewer.id,
              setId: set.id,
              type: "SINGLE_PACK",
              quantity: 1,
              totalCost,
              idempotencyKey: options.idempotencyKey ?? null,
              ruleVersionId,
              openings: {
                create: {
                  id: openingId,
                  userId: viewer.id,
                  setId: set.id,
                  runId,
                  openedAt,
                  randomSeed,
                  auditHash,
                  ruleVersionId,
                  pulls: {
                    createMany: {
                      data: nestedPulls,
                    },
                  },
                },
              },
            },
          });
        } else {
          await tx.packOpening.create({
            data: {
              id: openingId,
              userId: viewer.id,
              setId: set.id,
              openedAt,
              randomSeed,
              auditHash,
              pulls: {
                createMany: {
                  data: nestedPulls,
                },
              },
            },
          });
        }

        if (runId) {
          await addPulledCardsToCollection(tx, {
            userId: viewer.id,
            runId,
            pulls: pulls.map((pull) => ({
              cardId: pull.cardId,
              setCardId: pull.setCardId,
              sourceReferenceId: openingId,
            })),
          });
        } else {
          await tx.collectionEntry.createMany({
            data: pulls.map((pull) => ({
              userId: viewer.id,
              cardId: pull.cardId,
              setCardId: pull.setCardId,
              runId: null,
              source: "PACK_OPENING" as const,
              sourceReferenceId: openingId,
            })),
          });
        }
      },
      {
        timeout: 20_000,
      },
    );
  } catch (error) {
    if (runId && options.idempotencyKey && isUniqueConstraintError(error)) {
      const concurrentOpeningId = await findOpeningByIdempotencyKey(prisma, {
        runId,
        userId: viewer.id,
        idempotencyKey: options.idempotencyKey,
      });

      if (concurrentOpeningId) {
        return serializeOpening(
          await fetchOpeningSummary(prisma, concurrentOpeningId),
        );
      }
    }

    throw error;
  }

  return {
    id: openingId,
    openedAt: openedAt.toISOString(),
    addedToCollection: pulls.length,
    set: {
      id: set.id,
      code: set.code,
      name: set.name,
      packSize: pulls.length,
    },
    pulls: pulls.map((pull) => ({
      id: pull.id,
      slotIndex: pull.slotIndex,
      cardName: pull.cardName,
      cardImageUrl: getCardAssetUrl(pull.cardExternalId),
      rarity: pull.rarity,
      setCode: pull.setCode,
    })),
  } satisfies PackOpeningSummary;
}

export async function openDisplay(
  prisma: PrismaClient,
  options: {
    viewerId: string;
    runId: string;
    setId: string;
    idempotencyKey?: string | null;
  },
) {
  const [viewer, set] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: options.viewerId,
      },
    }),
    loadSetOrThrow(prisma, options.setId),
  ]);

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const createdBatchId = await prisma.$transaction(async (tx) => {
    const ruleVersionId = await getActiveCampaignRuleVersionId(tx, options.runId);
    await requireRunMembership(tx, {
      runId: options.runId,
      userId: viewer.id,
    });

    if (options.idempotencyKey) {
      const existingBatch = await tx.packOpeningBatch.findUnique({
        where: {
          runId_userId_idempotencyKey: {
            runId: options.runId,
            userId: viewer.id,
            idempotencyKey: options.idempotencyKey,
          },
        },
      });

      if (existingBatch) {
        return existingBatch.id;
      }
    }

    const run = await tx.playGroupRun.findUniqueOrThrow({
      where: {
        id: options.runId,
      },
    });
    const unlock = await tx.runSetUnlock.findUnique({
      where: {
        runId_setId: {
          runId: options.runId,
          setId: set.id,
        },
      },
    });

    assertSetIsPurchasableInRun({
      setId: set.id,
      setName: set.name,
      unlock,
    });

    await enforcePackPurchaseRules(tx, {
      runId: options.runId,
      userId: viewer.id,
      type: "DISPLAY",
    });

    const economy = normalizePackEconomy({
      packPrice: unlock?.packPrice,
      displaySize: unlock?.displaySize,
      defaultPackPrice: run.defaultPackPrice,
      defaultDisplaySize: run.defaultDisplaySize,
    });
    const wallet = await getOrCreateWallet(tx, {
      runId: options.runId,
      userId: viewer.id,
    });

    const balanceAfter = await debitWalletAtomically(
      tx,
      wallet.id,
      economy.displayCost,
    );

    const batch = await tx.packOpeningBatch.create({
      data: {
        runId: options.runId,
        userId: viewer.id,
        setId: set.id,
        type: "DISPLAY",
        quantity: economy.displaySize,
        totalCost: economy.displayCost,
        idempotencyKey: options.idempotencyKey ?? null,
        ruleVersionId,
      },
    });

    await tx.creditLedgerEntry.create({
      data: {
        runId: options.runId,
        walletId: wallet.id,
        userId: viewer.id,
        amount: -economy.displayCost,
        balanceAfter,
        source: "DISPLAY_PURCHASE",
        referenceType: "PackOpeningBatch",
        referenceId: batch.id,
        idempotencyKey: options.idempotencyKey ?? null,
        note: `Display gekauft: ${set.name}`,
      },
    });

    const openedAtBase = Date.now();
    const displayPacks = Array.from({ length: economy.displaySize }, (_, index) => {
      const id = randomUUID();
      const randomSeed = randomUUID();
      const auditHash = createHash("sha1")
        .update(`${viewer.id}:${set.id}:${randomSeed}:${Date.now()}:${index}`)
        .digest("hex");
      return {
        id,
        randomSeed,
        auditHash,
        openedAt: new Date(openedAtBase + index),
        pulls: buildPackPulls(set),
      };
    });

    await tx.packOpening.createMany({
      data: displayPacks.map((opening) => ({
        id: opening.id,
        userId: viewer.id,
        setId: set.id,
        runId: options.runId,
        batchId: batch.id,
        openedAt: opening.openedAt,
        randomSeed: opening.randomSeed,
        auditHash: opening.auditHash,
        ruleVersionId,
      })),
    });

    await tx.packPull.createMany({
      data: displayPacks.flatMap((opening) =>
        opening.pulls.map((pull) => ({
          id: pull.id,
          openingId: opening.id,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          slotIndex: pull.slotIndex,
          rarity: pull.rarity,
        })),
      ),
    });

    await addPulledCardsToCollection(tx, {
      userId: viewer.id,
      runId: options.runId,
      pulls: displayPacks.flatMap((opening) =>
        opening.pulls.map((pull) => ({
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          sourceReferenceId: opening.id,
        })),
      ),
    });

    return batch.id;
  });

  const [batch, wallet] = await Promise.all([
    fetchBatchResult(prisma, createdBatchId),
    getOrCreateWallet(prisma, {
      runId: options.runId,
      userId: viewer.id,
    }),
  ]);

  return {
    batch: serializeBatch(batch),
    openings: batch.openings.map(serializeOpening),
    wallet: serializeWallet(wallet),
  };
}
