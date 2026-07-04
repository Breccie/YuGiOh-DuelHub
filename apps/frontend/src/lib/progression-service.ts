import type { Prisma, PrismaClient, RunRole } from "@prisma/client";
import {
  assertCheckpointCanApply,
  assertPromoCanBeClaimed,
  getCheckpointStatusAfterTournamentCompletion,
} from "@ygo/domain";
import { DomainError } from "@ygo/domain";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { requireRunMembership } from "@/lib/run-service";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

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

export async function applyProgressionCheckpoint(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  checkpointId: string,
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

  const applyState = assertCheckpointCanApply(checkpoint.status);

  const appliedCheckpoint =
    applyState === "already_applied"
      ? checkpoint
      : await prisma.$transaction(async (tx) => {
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

          await tx.playGroupRun.update({
            where: {
              id: runId,
            },
            data: {
              historyCursor: checkpoint.unlockDate ?? undefined,
            },
          });

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
