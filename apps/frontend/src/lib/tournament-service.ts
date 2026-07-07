import type { Prisma, PrismaClient } from "@prisma/client";
import { pairSwissRound } from "@ygo/domain";
import type { TournamentOverviewDto, TournamentStandingsDto } from "@/lib/app-dtos";
import { markTournamentProgressionReady } from "@/lib/progression-service";
import { creditWallet, getActiveRun, requireRunMembership } from "@/lib/run-service";

type TournamentRecord = Prisma.TournamentGetPayload<{
  include: {
    host: true;
    participants: {
      include: {
        user: true;
        invitedBy: true;
      };
    };
    rounds: {
      include: {
        matches: {
          include: {
            playerOne: true;
            playerTwo: true;
            winner: true;
            playerOneDeck: true;
            playerTwoDeck: true;
            duelRequest: {
              include: {
                appointment: true;
                export: true;
              };
            };
          };
        };
      };
    };
    matches: {
      include: {
        playerOne: true;
        playerTwo: true;
        winner: true;
      };
    };
  };
}>;

export type TournamentDetail = {
  overview: TournamentOverviewDto;
  campaign: {
    openMatchCount: number;
    canComplete: boolean;
    rewardGrants: Array<{
      id: string;
      recipientId: string;
      recipientName: string;
      rank: number | null;
      amountCredits: number;
      packQuantity: number;
      packSetName: string | null;
      status: string;
    }>;
    readyCheckpoint: {
      id: string;
      title: string;
      setNames: string[];
      freePacksPerSetUnlock: number;
    } | null;
  };
  participants: Array<{
    id: string;
    status: string;
    seed: number | null;
    joinedAt: string | null;
    duelist: {
      userId: string;
      duelistId: string;
      displayName: string;
    };
  }>;
  rounds: Array<{
    id: string;
    roundNumber: number;
    status: string;
    matches: Array<{
      id: string;
      tableNumber: number | null;
      status: string;
      playerOne: {
        userId: string;
        duelistId: string;
        displayName: string;
      };
      playerTwo: {
        userId: string;
        duelistId: string;
        displayName: string;
      } | null;
      winnerId: string | null;
      playerOneScore: number;
      playerTwoScore: number;
      duelRequestId: string | null;
      confirmedAt: string | null;
      exportPath: string | null;
      playerOneDeckName: string | null;
      playerTwoDeckName: string | null;
    }>;
  }>;
  standings: TournamentStandingsDto;
};

type StandingRow = TournamentStandingsDto["standings"][number];

type TournamentRewardConfig = {
  placements?: Array<{
    rank?: number;
    fromRank?: number;
    toRank?: number;
    credits?: number;
    amountCredits?: number;
    packSetId?: string | null;
    packQuantity?: number;
    note?: string | null;
  }>;
};

function toTournamentOverview(tournament: TournamentRecord): TournamentOverviewDto {
  const acceptedParticipantCount = tournament.participants.filter(
    (participant) => participant.status === "ACCEPTED",
  ).length;

  return {
    id: tournament.id,
    title: tournament.title,
    description: tournament.description ?? null,
    formatLabel: tournament.formatLabel ?? null,
    scheduledAt: tournament.scheduledAt?.toISOString() ?? null,
    status: tournament.status,
    host: {
      userId: tournament.host.id,
      duelistId: tournament.host.duelistId,
      displayName: tournament.host.displayName,
    },
    participantCount: tournament.participants.length,
    acceptedParticipantCount,
    roundCount: tournament.rounds.length,
    latestRound:
      tournament.rounds.length > 0
        ? Math.max(...tournament.rounds.map((round) => round.roundNumber))
        : null,
  };
}

function computeStandings(tournament: TournamentRecord): TournamentStandingsDto {
  const acceptedParticipants = tournament.participants.filter(
    (participant) => participant.status === "ACCEPTED",
  );
  const standings = new Map<
    string,
    {
      userId: string;
      duelistId: string;
      displayName: string;
      matchPoints: number;
      wins: number;
      losses: number;
      draws: number;
      byes: number;
      opponents: string[];
      matchesPlayed: number;
    }
  >();

  for (const participant of acceptedParticipants) {
    standings.set(participant.userId, {
      userId: participant.userId,
      duelistId: participant.user.duelistId,
      displayName: participant.user.displayName,
      matchPoints: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      byes: 0,
      opponents: [],
      matchesPlayed: 0,
    });
  }

  for (const match of tournament.matches) {
    const playerOne = standings.get(match.playerOneId);
    const playerTwo = match.playerTwoId ? standings.get(match.playerTwoId) : null;

    if (!playerOne) {
      continue;
    }

    if (match.status === "BYE" || !match.playerTwoId) {
      playerOne.wins += 1;
      playerOne.byes += 1;
      playerOne.matchPoints += 3;
      playerOne.matchesPlayed += 1;
      continue;
    }

    if (!playerTwo || (match.status !== "COMPLETED" && match.status !== "SCHEDULED")) {
      continue;
    }

    playerOne.opponents.push(playerTwo.userId);
    playerTwo.opponents.push(playerOne.userId);

    if (match.status !== "COMPLETED") {
      continue;
    }

    playerOne.matchesPlayed += 1;
    playerTwo.matchesPlayed += 1;

    if (match.playerOneScore === match.playerTwoScore) {
      playerOne.draws += 1;
      playerTwo.draws += 1;
      playerOne.matchPoints += 1;
      playerTwo.matchPoints += 1;
      continue;
    }

    const winnerId =
      match.winnerId ??
      (match.playerOneScore > match.playerTwoScore ? match.playerOneId : match.playerTwoId);

    if (winnerId === match.playerOneId) {
      playerOne.wins += 1;
      playerTwo.losses += 1;
      playerOne.matchPoints += 3;
    } else {
      playerTwo.wins += 1;
      playerOne.losses += 1;
      playerTwo.matchPoints += 3;
    }
  }

  const scoredRows = [...standings.values()].map((entry) => {
    const opponentScores = entry.opponents.map((opponentId) => {
      const opponent = standings.get(opponentId);

      if (!opponent) {
        return 0.33;
      }

      if (opponent.matchesPlayed === 0) {
        return 0.33;
      }

      return Math.max(opponent.matchPoints / (opponent.matchesPlayed * 3), 0.33);
    });
    const opponentsMatchWinRate =
      opponentScores.length > 0
        ? Number(
            (opponentScores.reduce((total, score) => total + score, 0) / opponentScores.length).toFixed(
              3,
            ),
          )
        : 0;

    return {
      userId: entry.userId,
      duelistId: entry.duelistId,
      displayName: entry.displayName,
      matchPoints: entry.matchPoints,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      byes: entry.byes,
      opponentsMatchWinRate,
    } satisfies Omit<StandingRow, "rank">;
  });

  const sorted = scoredRows.sort((left, right) => {
    if (right.matchPoints !== left.matchPoints) {
      return right.matchPoints - left.matchPoints;
    }

    if (right.opponentsMatchWinRate !== left.opponentsMatchWinRate) {
      return right.opponentsMatchWinRate - left.opponentsMatchWinRate;
    }

    return left.displayName.localeCompare(right.displayName, "de");
  });

  return {
    tournamentId: tournament.id,
    standings: sorted.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    })),
  };
}

function parseTournamentRewardConfig(value: Prisma.JsonValue): TournamentRewardConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const placements = (value as { placements?: unknown }).placements;

  if (!Array.isArray(placements)) {
    return null;
  }

  return {
    placements: placements
      .filter((placement): placement is NonNullable<TournamentRewardConfig["placements"]>[number] => {
        return Boolean(placement) && typeof placement === "object" && !Array.isArray(placement);
      })
      .map((placement) => ({
        rank: typeof placement.rank === "number" ? placement.rank : undefined,
        fromRank: typeof placement.fromRank === "number" ? placement.fromRank : undefined,
        toRank: typeof placement.toRank === "number" ? placement.toRank : undefined,
        credits: typeof placement.credits === "number" ? placement.credits : undefined,
        amountCredits:
          typeof placement.amountCredits === "number" ? placement.amountCredits : undefined,
        packSetId: typeof placement.packSetId === "string" ? placement.packSetId : null,
        packQuantity:
          typeof placement.packQuantity === "number" ? placement.packQuantity : undefined,
        note: typeof placement.note === "string" ? placement.note : null,
      })),
  };
}

function parseRankFromRewardReason(reason: string | null) {
  const match = reason?.match(/rank:(\d+)/);

  return match ? Number(match[1]) : null;
}

function placementAppliesToRank(
  placement: NonNullable<TournamentRewardConfig["placements"]>[number],
  rank: number,
) {
  if (typeof placement.rank === "number") {
    return placement.rank === rank;
  }

  const fromRank = placement.fromRank ?? rank;
  const toRank = placement.toRank ?? fromRank;

  return rank >= fromRank && rank <= toRank;
}

async function grantTournamentRewards(
  prisma: Prisma.TransactionClient,
  tournament: TournamentRecord,
) {
  if (!tournament.runId) {
    return;
  }

  const rewardUnlocks = await prisma.runProgressionUnlock.findMany({
    where: {
      runId: tournament.runId,
      type: "REWARD",
      checkpoint: {
        requiredTournamentId: tournament.id,
      },
    },
    select: {
      id: true,
      rewardConfig: true,
    },
  });

  if (rewardUnlocks.length === 0) {
    return;
  }

  const standings = computeStandings(tournament).standings;

  for (const unlock of rewardUnlocks) {
    const config = parseTournamentRewardConfig(unlock.rewardConfig);

    for (const placement of config?.placements ?? []) {
      const matchingRows = standings.filter((row) => placementAppliesToRank(placement, row.rank));
      const amountCredits = placement.amountCredits ?? placement.credits ?? 0;
      const packQuantity = placement.packQuantity ?? 0;

      if (amountCredits <= 0 && packQuantity <= 0) {
        continue;
      }

      for (const row of matchingRows) {
        const reason = [
          "TOURNAMENT_REWARD",
          tournament.id,
          unlock.id,
          `rank:${row.rank}`,
          placement.note?.trim() || null,
        ]
          .filter(Boolean)
          .join(" | ");
        const existingGrant = await prisma.rewardGrant.findFirst({
          where: {
            runId: tournament.runId,
            recipientId: row.userId,
            reason,
          },
        });

        if (existingGrant) {
          continue;
        }

        const grant = await prisma.rewardGrant.create({
          data: {
            runId: tournament.runId,
            recipientId: row.userId,
            grantedById: tournament.hostId,
            amountCredits,
            packSetId: placement.packSetId ?? null,
            packQuantity,
            reason,
            status: packQuantity > 0 ? "PENDING" : "CLAIMED",
            claimedAt: packQuantity > 0 ? null : new Date(),
          },
        });

        if (amountCredits > 0) {
          await creditWallet(prisma, {
            runId: tournament.runId,
            userId: row.userId,
            amount: amountCredits,
            source: "TOURNAMENT_REWARD",
            referenceType: "RewardGrant",
            referenceId: grant.id,
            note: `Turnierbelohnung: ${tournament.title}, Platz ${row.rank}.`,
          });
        }
      }
    }
  }
}

async function loadTournament(prisma: PrismaClient, tournamentId: string) {
  return prisma.tournament.findUnique({
    where: {
      id: tournamentId,
    },
    include: {
      host: true,
      participants: {
        orderBy: [
          {
            status: "asc",
          },
          {
            seed: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
        include: {
          user: true,
          invitedBy: true,
        },
      },
      rounds: {
        orderBy: {
          roundNumber: "asc",
        },
        include: {
          matches: {
            orderBy: {
              tableNumber: "asc",
            },
            include: {
              playerOne: true,
              playerTwo: true,
              winner: true,
              playerOneDeck: true,
              playerTwoDeck: true,
              duelRequest: {
                include: {
                  appointment: true,
                  export: true,
                },
              },
            },
          },
        },
      },
      matches: {
        include: {
          playerOne: true,
          playerTwo: true,
          winner: true,
        },
      },
    },
  });
}

async function getTournamentCampaignState(
  prisma: PrismaClient,
  tournament: TournamentRecord,
): Promise<TournamentDetail["campaign"]> {
  const openMatchCount = tournament.matches.filter(
    (match) => match.status !== "COMPLETED" && match.status !== "BYE",
  ).length;

  if (!tournament.runId) {
    return {
      openMatchCount,
      canComplete: false,
      rewardGrants: [],
      readyCheckpoint: null,
    };
  }

  const [rewardGrants, readyCheckpoint, run] = await Promise.all([
    prisma.rewardGrant.findMany({
      where: {
        runId: tournament.runId,
        reason: {
          startsWith: `TOURNAMENT_REWARD | ${tournament.id}`,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        recipient: {
          select: {
            displayName: true,
          },
        },
        packSet: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.runProgressionCheckpoint.findFirst({
      where: {
        runId: tournament.runId,
        requiredTournamentId: tournament.id,
        status: {
          in: ["READY", "APPLIED"],
        },
      },
      orderBy: {
        sequence: "asc",
      },
      include: {
        unlocks: {
          where: {
            type: "SET",
          },
          include: {
            set: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.playGroupRun.findUnique({
      where: {
        id: tournament.runId,
      },
      select: {
        freePacksPerSetUnlock: true,
      },
    }),
  ]);

  return {
    openMatchCount,
    canComplete: tournament.status !== "COMPLETED" && openMatchCount === 0,
    rewardGrants: rewardGrants.map((grant) => ({
      id: grant.id,
      recipientId: grant.recipientId,
      recipientName: grant.recipient.displayName,
      rank: parseRankFromRewardReason(grant.reason),
      amountCredits: grant.amountCredits,
      packQuantity: grant.packQuantity,
      packSetName: grant.packSet?.name ?? null,
      status: grant.status,
    })),
    readyCheckpoint: readyCheckpoint
      ? {
          id: readyCheckpoint.id,
          title: readyCheckpoint.title,
          setNames: readyCheckpoint.unlocks
            .map((unlock) => unlock.set?.name)
            .filter((name): name is string => Boolean(name)),
          freePacksPerSetUnlock: run?.freePacksPerSetUnlock ?? 24,
        }
      : null,
  };
}

async function mapTournamentDetail(
  prisma: PrismaClient,
  tournament: TournamentRecord,
): Promise<TournamentDetail> {
  const standings = computeStandings(tournament);

  return {
    overview: toTournamentOverview(tournament),
    campaign: await getTournamentCampaignState(prisma, tournament),
    participants: tournament.participants.map((participant) => ({
      id: participant.id,
      status: participant.status,
      seed: participant.seed ?? null,
      joinedAt: participant.joinedAt?.toISOString() ?? null,
      duelist: {
        userId: participant.user.id,
        duelistId: participant.user.duelistId,
        displayName: participant.user.displayName,
      },
    })),
    rounds: tournament.rounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      matches: round.matches.map((match) => ({
        id: match.id,
        tableNumber: match.tableNumber ?? null,
        status: match.status,
        playerOne: {
          userId: match.playerOne.id,
          duelistId: match.playerOne.duelistId,
          displayName: match.playerOne.displayName,
        },
        playerTwo: match.playerTwo
          ? {
              userId: match.playerTwo.id,
              duelistId: match.playerTwo.duelistId,
              displayName: match.playerTwo.displayName,
            }
          : null,
        winnerId: match.winnerId ?? null,
        playerOneScore: match.playerOneScore,
        playerTwoScore: match.playerTwoScore,
        duelRequestId: match.duelRequest?.id ?? null,
        confirmedAt: match.duelRequest?.appointment?.confirmedAt?.toISOString() ?? null,
        exportPath: match.duelRequest?.export?.exportPath ?? null,
        playerOneDeckName: match.playerOneDeck?.name ?? null,
        playerTwoDeckName: match.playerTwoDeck?.name ?? null,
      })),
    })),
    standings,
  };
}

export async function listTournamentOverviews(prisma: PrismaClient, viewerId: string) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const tournaments = await prisma.tournament.findMany({
    where: {
      runId: activeRun.id,
      participants: {
        some: {
          userId: viewerId,
        },
      },
    },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { createdAt: "desc" }],
    include: {
      host: true,
      participants: true,
      rounds: true,
      matches: true,
    },
  });

  return tournaments.map((tournament) =>
    toTournamentOverview(tournament as unknown as TournamentRecord),
  );
}

export async function getTournamentDetail(
  prisma: PrismaClient,
  viewerId: string,
  tournamentId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const tournament = await loadTournament(prisma, tournamentId);

  if (
    !tournament ||
    tournament.runId !== activeRun.id ||
    !tournament.participants.some((participant) => participant.userId === viewerId)
  ) {
    throw new Error("Turnier wurde nicht gefunden.");
  }

  return mapTournamentDetail(prisma, tournament);
}

export async function createTournament(
  prisma: PrismaClient,
  viewerId: string,
  input: {
    title: string;
    description?: string | null;
    formatLabel?: string | null;
    scheduledAt?: string | null;
  },
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const tournament = await prisma.tournament.create({
    data: {
      runId: activeRun.id,
      hostId: viewerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      formatLabel: input.formatLabel?.trim() || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: "DRAFT",
      participants: {
        create: {
          userId: viewerId,
          invitedById: viewerId,
          status: "ACCEPTED",
          joinedAt: new Date(),
          seed: 1,
        },
      },
    },
  });

  return getTournamentDetail(prisma, viewerId, tournament.id);
}

export async function inviteTournamentParticipant(
  prisma: PrismaClient,
  viewerId: string,
  tournamentId: string,
  inviteeDuelistId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const tournament = await prisma.tournament.findUnique({
    where: {
      id: tournamentId,
    },
  });

  if (!tournament || tournament.hostId !== viewerId || tournament.runId !== activeRun.id) {
    throw new Error("Nur der Host kann Teilnehmer einladen.");
  }

  const invitee = await prisma.user.findUnique({
    where: {
      duelistId: inviteeDuelistId.trim().toUpperCase(),
    },
  });

  if (!invitee) {
    throw new Error("Duelist wurde nicht gefunden.");
  }

  await requireRunMembership(prisma, {
    runId: activeRun.id,
    userId: invitee.id,
  });

  await prisma.tournamentParticipant.upsert({
    where: {
      tournamentId_userId: {
        tournamentId,
        userId: invitee.id,
      },
    },
    update: {
      status: "INVITED",
      invitedById: viewerId,
      droppedAt: null,
    },
    create: {
      tournamentId,
      userId: invitee.id,
      invitedById: viewerId,
      status: "INVITED",
      seed: null,
    },
  });

  return getTournamentDetail(prisma, viewerId, tournamentId);
}

export async function createSwissRound(
  prisma: PrismaClient,
  viewerId: string,
  tournamentId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const tournament = await loadTournament(prisma, tournamentId);

  if (!tournament || tournament.hostId !== viewerId || tournament.runId !== activeRun.id) {
    throw new Error("Nur der Host kann neue Swiss-Runden erzeugen.");
  }

  const acceptedParticipants = tournament.participants.filter(
    (participant) => participant.status === "ACCEPTED",
  );

  if (acceptedParticipants.length < 2) {
    throw new Error("Für eine Runde werden mindestens zwei akzeptierte Teilnehmer benötigt.");
  }

  const nextRoundNumber =
    tournament.rounds.length > 0
      ? Math.max(...tournament.rounds.map((round) => round.roundNumber)) + 1
      : 1;
  const standings = computeStandings(tournament);
  const pairs = pairSwissRound({
    participants: acceptedParticipants.map((participant) => ({
      userId: participant.userId,
      seed: participant.seed ?? null,
    })),
    standings: standings.standings.map((standing) => ({
      userId: standing.userId,
      rank: standing.rank,
      seed: acceptedParticipants.find((participant) => participant.userId === standing.userId)?.seed ?? null,
    })),
    historicMatches: tournament.matches.map((match) => ({
      playerOneId: match.playerOneId,
      playerTwoId: match.playerTwoId ?? null,
    })),
  });

  await prisma.$transaction(async (tx) => {
    const round = await tx.tournamentRound.create({
      data: {
        tournamentId,
        roundNumber: nextRoundNumber,
        status: "PAIRED",
      },
    });

    for (const [index, pair] of pairs.entries()) {
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          roundId: round.id,
          tableNumber: index + 1,
          playerOneId: pair.playerOneId,
          playerTwoId: pair.playerTwoId,
          status: pair.playerTwoId ? "PENDING" : "BYE",
          winnerId: pair.playerTwoId ? null : pair.playerOneId,
          playerOneScore: pair.playerTwoId ? 0 : 2,
          playerTwoScore: 0,
          notes: pair.playerTwoId ? null : "Automatisches Bye",
        },
      });
    }

    await tx.tournament.update({
      where: {
        id: tournamentId,
      },
      data: {
        status: "ACTIVE",
      },
    });
  });

  return getTournamentDetail(prisma, viewerId, tournamentId);
}

export async function recordTournamentMatchResult(
  prisma: PrismaClient,
  viewerId: string,
  matchId: string,
  input: {
    playerOneScore: number;
    playerTwoScore: number;
    winnerId?: string | null;
    notes?: string | null;
  },
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const match = await prisma.tournamentMatch.findUnique({
    where: {
      id: matchId,
    },
    include: {
      tournament: true,
    },
  });

  if (!match || match.tournament.hostId !== viewerId || match.tournament.runId !== activeRun.id) {
    throw new Error("Nur der Host kann Matchergebnisse eintragen.");
  }

  const winnerId =
    input.playerOneScore === input.playerTwoScore
      ? null
      : input.winnerId?.trim() ||
        (input.playerOneScore > input.playerTwoScore ? match.playerOneId : match.playerTwoId);

  await prisma.tournamentMatch.update({
    where: {
      id: matchId,
    },
    data: {
      status: "COMPLETED",
      playerOneScore: input.playerOneScore,
      playerTwoScore: input.playerTwoScore,
      winnerId: winnerId || null,
      notes: input.notes?.trim() || null,
    },
  });

  return getTournamentDetail(prisma, viewerId, match.tournamentId);
}

export async function completeTournament(
  prisma: PrismaClient,
  viewerId: string,
  tournamentId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const tournament = await prisma.tournament.findUnique({
    where: {
      id: tournamentId,
    },
    include: {
      host: true,
      participants: {
        include: {
          user: true,
          invitedBy: true,
        },
      },
      rounds: {
        include: {
          matches: {
            include: {
              playerOne: true,
              playerTwo: true,
              winner: true,
              playerOneDeck: true,
              playerTwoDeck: true,
              duelRequest: {
                include: {
                  appointment: true,
                  export: true,
                },
              },
            },
          },
        },
      },
      matches: {
        include: {
          playerOne: true,
          playerTwo: true,
          winner: true,
        },
      },
    },
  });

  if (!tournament || tournament.hostId !== viewerId || tournament.runId !== activeRun.id) {
    throw new Error("Nur der Host kann das Turnier abschließen.");
  }

  if (tournament.status === "COMPLETED") {
    return getTournamentDetail(prisma, viewerId, tournamentId);
  }

  const hasOpenMatches = tournament.matches.some(
    (match) => match.status !== "COMPLETED" && match.status !== "BYE",
  );

  if (hasOpenMatches) {
    throw new Error("Es gibt noch offene Matches in diesem Turnier.");
  }

  await prisma.$transaction(async (tx) => {
    await grantTournamentRewards(tx, tournament);
    await tx.tournament.update({
      where: {
        id: tournamentId,
      },
      data: {
        status: "COMPLETED",
      },
    });
    await markTournamentProgressionReady(tx, tournamentId);
  });

  return getTournamentDetail(prisma, viewerId, tournamentId);
}
