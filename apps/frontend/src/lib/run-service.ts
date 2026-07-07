import type { Prisma, PrismaClient, RunRole } from "@prisma/client";
import { DomainError, applyLedgerAmount } from "@ygo/domain";
import { isStandardProgressionPack } from "@/lib/pack-product-classification";

const DEFAULT_RUN_NAME = "DM Progression 2002";
const DEFAULT_RUN_DESCRIPTION =
  "Automatisch angelegte Freundesrunde für bestehende Duel-Hub-Daten.";
const DEBUG_CREDIT_BALANCE = 999_999_999;
const DEBUG_CREDIT_DUELIST_IDS = new Set(["YUGI-001", "YUGIMOTO", "YUGI001"]);
const INITIAL_UNLOCK_COUNT = 5;

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type RunWithMemberships = Prisma.PlayGroupRunGetPayload<{
  include: {
    memberships: true;
    _count: {
      select: {
        memberships: true;
      };
    };
  };
}>;

export function serializeRun(run: RunWithMemberships, viewerId: string) {
  const viewerMembership = run.memberships.find(
    (membership) => membership.userId === viewerId,
  );

  return {
    id: run.id,
    ownerId: run.ownerId,
    name: run.name,
    description: run.description ?? null,
    status: run.status,
    historyCursor: run.historyCursor?.toISOString() ?? null,
    defaultPackPrice: run.defaultPackPrice,
    defaultDisplaySize: run.defaultDisplaySize,
    freePacksPerSetUnlock: run.freePacksPerSetUnlock,
    tournamentWinnerCredits: run.tournamentWinnerCredits,
    tournamentRunnerUpCredits: run.tournamentRunnerUpCredits,
    tournamentParticipationCredits: run.tournamentParticipationCredits,
    startingCredits: run.startingCredits,
    viewerRole: viewerMembership?.role ?? ("PLAYER" as RunRole),
    memberCount: run._count.memberships,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function serializeWallet(
  wallet: Prisma.CreditWalletGetPayload<Record<string, never>>,
) {
  return {
    id: wallet.id,
    runId: wallet.runId,
    userId: wallet.userId,
    balance: wallet.balance,
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export function serializeLedgerEntry(
  entry: Prisma.CreditLedgerEntryGetPayload<Record<string, never>>,
) {
  return {
    id: entry.id,
    runId: entry.runId,
    userId: entry.userId,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    source: entry.source,
    referenceType: entry.referenceType ?? null,
    referenceId: entry.referenceId ?? null,
    note: entry.note ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

async function backfillLegacyUserData(
  prisma: Prisma.TransactionClient,
  userId: string,
  runId: string,
) {
  await Promise.all([
    prisma.collectionEntry.updateMany({
      where: {
        userId,
        runId: null,
      },
      data: {
        runId,
      },
    }),
    prisma.packOpening.updateMany({
      where: {
        userId,
        runId: null,
      },
      data: {
        runId,
      },
    }),
    prisma.deck.updateMany({
      where: {
        userId,
        runId: null,
      },
      data: {
        runId,
      },
    }),
    prisma.collectionBinder.updateMany({
      where: {
        userId,
        runId: null,
      },
      data: {
        runId,
      },
    }),
    prisma.trade.updateMany({
      where: {
        runId: null,
        OR: [{ proposerId: userId }, { responderId: userId }],
      },
      data: {
        runId,
      },
    }),
    prisma.duelRequest.updateMany({
      where: {
        runId: null,
        OR: [{ requesterId: userId }, { opponentId: userId }],
      },
      data: {
        runId,
      },
    }),
    prisma.tournament.updateMany({
      where: {
        hostId: userId,
        runId: null,
      },
      data: {
        runId,
      },
    }),
  ]);
}

async function ensureInitialSetUnlocks(prisma: PrismaLike, runId: string) {
  const existingUnlockCount = await prisma.runSetUnlock.count({
    where: {
      runId,
    },
  });

  if (existingUnlockCount > 0) {
    return;
  }

  const initialSets = (
    await prisma.cardSet.findMany({
      where: {
        isOpenable: true,
        productType: {
          in: ["CORE_BOOSTER", "BOOSTER"],
        },
      },
      orderBy: [{ releaseDate: "asc" }, { code: "asc" }],
      take: 30,
      select: {
        id: true,
        code: true,
        name: true,
        productType: true,
        isOpenable: true,
      },
    })
  )
    .filter(isStandardProgressionPack)
    .slice(0, INITIAL_UNLOCK_COUNT);

  for (const set of initialSets) {
    await prisma.runSetUnlock.upsert({
      where: {
        runId_setId: {
          runId,
          setId: set.id,
        },
      },
      create: {
        runId,
        setId: set.id,
        note: "Initialer Kampagnen-Shop-Unlock.",
      },
      update: {},
    });
  }
}

async function createStartingWallet(
  prisma: Prisma.TransactionClient,
  options: {
    runId: string;
    userId: string;
    startingCredits: number;
  },
) {
  const wallet = await prisma.creditWallet.create({
    data: {
      runId: options.runId,
      userId: options.userId,
      balance: options.startingCredits,
    },
  });

  if (options.startingCredits > 0) {
    await prisma.creditLedgerEntry.create({
      data: {
        runId: options.runId,
        walletId: wallet.id,
        userId: options.userId,
        amount: options.startingCredits,
        balanceAfter: options.startingCredits,
        source: "STARTING_BALANCE",
        note: "Startguthaben für die Runde.",
      },
    });
  }

  return wallet;
}

async function getDebugCreditBalanceForUser(
  prisma: PrismaLike,
  userId: string,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      duelistId: true,
    },
  });

  return user && DEBUG_CREDIT_DUELIST_IDS.has(user.duelistId)
    ? DEBUG_CREDIT_BALANCE
    : null;
}

async function ensureDebugWalletBalance(
  prisma: PrismaLike,
  wallet: Prisma.CreditWalletGetPayload<Record<string, never>>,
) {
  const debugBalance = await getDebugCreditBalanceForUser(prisma, wallet.userId);

  if (debugBalance === null || wallet.balance >= debugBalance) {
    return wallet;
  }

  const amount = debugBalance - wallet.balance;
  const updatedWallet = await prisma.creditWallet.update({
    where: {
      id: wallet.id,
    },
    data: {
      balance: debugBalance,
    },
  });

  await prisma.creditLedgerEntry.create({
    data: {
      runId: wallet.runId,
      walletId: wallet.id,
      userId: wallet.userId,
      amount,
      balanceAfter: debugBalance,
      source: "MANUAL_GRANT",
      note: "Debug-Guthaben für Packtests.",
    },
  });

  return updatedWallet;
}

export async function ensureDefaultRun(prisma: PrismaClient, userId: string) {
  const existingMembership = await prisma.runMembership.findFirst({
    where: {
      userId,
      run: {
        status: "ACTIVE",
      },
    },
    orderBy: {
      joinedAt: "asc",
    },
    include: {
      run: {
        include: {
          memberships: true,
          _count: {
            select: {
              memberships: true,
            },
          },
        },
      },
    },
  });

  if (existingMembership) {
    await prisma.user.updateMany({
      where: {
        id: userId,
        activeRunId: null,
      },
      data: {
        activeRunId: existingMembership.runId,
      },
    });

    await ensureInitialSetUnlocks(prisma, existingMembership.runId);

    return existingMembership.run;
  }

  return prisma.$transaction(async (tx) => {
    const run = await tx.playGroupRun.create({
      data: {
        ownerId: userId,
        name: DEFAULT_RUN_NAME,
        description: DEFAULT_RUN_DESCRIPTION,
        defaultPackPrice: 100,
        defaultDisplaySize: 24,
        freePacksPerSetUnlock: 24,
        tournamentWinnerCredits: 300,
        tournamentRunnerUpCredits: 150,
        tournamentParticipationCredits: 50,
        startingCredits: 2400,
        memberships: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        memberships: true,
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    await createStartingWallet(tx, {
      runId: run.id,
      userId,
      startingCredits: run.startingCredits,
    });
    await ensureInitialSetUnlocks(tx, run.id);
    await backfillLegacyUserData(tx, userId, run.id);
    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        activeRunId: run.id,
      },
    });

    return run;
  });
}

export async function listRuns(prisma: PrismaClient, userId: string) {
  await ensureDefaultRun(prisma, userId);

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        activeRunId: true,
      },
    }),
    prisma.runMembership.findMany({
      where: {
        userId,
      },
      orderBy: {
        joinedAt: "asc",
      },
      include: {
        run: {
          include: {
            memberships: true,
            _count: {
              select: {
                memberships: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    activeRunId: user?.activeRunId ?? null,
    runs: memberships.map((membership) =>
      serializeRun(membership.run, userId),
    ),
  };
}

export async function getActiveRun(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      activeRunId: true,
    },
  });

  if (user?.activeRunId) {
    const membership = await prisma.runMembership.findUnique({
      where: {
        runId_userId: {
          runId: user.activeRunId,
          userId,
        },
      },
      include: {
        run: {
          include: {
            memberships: true,
            _count: {
              select: {
                memberships: true,
              },
            },
          },
        },
      },
    });

    if (membership) {
      return membership.run;
    }
  }

  return ensureDefaultRun(prisma, userId);
}

export async function requireRunMembership(
  prisma: PrismaLike,
  options: {
    runId: string;
    userId: string;
    organizerOnly?: boolean;
  },
) {
  const membership = await prisma.runMembership.findUnique({
    where: {
      runId_userId: {
        runId: options.runId,
        userId: options.userId,
      },
    },
  });

  if (!membership) {
    throw new DomainError({
      code: "not_run_member",
      message: "Du bist kein Mitglied dieser Runde.",
      status: 403,
    });
  }

  if (
    options.organizerOnly &&
    membership.role !== "OWNER" &&
    membership.role !== "ORGANIZER"
  ) {
    throw new DomainError({
      code: "not_run_organizer",
      message: "Nur Organizer können diese Aktion ausführen.",
      status: 403,
    });
  }

  return membership;
}

export async function createRun(
  prisma: PrismaClient,
  userId: string,
  input: {
    name: string;
    description?: string | null;
    startingCredits?: number;
    defaultPackPrice?: number;
    defaultDisplaySize?: number;
    freePacksPerSetUnlock?: number;
    tournamentWinnerCredits?: number;
    tournamentRunnerUpCredits?: number;
    tournamentParticipationCredits?: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.playGroupRun.create({
      data: {
        ownerId: userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        startingCredits: input.startingCredits ?? 2400,
        defaultPackPrice: input.defaultPackPrice ?? 100,
        defaultDisplaySize: input.defaultDisplaySize ?? 24,
        freePacksPerSetUnlock: input.freePacksPerSetUnlock ?? 24,
        tournamentWinnerCredits: input.tournamentWinnerCredits ?? 300,
        tournamentRunnerUpCredits: input.tournamentRunnerUpCredits ?? 150,
        tournamentParticipationCredits: input.tournamentParticipationCredits ?? 50,
        memberships: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        memberships: true,
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    await createStartingWallet(tx, {
      runId: run.id,
      userId,
      startingCredits: run.startingCredits,
    });
    await ensureInitialSetUnlocks(tx, run.id);
    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        activeRunId: run.id,
      },
    });

    return run;
  });
}

export async function updateRunSettings(
  prisma: PrismaClient,
  options: {
    runId: string;
    viewerId: string;
    defaultPackPrice?: number;
    defaultDisplaySize?: number;
    freePacksPerSetUnlock?: number;
    tournamentWinnerCredits?: number;
    tournamentRunnerUpCredits?: number;
    tournamentParticipationCredits?: number;
  },
) {
  await requireRunMembership(prisma, {
    runId: options.runId,
    userId: options.viewerId,
    organizerOnly: true,
  });

  const run = await prisma.playGroupRun.update({
    where: {
      id: options.runId,
    },
    data: {
      defaultPackPrice: options.defaultPackPrice,
      defaultDisplaySize: options.defaultDisplaySize,
      freePacksPerSetUnlock: options.freePacksPerSetUnlock,
      tournamentWinnerCredits: options.tournamentWinnerCredits,
      tournamentRunnerUpCredits: options.tournamentRunnerUpCredits,
      tournamentParticipationCredits: options.tournamentParticipationCredits,
    },
    include: {
      memberships: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  return serializeRun(run, options.viewerId);
}

export async function setActiveRun(
  prisma: PrismaClient,
  options: {
    runId: string;
    userId: string;
  },
) {
  await requireRunMembership(prisma, options);

  await prisma.user.update({
    where: {
      id: options.userId,
    },
    data: {
      activeRunId: options.runId,
    },
  });

  return getActiveRun(prisma, options.userId);
}

export async function getOrCreateWallet(
  prisma: PrismaLike,
  options: {
    runId: string;
    userId: string;
  },
) {
  const existing = await prisma.creditWallet.findUnique({
    where: {
      runId_userId: {
        runId: options.runId,
        userId: options.userId,
      },
    },
  });

  if (existing) {
    return ensureDebugWalletBalance(prisma, existing);
  }

  const membership = await prisma.runMembership.findUnique({
    where: {
      runId_userId: {
        runId: options.runId,
        userId: options.userId,
      },
    },
    include: {
      run: true,
    },
  });

  if (!membership) {
    throw new DomainError({
      code: "not_run_member",
      message: "Du bist kein Mitglied dieser Runde.",
      status: 403,
    });
  }

  const wallet = await prisma.creditWallet.create({
    data: {
      runId: options.runId,
      userId: options.userId,
      balance: membership.run.startingCredits,
    },
  });

  if (membership.run.startingCredits > 0) {
    await prisma.creditLedgerEntry.create({
      data: {
        runId: options.runId,
        walletId: wallet.id,
        userId: options.userId,
        amount: membership.run.startingCredits,
        balanceAfter: membership.run.startingCredits,
        source: "STARTING_BALANCE",
        note: "Startguthaben für die Runde.",
      },
    });
  }

  return ensureDebugWalletBalance(prisma, wallet);
}

export async function creditWallet(
  prisma: PrismaLike,
  options: {
    runId: string;
    userId: string;
    amount: number;
    source:
      | "DUEL_REWARD"
      | "TOURNAMENT_REWARD"
      | "ORGANIZER_ADJUSTMENT"
      | "MANUAL_GRANT";
    referenceType?: string | null;
    referenceId?: string | null;
    note?: string | null;
  },
) {
  const wallet = await getOrCreateWallet(prisma, options);
  const balanceAfter = applyLedgerAmount({
    balance: wallet.balance,
    amount: options.amount,
  });

  const updatedWallet = await prisma.creditWallet.update({
    where: {
      id: wallet.id,
    },
    data: {
      balance: balanceAfter,
    },
  });

  await prisma.creditLedgerEntry.create({
    data: {
      runId: options.runId,
      walletId: wallet.id,
      userId: options.userId,
      amount: options.amount,
      balanceAfter,
      source: options.source,
      referenceType: options.referenceType ?? null,
      referenceId: options.referenceId ?? null,
      note: options.note?.trim() || null,
    },
  });

  return updatedWallet;
}
