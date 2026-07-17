import type { Prisma, PrismaClient, RunRole } from "@prisma/client";
import {
  assertCheckpointCanApply,
  assertPromoCanBeClaimed,
  getCheckpointStatusAfterTournamentCompletion,
} from "@ygo/domain";
import { DomainError } from "@ygo/domain";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getActiveCampaignRuleVersionId } from "@/lib/campaign-rule-service";
import {
  isStandardProgressionPack,
  isTournamentRewardPack,
} from "@/lib/pack-product-classification";
import { requireRunMembership } from "@/lib/run-service";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type GenerateProgressionOptions = {
  count?: number;
  fromDate?: string | null;
  setsPerCheckpoint?: number;
  includePromos?: boolean;
  includeTournamentPacks?: boolean;
};

type CheckpointWithUnlocks = Prisma.RunProgressionCheckpointGetPayload<{
  include: {
    unlocks: {
      include: {
        set: true;
        promoSource: true;
        historyEvent: true;
      };
      orderBy: {
        createdAt: "asc";
      };
    };
  };
}>;

type PromoSourceWithCards = Prisma.PromoSourceGetPayload<{
  include: {
    runAccesses: true;
    cards: {
      include: {
        setCard: {
          include: {
            card: true;
          };
        };
      };
      orderBy: [{ sortOrder: "asc" }, { setCard: { setCode: "asc" } }];
    };
  };
}>;

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new DomainError({
      code: "validation_error",
      message: "fromDate ist kein gültiges Datum.",
      status: 400,
    });
  }

  return date;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function defaultRewardConfig(
  packSetId: string | null,
  run: {
    tournamentWinnerCredits: number;
    tournamentRunnerUpCredits: number;
    tournamentParticipationCredits: number;
  },
) {
  return {
    placements: [
      {
        rank: 1,
        credits: run.tournamentWinnerCredits,
        packSetId,
        packQuantity: packSetId ? 2 : 0,
      },
      {
        rank: 2,
        credits: run.tournamentRunnerUpCredits,
        packSetId,
        packQuantity: packSetId ? 1 : 0,
      },
      {
        fromRank: 3,
        toRank: 8,
        credits: run.tournamentParticipationCredits,
      },
    ],
  };
}

function buildSetUnlockFreePackReason(options: {
  checkpointId: string;
  unlockId: string;
  setId: string;
}) {
  return `SET_UNLOCK_FREE_PACKS | ${options.checkpointId} | ${options.unlockId} | ${options.setId}`;
}

export function serializeProgressionUnlock(
  unlock: CheckpointWithUnlocks["unlocks"][number],
) {
  return {
    id: unlock.id,
    checkpointId: unlock.checkpointId,
    runId: unlock.runId,
    type: unlock.type,
    setId: unlock.setId ?? null,
    setName: unlock.set?.name ?? null,
    setCode: unlock.set?.code ?? null,
    promoSourceId: unlock.promoSourceId ?? null,
    promoSourceName: unlock.promoSource?.name ?? null,
    historyEventId: unlock.historyEventId ?? null,
    historyEventTitle: unlock.historyEvent?.title ?? null,
    rewardConfig: unlock.rewardConfig ?? null,
  };
}

export function serializeCheckpoint(checkpoint: CheckpointWithUnlocks) {
  return {
    id: checkpoint.id,
    runId: checkpoint.runId,
    sequence: checkpoint.sequence,
    title: checkpoint.title,
    description: checkpoint.description ?? null,
    unlockDate: iso(checkpoint.unlockDate),
    requiredTournamentId: checkpoint.requiredTournamentId ?? null,
    status: checkpoint.status,
    appliedAt: iso(checkpoint.appliedAt),
    unlocks: checkpoint.unlocks.map(serializeProgressionUnlock),
  };
}

function serializePromoClaim(claim: {
  id: string;
  runId: string;
  promoSourceId: string;
  userId: string;
  setCardId: string;
  collectionEntryId: string | null;
  claimedAt: Date;
}) {
  return {
    id: claim.id,
    runId: claim.runId,
    promoSourceId: claim.promoSourceId,
    userId: claim.userId,
    setCardId: claim.setCardId,
    collectionEntryId: claim.collectionEntryId ?? null,
    claimedAt: claim.claimedAt.toISOString(),
  };
}

export function serializePromoSource(
  source: PromoSourceWithCards,
  claimedCopiesBySetCardId: Map<string, number>,
) {
  const access = source.runAccesses[0] ?? null;

  return {
    id: source.id,
    code: source.code,
    name: source.name,
    description: source.description ?? null,
    sourceType: source.sourceType,
    claimMode: source.claimMode,
    availableFrom: iso(source.availableFrom),
    isUnlocked: Boolean(access),
    unlockedAt: iso(access?.unlockedAt),
    cards: source.cards.map((entry) => ({
      setCardId: entry.setCardId,
      cardId: entry.cardId,
      name: entry.setCard.card.name,
      imageUrl: getCardAssetUrl(entry.setCard.card.externalCardId),
      rarity: entry.setCard.rarity ?? null,
      setCode: entry.setCard.setCode,
      claimedCopies: claimedCopiesBySetCardId.get(entry.setCardId) ?? 0,
    })),
  };
}

export async function getRunProgression(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
) {
  await requireRunMembership(prisma, {
    runId,
    userId: viewerId,
  });

  const [membership, run, checkpoints] = await Promise.all([
    prisma.runMembership.findUnique({
      where: {
        runId_userId: {
          runId,
          userId: viewerId,
        },
      },
    }),
    prisma.playGroupRun.findUniqueOrThrow({
      where: {
        id: runId,
      },
      include: {
        memberships: true,
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    }),
    prisma.runProgressionCheckpoint.findMany({
      where: {
        runId,
      },
      orderBy: {
        sequence: "asc",
      },
      include: {
        unlocks: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            set: true,
            promoSource: true,
            historyEvent: true,
          },
        },
      },
    }),
  ]);

  const currentCheckpoint =
    [...checkpoints].reverse().find((checkpoint) => checkpoint.status === "APPLIED") ??
    null;
  const nextCheckpoint =
    checkpoints.find((checkpoint) => checkpoint.status !== "APPLIED") ?? null;

  return {
    run: {
      id: run.id,
      name: run.name,
      historyCursor: iso(run.historyCursor),
      viewerRole: membership?.role ?? ("PLAYER" as RunRole),
    },
    currentCheckpoint: currentCheckpoint
      ? serializeCheckpoint(currentCheckpoint)
      : null,
    nextCheckpoint: nextCheckpoint ? serializeCheckpoint(nextCheckpoint) : null,
    readyCheckpoints: checkpoints
      .filter((checkpoint) => checkpoint.status === "READY")
      .map(serializeCheckpoint),
  };
}

export async function generateRunProgression(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  options: GenerateProgressionOptions = {},
) {
  await requireRunMembership(prisma, {
    runId,
    userId: viewerId,
    organizerOnly: true,
  });

  const run = await prisma.playGroupRun.findUnique({
    where: {
      id: runId,
    },
  });

  if (!run) {
    throw new DomainError({
      code: "run_required",
      message: "Für diese Aktion wird eine gültige Runde benötigt.",
      status: 404,
    });
  }

  const count = options.count ?? 5;
  const setsPerCheckpoint = options.setsPerCheckpoint ?? 1;
  const includePromos = options.includePromos ?? true;
  const includeTournamentPacks = options.includeTournamentPacks ?? true;
  const fromDate = parseOptionalDate(options.fromDate) ?? run.historyCursor ?? null;

  const [
    existingSetUnlocks,
    existingProgressionUnlocks,
    maxCheckpoint,
    allSets,
    allRewardPackSets,
    promoSources,
    historyEvents,
  ] = await Promise.all([
    prisma.runSetUnlock.findMany({
      where: {
        runId,
      },
      select: {
        setId: true,
      },
    }),
    prisma.runProgressionUnlock.findMany({
      where: {
        runId,
      },
      select: {
        setId: true,
        promoSourceId: true,
        historyEventId: true,
      },
    }),
    prisma.runProgressionCheckpoint.findFirst({
      where: {
        runId,
      },
      orderBy: {
        sequence: "desc",
      },
      select: {
        sequence: true,
      },
    }),
    prisma.cardSet.findMany({
      where: {
        isOpenable: true,
        releaseDate: fromDate
          ? {
              gte: fromDate,
            }
          : undefined,
      },
      orderBy: [{ releaseDate: "asc" }, { code: "asc" }],
    }),
    includeTournamentPacks
      ? prisma.cardSet.findMany({
          where: {
            isOpenable: true,
          },
          orderBy: [{ releaseDate: "asc" }, { code: "asc" }],
        })
      : Promise.resolve([]),
    includePromos
      ? prisma.promoSource.findMany({
          where: {
            sourceType: {
              not: "PACK_REWARD",
            },
          },
          orderBy: [{ availableFrom: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    prisma.historyEvent.findMany({
      where: {
        runId,
        isUnlocked: false,
      },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const plannedSetIds = new Set(
    existingProgressionUnlocks
      .map((unlock) => unlock.setId)
      .filter((setId): setId is string => Boolean(setId)),
  );
  const unavailableSetIds = new Set([
    ...existingSetUnlocks.map((unlock) => unlock.setId),
    ...plannedSetIds,
  ]);
  const plannedPromoSourceIds = new Set(
    existingProgressionUnlocks
      .map((unlock) => unlock.promoSourceId)
      .filter((promoSourceId): promoSourceId is string => Boolean(promoSourceId)),
  );
  const plannedHistoryEventIds = new Set(
    existingProgressionUnlocks
      .map((unlock) => unlock.historyEventId)
      .filter((historyEventId): historyEventId is string => Boolean(historyEventId)),
  );
  const boosterSets = allSets
    .filter(isStandardProgressionPack)
    .filter((set) => !unavailableSetIds.has(set.id))
    .slice(0, count * setsPerCheckpoint);
  const tournamentPackSets = includeTournamentPacks
    ? allRewardPackSets.filter((set) => isTournamentRewardPack(set))
    : [];
  const promoQueue = promoSources.filter(
    (source) => !plannedPromoSourceIds.has(source.id),
  );
  const historyEventQueue = historyEvents.filter(
    (event) => !plannedHistoryEventIds.has(event.id),
  );
  const setChunks = chunkArray(boosterSets, setsPerCheckpoint).slice(0, count);

  if (setChunks.length === 0) {
    throw new DomainError({
      code: "progression_generation_empty",
      message: "Keine neuen chronologischen Booster für weitere Checkpoints gefunden.",
      status: 409,
    });
  }

  const createdCheckpoints = await prisma.$transaction(async (tx) => {
    const ruleVersionId = await getActiveCampaignRuleVersionId(tx, runId);
    const created: CheckpointWithUnlocks[] = [];
    let sequence = maxCheckpoint?.sequence ?? 0;
    let lastTournamentPackId: string | null = null;

    for (const setChunk of setChunks) {
      sequence += 1;
      const unlockDate = setChunk[setChunk.length - 1]?.releaseDate ?? null;
      const boosterNames = setChunk.map((set) => set.name).join(", ");
      const checkpoint = await tx.runProgressionCheckpoint.create({
        data: {
          runId,
          sequence,
          title:
            setChunk.length === 1
              ? `History-Step ${sequence}: ${setChunk[0]!.name}`
              : `History-Step ${sequence}: ${setChunk[0]!.code}-${setChunk[setChunk.length - 1]!.code}`,
          description: `Automatisch generierter Checkpoint für ${boosterNames}.`,
          unlockDate,
          status: "LOCKED",
          ruleVersionId,
        },
      });

      for (const set of setChunk) {
        await tx.runProgressionUnlock.create({
          data: {
            checkpointId: checkpoint.id,
            runId,
            type: "SET",
            setId: set.id,
          },
        });
      }

      if (includePromos && unlockDate) {
        const promoUnlocks = promoQueue.filter(
          (source) =>
            source.availableFrom &&
            source.availableFrom.getTime() <= unlockDate.getTime(),
        );

        for (const source of promoUnlocks) {
          await tx.runProgressionUnlock.create({
            data: {
              checkpointId: checkpoint.id,
              runId,
              type: "PROMO_SOURCE",
              promoSourceId: source.id,
            },
          });
          plannedPromoSourceIds.add(source.id);
        }

        for (let index = promoQueue.length - 1; index >= 0; index -= 1) {
          if (plannedPromoSourceIds.has(promoQueue[index]!.id)) {
            promoQueue.splice(index, 1);
          }
        }
      }

      if (unlockDate) {
        const eventUnlocks = historyEventQueue.filter(
          (event) =>
            event.eventDate && event.eventDate.getTime() <= unlockDate.getTime(),
        );

        for (const event of eventUnlocks) {
          await tx.runProgressionUnlock.create({
            data: {
              checkpointId: checkpoint.id,
              runId,
              type: "HISTORY_EVENT",
              historyEventId: event.id,
            },
          });
          plannedHistoryEventIds.add(event.id);
        }

        for (let index = historyEventQueue.length - 1; index >= 0; index -= 1) {
          if (plannedHistoryEventIds.has(historyEventQueue[index]!.id)) {
            historyEventQueue.splice(index, 1);
          }
        }
      }

      const rewardPack =
        unlockDate && includeTournamentPacks
          ? [...tournamentPackSets]
              .filter((set) => set.releaseDate.getTime() <= unlockDate.getTime())
              .at(-1) ?? null
          : null;
      lastTournamentPackId = rewardPack?.id ?? lastTournamentPackId;

      await tx.runProgressionUnlock.create({
        data: {
          checkpointId: checkpoint.id,
          runId,
          type: "REWARD",
          rewardConfig: defaultRewardConfig(lastTournamentPackId, run),
        },
      });

      const createdCheckpoint = await tx.runProgressionCheckpoint.findUniqueOrThrow({
        where: {
          id: checkpoint.id,
        },
        include: {
          unlocks: {
            orderBy: {
              createdAt: "asc",
            },
            include: {
              set: true,
              promoSource: true,
              historyEvent: true,
            },
          },
        },
      });
      created.push(createdCheckpoint);
    }

    return created;
  });

  return {
    generatedCheckpoints: createdCheckpoints.map(serializeCheckpoint),
    progression: await getRunProgression(prisma, viewerId, runId),
  };
}

export async function applyProgressionCheckpoint(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  checkpointId: string,
  options: {
    force?: boolean;
  } = {},
) {
  await requireRunMembership(prisma, {
    runId,
    userId: viewerId,
    organizerOnly: true,
  });

  const checkpoint = await prisma.runProgressionCheckpoint.findFirst({
    where: {
      id: checkpointId,
      runId,
    },
    include: {
      unlocks: {
        orderBy: {
          createdAt: "asc",
        },
        include: {
          set: true,
          promoSource: true,
          historyEvent: true,
        },
      },
    },
  });

  if (!checkpoint) {
    throw new DomainError({
      code: "checkpoint_not_found",
      message: "Dieser Fortschritt wurde nicht gefunden.",
      status: 404,
    });
  }

  const applyState = options.force && checkpoint.status === "LOCKED"
    ? "can_apply"
    : assertCheckpointCanApply(checkpoint.status);

  const appliedCheckpoint =
    applyState === "already_applied"
      ? checkpoint
      : await prisma.$transaction(async (tx) => {
          const ruleVersionId = checkpoint.ruleVersionId
            ?? await getActiveCampaignRuleVersionId(tx, runId);
          const [run, memberships] = await Promise.all([
            tx.playGroupRun.findUniqueOrThrow({
              where: {
                id: runId,
              },
              select: {
                freePacksPerSetUnlock: true,
              },
            }),
            tx.runMembership.findMany({
              where: {
                runId,
              },
              select: {
                userId: true,
              },
            }),
          ]);

          for (const unlock of checkpoint.unlocks) {
            if (unlock.type === "SET" && unlock.setId) {
              await tx.runSetUnlock.upsert({
                where: {
                  runId_setId: {
                    runId,
                    setId: unlock.setId,
                  },
                },
                create: {
                  runId,
                  setId: unlock.setId,
                  unlockedAt: new Date(),
                },
                update: {
                  unlockedAt: new Date(),
                },
              });

              if (run.freePacksPerSetUnlock > 0) {
                const reason = buildSetUnlockFreePackReason({
                  checkpointId: checkpoint.id,
                  unlockId: unlock.id,
                  setId: unlock.setId,
                });
                const existingGrants = await tx.rewardGrant.findMany({
                  where: {
                    runId,
                    packSetId: unlock.setId,
                    reason,
                  },
                  select: {
                    recipientId: true,
                  },
                });
                const grantedRecipientIds = new Set(
                  existingGrants.map((grant) => grant.recipientId),
                );
                const missingMemberships = memberships.filter(
                  (membership) => !grantedRecipientIds.has(membership.userId),
                );

                if (missingMemberships.length > 0) {
                  await tx.rewardGrant.createMany({
                    data: missingMemberships.map((membership) => ({
                      runId,
                      recipientId: membership.userId,
                      grantedById: viewerId,
                      amountCredits: 0,
                      packSetId: unlock.setId,
                      packQuantity: run.freePacksPerSetUnlock,
                      reason,
                      status: "PENDING",
                      ruleVersionId,
                    })),
                  });
                }
              }
            }

            if (unlock.type === "PROMO_SOURCE" && unlock.promoSourceId) {
              await tx.runPromoAccess.upsert({
                where: {
                  runId_promoSourceId: {
                    runId,
                    promoSourceId: unlock.promoSourceId,
                  },
                },
                create: {
                  runId,
                  promoSourceId: unlock.promoSourceId,
                  unlockedById: viewerId,
                  sourceCheckpointId: checkpoint.id,
                },
                update: {
                  unlockedById: viewerId,
                  sourceCheckpointId: checkpoint.id,
                },
              });
            }

            if (unlock.type === "HISTORY_EVENT" && unlock.historyEventId) {
              await tx.historyEvent.updateMany({
                where: {
                  id: unlock.historyEventId,
                  runId,
                },
                data: {
                  isUnlocked: true,
                },
              });
            }
          }

          if (checkpoint.unlockDate) {
            const currentRun = await tx.playGroupRun.findUnique({
              where: {
                id: runId,
              },
              select: {
                historyCursor: true,
              },
            });

            if (
              !currentRun?.historyCursor ||
              checkpoint.unlockDate.getTime() > currentRun.historyCursor.getTime()
            ) {
              await tx.playGroupRun.update({
                where: {
                  id: runId,
                },
                data: {
                  historyCursor: checkpoint.unlockDate,
                },
              });
            }
          }

          return tx.runProgressionCheckpoint.update({
            where: {
              id: checkpoint.id,
            },
            data: {
              status: "APPLIED",
              appliedAt: new Date(),
            },
            include: {
              unlocks: {
                orderBy: {
                  createdAt: "asc",
                },
                include: {
                  set: true,
                  promoSource: true,
                  historyEvent: true,
                },
              },
            },
          });
        });

  return {
    checkpoint: serializeCheckpoint(appliedCheckpoint),
    progression: await getRunProgression(prisma, viewerId, runId),
  };
}

export async function markTournamentProgressionReady(
  prisma: PrismaLike,
  tournamentId: string,
) {
  const tournament = await prisma.tournament.findUnique({
    where: {
      id: tournamentId,
    },
    select: {
      runId: true,
    },
  });
  const checkpoints = await prisma.runProgressionCheckpoint.findMany({
    where: {
      requiredTournamentId: tournamentId,
    },
  });

  for (const checkpoint of checkpoints) {
    const nextStatus = getCheckpointStatusAfterTournamentCompletion(checkpoint.status);

    if (nextStatus !== checkpoint.status) {
      await prisma.runProgressionCheckpoint.update({
        where: {
          id: checkpoint.id,
        },
        data: {
          status: nextStatus,
        },
      });
    }
  }

  if (!tournament?.runId || checkpoints.length > 0) {
    return;
  }

  const nextUnboundCheckpoint = await prisma.runProgressionCheckpoint.findFirst({
    where: {
      runId: tournament.runId,
      requiredTournamentId: null,
      status: "LOCKED",
    },
    orderBy: {
      sequence: "asc",
    },
  });

  if (!nextUnboundCheckpoint) {
    return;
  }

  await prisma.runProgressionCheckpoint.update({
    where: {
      id: nextUnboundCheckpoint.id,
    },
    data: {
      requiredTournamentId: tournamentId,
      status: "READY",
    },
  });
}

export async function getRunPromos(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
) {
  await requireRunMembership(prisma, {
    runId,
    userId: viewerId,
  });

  const [sources, claims] = await Promise.all([
    prisma.promoSource.findMany({
      orderBy: [{ availableFrom: "asc" }, { name: "asc" }],
      include: {
        runAccesses: {
          where: {
            runId,
          },
          take: 1,
        },
        cards: {
          orderBy: [{ sortOrder: "asc" }, { setCard: { setCode: "asc" } }],
          include: {
            setCard: {
              include: {
                card: true,
              },
            },
          },
        },
      },
    }),
    prisma.promoClaim.groupBy({
      by: ["setCardId"],
      where: {
        runId,
        userId: viewerId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const claimedCopiesBySetCardId = new Map(
    claims.map((claim) => [claim.setCardId, claim._count._all]),
  );

  return {
    sources: sources.map((source) =>
      serializePromoSource(source, claimedCopiesBySetCardId),
    ),
  };
}

export async function claimPromoCard(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  sourceId: string,
  setCardId: string,
) {
  await requireRunMembership(prisma, {
    runId,
    userId: viewerId,
  });

  const source = await prisma.promoSource.findFirst({
    where: {
      id: sourceId,
      runAccesses: {
        some: {
          runId,
        },
      },
    },
    include: {
      cards: {
        where: {
          setCardId,
        },
        include: {
          setCard: true,
        },
      },
    },
  });

  if (!source) {
    throw new DomainError({
      code: "promo_access_required",
      message: "Diese Promo-Quelle ist in der Runde noch nicht freigeschaltet.",
      status: 403,
    });
  }

  assertPromoCanBeClaimed({
    sourceType: source.sourceType,
    claimMode: source.claimMode,
  });

  const sourceCard = source.cards[0] ?? null;

  if (!sourceCard) {
    throw new DomainError({
      code: "set_card_not_in_promo_source",
      message: "Diese Karte gehoert nicht zu dieser Promo-Quelle.",
      status: 400,
    });
  }

  const claim = await prisma.$transaction(async (tx) => {
    const entry = await tx.collectionEntry.create({
      data: {
        runId,
        userId: viewerId,
        cardId: sourceCard.cardId,
        setCardId: sourceCard.setCardId,
        source: "MANUAL_GRANT",
        notes: `Promo-Claim: ${source.name}`,
      },
    });
    const createdClaim = await tx.promoClaim.create({
      data: {
        runId,
        promoSourceId: source.id,
        userId: viewerId,
        setCardId: sourceCard.setCardId,
        collectionEntryId: entry.id,
      },
    });

    await tx.collectionEntry.update({
      where: {
        id: entry.id,
      },
      data: {
        sourceReferenceId: createdClaim.id,
      },
    });

    return createdClaim;
  });

  const promos = await getRunPromos(prisma, viewerId, runId);
  const updatedSource = promos.sources.find((entry) => entry.id === sourceId);

  if (!updatedSource) {
    throw new DomainError({
      code: "promo_access_required",
      message: "Diese Promo-Quelle ist nicht mehr verfügbar.",
      status: 403,
    });
  }

  return {
    claim: serializePromoClaim(claim),
    source: updatedSource,
  };
}
