import { createHash, randomUUID } from "node:crypto";
import {
  OwnershipSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  DomainError,
  applyLedgerAmount,
  assertSufficientCredits,
  normalizeDuelistId,
  normalizePackEconomy,
} from "@ygo/domain";
import { getCardAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";
import {
  generatePackCards,
  getCanonicalSetCards,
  getEffectiveSetConfiguration,
} from "@/lib/pack-collation";
import {
  creditWallet,
  getOrCreateWallet,
  requireRunMembership,
  serializeWallet,
} from "@/lib/run-service";

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

type RewardGrantWithPackSet = Prisma.RewardGrantGetPayload<{
  include: {
    packSet: true;
  };
}>;

const INTERNAL_SAMPLE_SET_CODES = new Set(["SMP-START"]);

function isInternalSampleSet(set: { code: string }) {
  return INTERNAL_SAMPLE_SET_CODES.has(set.code.toUpperCase());
}

type PackOpeningPrisma = PrismaClient | Prisma.TransactionClient;

async function loadSetOrThrow(prisma: PackOpeningPrisma, setId?: string) {
  const candidateSets = setId
    ? [
        await prisma.cardSet.findUnique({
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
}
function buildPackPulls(
  set: Awaited<ReturnType<typeof loadSetOrThrow>>,
) {
  return generatePackCards(set, set.setCards).map((selectedSetCard, index) => {
    if (!selectedSetCard.id) {
      throw new Error(
        `Set "${set.name}" returned a sampled card without a persisted SetCard id.`,
      );
    }

    return {
      slotIndex: index + 1,
      cardId: selectedSetCard.cardId,
      setCardId: selectedSetCard.id,
      rarity: selectedSetCard.rarity,
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

function serializeRewardGrant(grant: RewardGrantWithPackSet) {
  return {
    id: grant.id,
    runId: grant.runId,
    recipientId: grant.recipientId,
    grantedById: grant.grantedById,
    amountCredits: grant.amountCredits,
    packSetId: grant.packSetId,
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

async function fetchRewardGrantWithPackSet(
  prisma: PackOpeningPrisma,
  rewardGrantId: string,
) {
  return prisma.rewardGrant.findUnique({
    where: {
      id: rewardGrantId,
    },
    include: {
      packSet: true,
    },
  });
}

function ensureRewardPackGrant(
  grant: RewardGrantWithPackSet,
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

  if (!grant.packSetId || grant.packQuantity <= 0) {
    throw new DomainError({
      code: "reward_not_pack",
      message: "Diese Belohnung enthält kein Tournament-Pack.",
      status: 409,
    });
  }

  if (!grant.packSet) {
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
  const [sets, openingStats, recentOpenings, run, wallet, setUnlocks] = await Promise.all([
    prisma.cardSet.findMany({
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
        imageUrl: true,
        setCards: {
          select: {
            cardId: true,
            rarity: true,
            setCode: true,
          },
        },
      },
    }),
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

  const hydratedSets = sets
    .map((set) => {
      const canonicalSetCards = getCanonicalSetCards(set.setCards);

      return {
        ...set,
        setCards: canonicalSetCards,
        effectiveConfiguration: getEffectiveSetConfiguration(set, canonicalSetCards),
      };
    })
    .filter(
      (set) =>
        set.effectiveConfiguration.isOpenable && !isInternalSampleSet(set),
    );

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
      hydratedSets.find((set) => {
        const unlock = unlockBySetId.get(set.id);

        return (
          set.effectiveConfiguration.productType === "CORE_BOOSTER" &&
          (!runId || (unlock && !unlock.rewardOnly))
        );
      })
        ?.id ??
      hydratedSets.find((set) => {
        const unlock = unlockBySetId.get(set.id);

        return !runId || (unlock && !unlock.rewardOnly);
      })?.id ??
      hydratedSets[0]?.id ??
      null,
    sets: hydratedSets.map((set) => {
      const unlock = unlockBySetId.get(set.id) ?? null;
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
        productType: set.effectiveConfiguration.productType,
        packSize: set.effectiveConfiguration.packSize,
        cardPoolSize: set.setCards.length,
        imageUrl: resolveAppImageUrl(set.imageUrl),
        totalOpened: openingStatsBySetId.get(set.id)?.totalOpened ?? 0,
        lastOpenedAt: openingStatsBySetId.get(set.id)?.lastOpenedAt ?? null,
        isUnlocked: runId ? Boolean(unlock) : true,
        rewardOnly: unlock?.rewardOnly ?? false,
        packPrice: economy?.packPrice ?? null,
        displaySize: economy?.displaySize ?? null,
        displayCost: economy?.displayCost ?? null,
        canBuy: runId ? Boolean(unlock && !unlock.rewardOnly) : true,
      };
    }),
    recentOpenings: recentOpenings.map(serializeOpening),
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
    if (!packSetId) {
      throw new DomainError({
        code: "reward_pack_required",
        message: "Für Pack-Rewards muss ein Pack-Set angegeben werden.",
        status: 400,
      });
    }

    await loadSetOrThrow(prisma, packSetId);
  }

  const grant = await prisma.$transaction(async (tx) => {
    const createdGrant = await tx.rewardGrant.create({
      data: {
        runId: options.runId,
        recipientId: recipient.id,
        grantedById: options.organizerId,
        amountCredits,
        packSetId,
        packQuantity,
        reason: options.reason?.trim() || null,
        status: packQuantity > 0 ? "PENDING" : "CLAIMED",
        claimedAt: packQuantity > 0 ? null : new Date(),
      },
      include: {
        packSet: true,
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
  const claimedBatchId = await prisma.$transaction(async (tx) => {
    await requireRunMembership(tx, {
      runId: options.runId,
      userId: options.viewerId,
    });

    const grant = await fetchRewardGrantWithPackSet(tx, options.rewardGrantId);

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
      const latestGrant = await fetchRewardGrantWithPackSet(tx, options.rewardGrantId);

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

    const batch = await tx.packOpeningBatch.create({
      data: {
        runId: options.runId,
        userId: options.viewerId,
        setId: set.id,
        type: "REWARD",
        quantity: grant.packQuantity,
        totalCost: 0,
        idempotencyKey,
      },
    });

    for (let index = 0; index < grant.packQuantity; index += 1) {
      const randomSeed = randomUUID();
      const auditHash = createHash("sha1")
        .update(`${options.viewerId}:${set.id}:${randomSeed}:${Date.now()}:reward:${grant.id}:${index}`)
        .digest("hex");
      const pulls = buildPackPulls(set);
      const opening = await tx.packOpening.create({
        data: {
          userId: options.viewerId,
          setId: set.id,
          runId: options.runId,
          batchId: batch.id,
          randomSeed,
          auditHash,
          notes: `RewardGrant:${grant.id}`,
        },
      });

      await tx.packPull.createMany({
        data: pulls.map((pull) => ({
          openingId: opening.id,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          slotIndex: pull.slotIndex,
          rarity: pull.rarity,
        })),
      });

      await tx.collectionEntry.createMany({
        data: pulls.map((pull) => ({
          userId: options.viewerId,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          runId: options.runId,
          source: OwnershipSource.PACK_OPENING,
          sourceReferenceId: opening.id,
        })),
      });
    }

    return batch.id;
  });

  const [reward, batch] = await Promise.all([
    fetchRewardGrantWithPackSet(prisma, options.rewardGrantId),
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
  const viewer = await prisma.user.findUnique({
    where: {
      id: options.viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const set = await loadSetOrThrow(prisma, options.setId);
  const randomSeed = randomUUID();
  const auditHash = createHash("sha1")
    .update(`${viewer.id}:${set.id}:${randomSeed}:${Date.now()}`)
    .digest("hex");

  const pulls = buildPackPulls(set);

  const createdOpeningId = await prisma.$transaction(async (tx) => {
    let batchId: string | null = null;

    if (options.runId) {
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
          const existingOpening = await tx.packOpening.findFirst({
            where: {
              batchId: existingBatch.id,
            },
            orderBy: {
              openedAt: "asc",
            },
          });

          if (existingOpening) {
            return existingOpening.id;
          }
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

      const economy = normalizePackEconomy({
        packPrice: unlock?.packPrice,
        displaySize: unlock?.displaySize,
        defaultPackPrice: run.defaultPackPrice,
        defaultDisplaySize: run.defaultDisplaySize,
      });
      const totalCost = options.chargeCredits === false ? 0 : economy.packPrice;
      const wallet = await getOrCreateWallet(tx, {
        runId: options.runId,
        userId: viewer.id,
      });

      if (totalCost > 0) {
        assertSufficientCredits({
          balance: wallet.balance,
          cost: totalCost,
        });
        const balanceAfter = applyLedgerAmount({
          balance: wallet.balance,
          amount: -totalCost,
        });

        await tx.creditWallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            balance: balanceAfter,
          },
        });
        await tx.creditLedgerEntry.create({
          data: {
            runId: options.runId,
            walletId: wallet.id,
            userId: viewer.id,
            amount: -totalCost,
            balanceAfter,
            source: "PACK_PURCHASE",
            referenceType: "PackOpeningBatch",
            idempotencyKey: options.idempotencyKey ?? null,
            note: `Pack gekauft: ${set.name}`,
          },
        });
      }

      const batch = await tx.packOpeningBatch.create({
        data: {
          runId: options.runId,
          userId: viewer.id,
          setId: set.id,
          type: "SINGLE_PACK",
          quantity: 1,
          totalCost,
          idempotencyKey: options.idempotencyKey ?? null,
        },
      });
      batchId = batch.id;
    }

    const opening = await tx.packOpening.create({
      data: {
        userId: viewer.id,
        setId: set.id,
        runId: options.runId ?? null,
        batchId,
        randomSeed,
        auditHash,
      },
    });

    await tx.packPull.createMany({
      data: pulls.map((pull) => ({
        openingId: opening.id,
        cardId: pull.cardId,
        setCardId: pull.setCardId,
        slotIndex: pull.slotIndex,
        rarity: pull.rarity,
      })),
    });

    await tx.collectionEntry.createMany({
      data: pulls.map((pull) => ({
        userId: viewer.id,
        cardId: pull.cardId,
        setCardId: pull.setCardId,
        runId: options.runId ?? null,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: opening.id,
      })),
    });

    return opening.id;
  });

  return serializeOpening(await fetchOpeningSummary(prisma, createdOpeningId));
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
  const viewer = await prisma.user.findUnique({
    where: {
      id: options.viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const set = await loadSetOrThrow(prisma, options.setId);

  const createdBatchId = await prisma.$transaction(async (tx) => {
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

    assertSufficientCredits({
      balance: wallet.balance,
      cost: economy.displayCost,
    });

    const balanceAfter = applyLedgerAmount({
      balance: wallet.balance,
      amount: -economy.displayCost,
    });
    await tx.creditWallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balance: balanceAfter,
      },
    });

    const batch = await tx.packOpeningBatch.create({
      data: {
        runId: options.runId,
        userId: viewer.id,
        setId: set.id,
        type: "DISPLAY",
        quantity: economy.displaySize,
        totalCost: economy.displayCost,
        idempotencyKey: options.idempotencyKey ?? null,
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

    for (let index = 0; index < economy.displaySize; index += 1) {
      const randomSeed = randomUUID();
      const auditHash = createHash("sha1")
        .update(`${viewer.id}:${set.id}:${randomSeed}:${Date.now()}:${index}`)
        .digest("hex");
      const pulls = buildPackPulls(set);
      const opening = await tx.packOpening.create({
        data: {
          userId: viewer.id,
          setId: set.id,
          runId: options.runId,
          batchId: batch.id,
          randomSeed,
          auditHash,
        },
      });

      await tx.packPull.createMany({
        data: pulls.map((pull) => ({
          openingId: opening.id,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          slotIndex: pull.slotIndex,
          rarity: pull.rarity,
        })),
      });

      await tx.collectionEntry.createMany({
        data: pulls.map((pull) => ({
          userId: viewer.id,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          runId: options.runId,
          source: OwnershipSource.PACK_OPENING,
          sourceReferenceId: opening.id,
        })),
      });
    }

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
