import type { Prisma, PrismaClient } from "@prisma/client";
import { pairSwissRound } from "@ygo/domain";
import type {
  CampaignLeaderboardResponse,
  TournamentOverviewDto,
  TournamentStandingsDto,
  UpdateTournamentMvpCardsRequest,
} from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { getCardAssetUrl } from "@/lib/asset-urls";
import {
  getActiveCampaignRuleConfig,
  getActiveCampaignRuleVersionId,
} from "@/lib/campaign-rule-service";
import { markTournamentProgressionReady } from "@/lib/progression-service";
import { creditWallet, getActiveRun, requireRunMembership } from "@/lib/run-service";

type TournamentRecord = Prisma.TournamentGetPayload<{
  include: {
    host: true;
    participants: {
      include: {
        user: true;
        invitedBy: true;
        registeredDeck: {
          include: {
            cards: true;
          };
        };
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
    checkedInAt: string | null;
    registeredDeck: { id: string; name: string } | null;
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
      reportedById: string | null;
      confirmedById: string | null;
      reportedAt: string | null;
      resultConfirmedAt: string | null;
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
    pairingMode: tournament.pairingMode,
    matchMode: tournament.matchMode,
    startedAt: tournament.startedAt?.toISOString() ?? null,
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

type SnapshotCard = {
  cardId: string;
  section: "MAIN" | "EXTRA" | "SIDE";
  quantity: number;
};

function canOperateTournament(
  activeRun: Awaited<ReturnType<typeof getActiveRun>>,
  viewerId: string,
  hostId?: string,
) {
  const membership = activeRun.memberships.find((entry) => entry.userId === viewerId);
  return hostId === viewerId || membership?.role === "OWNER" || membership?.role === "ORGANIZER";
}

function normalizeSnapshotCards(value: Prisma.JsonValue): SnapshotCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.cardId !== "string" || typeof row.quantity !== "number") return [];
    if (row.section !== "MAIN" && row.section !== "EXTRA" && row.section !== "SIDE") return [];
    return [{
      cardId: row.cardId,
      section: row.section,
      quantity: row.quantity,
    }];
  });
}

async function persistTournamentSnapshots(
  tx: Prisma.TransactionClient,
  tournament: TournamentRecord,
) {
  const standings = computeStandings(tournament).standings;
  for (const row of standings) {
    await tx.tournamentResult.upsert({
      where: {
        tournamentId_userId: {
          tournamentId: tournament.id,
          userId: row.userId,
        },
      },
      create: {
        tournamentId: tournament.id,
        userId: row.userId,
        duelistId: row.duelistId,
        displayName: row.displayName,
        rank: row.rank,
        matchPoints: row.matchPoints,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        byes: row.byes,
        opponentsMatchWinRate: row.opponentsMatchWinRate,
      },
      update: {},
    });
  }

  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId: tournament.id },
    include: {
      playerOneDeck: { include: { cards: true } },
      playerTwoDeck: { include: { cards: true } },
      deckExport: {
        include: {
          deck: { include: { cards: true } },
        },
      },
    },
  });
  const decksByUser = new Map<string, {
    deckId: string;
    deckName: string;
    cards: SnapshotCard[];
  }>();
  for (const match of matches) {
    if (match.playerOneDeck && !decksByUser.has(match.playerOneId)) {
      decksByUser.set(match.playerOneId, {
        deckId: match.playerOneDeck.id,
        deckName: match.playerOneDeck.name,
        cards: match.playerOneDeck.cards,
      });
    }
    if (match.playerTwoId && match.playerTwoDeck && !decksByUser.has(match.playerTwoId)) {
      decksByUser.set(match.playerTwoId, {
        deckId: match.playerTwoDeck.id,
        deckName: match.playerTwoDeck.name,
        cards: match.playerTwoDeck.cards,
      });
    }
    if (match.deckExport && !decksByUser.has(match.deckExport.userId)) {
      decksByUser.set(match.deckExport.userId, {
        deckId: match.deckExport.deck.id,
        deckName: match.deckExport.deck.name,
        cards: match.deckExport.deck.cards,
      });
    }
  }

  for (const [userId, deck] of decksByUser) {
    await tx.tournamentDeckSnapshot.upsert({
      where: {
        tournamentId_userId: {
          tournamentId: tournament.id,
          userId,
        },
      },
      create: {
        tournamentId: tournament.id,
        userId,
        deckId: deck.deckId,
        deckName: deck.deckName,
        cards: deck.cards.map((card) => ({
          cardId: card.cardId,
          section: card.section,
          quantity: card.quantity,
        })),
      },
      update: {},
    });
  }
  for (const row of standings) {
    if (decksByUser.has(row.userId)) continue;
    await tx.tournamentDeckSnapshot.upsert({
      where: {
        tournamentId_userId: {
          tournamentId: tournament.id,
          userId: row.userId,
        },
      },
      create: {
        tournamentId: tournament.id,
        userId: row.userId,
        deckId: null,
        deckName: null,
        cards: [],
      },
      update: {},
    });
  }
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

  const ruleVersionId = tournament.ruleVersionId
    ?? await getActiveCampaignRuleVersionId(prisma, tournament.runId);
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
            ruleVersionId,
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
          registeredDeck: {
            include: { cards: true },
          },
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
      checkedInAt: participant.checkedInAt?.toISOString() ?? null,
      registeredDeck: participant.registeredDeck
        ? { id: participant.registeredDeck.id, name: participant.registeredDeck.name }
        : null,
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
        reportedById: match.reportedById ?? null,
        confirmedById: match.confirmedById ?? null,
        reportedAt: match.reportedAt?.toISOString() ?? null,
        resultConfirmedAt: match.confirmedAt?.toISOString() ?? null,
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
  const canManage = canOperateTournament(activeRun, viewerId);
  const tournaments = await prisma.tournament.findMany({
    where: {
      runId: activeRun.id,
      participants: canManage ? undefined : {
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
    (!canOperateTournament(activeRun, viewerId, tournament.hostId)
      && !tournament.participants.some((participant) => participant.userId === viewerId))
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
    pairingMode?: "SWISS" | "ROUND_ROBIN" | "SINGLE_ELIMINATION" | "MANUAL";
    matchMode?: "BEST_OF_ONE" | "BEST_OF_THREE" | "BEST_OF_FIVE";
  },
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  if (!canOperateTournament(activeRun, viewerId)) {
    throw new DomainError({
      code: "tournament_create_forbidden",
      message: "Nur Kampagnen-Owner und Organizer können Turniere erstellen.",
      status: 403,
    });
  }
  const rules = await getActiveCampaignRuleConfig(prisma, activeRun.id);
  const pairingMode = input.pairingMode ?? rules.tournaments.pairingMode;
  const matchMode = input.matchMode ?? (
    rules.tournaments.matchMode === "SINGLE"
      ? "BEST_OF_ONE"
      : rules.tournaments.matchMode
  );
  if (!rules.tournaments.allowedPairingModes.includes(pairingMode)) {
    throw new DomainError({
      code: "tournament_pairing_mode_disabled",
      message: "Diese Paarungsart ist in der Kampagne nicht erlaubt.",
      status: 409,
    });
  }
  if (!rules.tournaments.allowedMatchModes.includes(matchMode)) {
    throw new DomainError({
      code: "tournament_match_mode_disabled",
      message: "Dieser Matchmodus ist in der Kampagne nicht erlaubt.",
      status: 409,
    });
  }
  const ruleVersionId = await getActiveCampaignRuleVersionId(prisma, activeRun.id);
  const tournament = await prisma.tournament.create({
    data: {
      runId: activeRun.id,
      hostId: viewerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      formatLabel: input.formatLabel?.trim() || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: "DRAFT",
      pairingMode,
      matchMode,
      ruleVersionId,
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

  if (!tournament || tournament.runId !== activeRun.id || !canOperateTournament(activeRun, viewerId, tournament.hostId)) {
    throw new Error("Nur Host oder Kampagnen-Organizer können Teilnehmer einladen.");
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
  manualPairs?: TournamentPair[],
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const ruleConfig = await getActiveCampaignRuleConfig(prisma, activeRun.id);
  const tournament = await loadTournament(prisma, tournamentId);
  if (!tournament || tournament.runId !== activeRun.id || !canOperateTournament(activeRun, viewerId, tournament.hostId)) {
    throw new Error("Nur Host oder Kampagnen-Organizer können neue Runden erzeugen.");
  }
  const acceptedParticipants = tournament.participants.filter((participant) => participant.status === "ACCEPTED");
  if (acceptedParticipants.length < ruleConfig.tournaments.minimumParticipants) {
    throw new DomainError({
      code: "tournament_participants_missing",
      message: `Für den Start werden mindestens ${ruleConfig.tournaments.minimumParticipants} akzeptierte Teilnehmer benötigt.`,
      status: 409,
    });
  }
  const nextRoundNumber = tournament.rounds.length > 0
    ? Math.max(...tournament.rounds.map((round) => round.roundNumber)) + 1
    : 1;
  const standings = computeStandings(tournament);
  let pairs: TournamentPair[];
  if (tournament.pairingMode === "MANUAL") {
    if (!manualPairs) {
      throw new DomainError({ code: "manual_pairings_required", message: "Für dieses Turnier müssen Paarungen manuell angegeben werden.", status: 400 });
    }
    const acceptedIds = new Set(acceptedParticipants.map((participant) => participant.userId));
    const usedIds = manualPairs.flatMap((pair) => [pair.playerOneId, pair.playerTwoId].filter((id): id is string => Boolean(id)));
    if (new Set(usedIds).size !== usedIds.length || usedIds.some((id) => !acceptedIds.has(id))) {
      throw new DomainError({ code: "invalid_manual_pairings", message: "Manuelle Paarungen dürfen nur akzeptierte Teilnehmer genau einmal verwenden.", status: 400 });
    }
    pairs = manualPairs;
  } else if (tournament.pairingMode === "ROUND_ROBIN") {
    pairs = createRoundRobinPairs(acceptedParticipants.map((participant) => participant.userId), nextRoundNumber - 1);
  } else if (tournament.pairingMode === "SINGLE_ELIMINATION") {
    const previousRound = tournament.rounds.at(-1);
    const advancing = previousRound
      ? previousRound.matches.map((match) => {
          if (match.status !== "COMPLETED" && match.status !== "BYE") {
            throw new DomainError({ code: "elimination_round_open", message: "Die vorherige Eliminationsrunde ist noch nicht abgeschlossen.", status: 409 });
          }
          return match.winnerId ?? match.playerOneId;
        })
      : acceptedParticipants.map((participant) => participant.userId);
    if (previousRound && advancing.length <= 1) {
      throw new DomainError({ code: "elimination_complete", message: "Das Eliminationsfinale ist bereits entschieden.", status: 409 });
    }
    pairs = [];
    for (let index = 0; index < advancing.length; index += 2) {
      pairs.push({ playerOneId: advancing[index]!, playerTwoId: advancing[index + 1] ?? null });
    }
  } else {
    pairs = pairSwissRound({
      participants: acceptedParticipants.map((participant) => ({ userId: participant.userId, seed: participant.seed ?? null })),
      standings: standings.standings.map((standing) => ({
        userId: standing.userId,
        rank: standing.rank,
        seed: acceptedParticipants.find((participant) => participant.userId === standing.userId)?.seed ?? null,
      })),
      historicMatches: tournament.matches.map((match) => ({ playerOneId: match.playerOneId, playerTwoId: match.playerTwoId ?? null })),
    });
  }

  await prisma.$transaction(async (tx) => {
    if (!tournament.startedAt) {
      await snapshotRegisteredDecksAtStart(tx, tournament, ruleConfig.tournaments.requireDeckRegistration);
    }
    const round = await tx.tournamentRound.create({
      data: { tournamentId, roundNumber: nextRoundNumber, status: "PAIRED" },
    });
    for (const [index, pair] of pairs.entries()) {
      const playerOne = acceptedParticipants.find((participant) => participant.userId === pair.playerOneId);
      const playerTwo = acceptedParticipants.find((participant) => participant.userId === pair.playerTwoId);
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          roundId: round.id,
          tableNumber: index + 1,
          playerOneId: pair.playerOneId,
          playerTwoId: pair.playerTwoId,
          playerOneDeckId: playerOne?.registeredDeckId ?? null,
          playerTwoDeckId: playerTwo?.registeredDeckId ?? null,
          status: pair.playerTwoId ? "PENDING" : "BYE",
          winnerId: pair.playerTwoId ? null : pair.playerOneId,
          playerOneScore: pair.playerTwoId ? 0 : tournament.matchMode === "BEST_OF_ONE" ? 1 : tournament.matchMode === "BEST_OF_FIVE" ? 3 : 2,
          playerTwoScore: 0,
          notes: pair.playerTwoId ? null : "Automatisches Bye",
        },
      });
    }
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "ACTIVE", startedAt: tournament.startedAt ?? new Date() },
    });
  });
  return getTournamentDetail(prisma, viewerId, tournamentId);
}

export async function recordTournamentMatchResult(
  prisma: PrismaClient,
  viewerId: string,
  matchId: string,
  input: {
    action?: "report" | "confirm" | "adminConfirm";
    playerOneScore?: number;
    playerTwoScore?: number;
    winnerId?: string | null;
    notes?: string | null;
  },
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const ruleConfig = await getActiveCampaignRuleConfig(prisma, activeRun.id);
  const viewerMembership = activeRun.memberships.find(
    (membership) => membership.userId === viewerId,
  );
  const isOrganizer =
    viewerMembership?.role === "OWNER" || viewerMembership?.role === "ORGANIZER";
  const match = await prisma.tournamentMatch.findUnique({
    where: {
      id: matchId,
    },
    include: {
      tournament: true,
    },
  });

  if (!match || match.tournament.runId !== activeRun.id) {
    throw new Error("Match wurde nicht gefunden.");
  }

  if (match.status === "BYE" || match.status === "CANCELLED") {
    throw new Error("Dieses Match kann kein Ergebnis-Reporting erhalten.");
  }

  const isPlayerOne = match.playerOneId === viewerId;
  const isPlayerTwo = match.playerTwoId === viewerId;
  const isMatchPlayer = isPlayerOne || isPlayerTwo;
  const action = input.action ?? "report";

  if (action !== "adminConfirm" && !isMatchPlayer) {
    throw new Error("Nur Match-Spieler können Ergebnisse melden oder bestätigen.");
  }

  if (action === "adminConfirm" && !isOrganizer) {
    throw new Error("Nur Organizer können Ergebnisse administrativ bestätigen.");
  }

  if (action === "confirm") {
    if (!ruleConfig.tournaments.requireResultConfirmation) {
      throw new Error("Diese Kampagne benötigt keine separate Ergebnisbestätigung.");
    }
    if (match.status !== "REPORTED" || !match.reportedById) {
      throw new Error("Für dieses Match liegt noch kein Ergebnis zur Bestätigung vor.");
    }

    if (match.reportedById === viewerId) {
      throw new Error("Der meldende Spieler kann das eigene Ergebnis nicht bestätigen.");
    }

    if (
      input.playerOneScore !== undefined &&
      input.playerOneScore !== match.playerOneScore
    ) {
      throw new Error("Der bestätigte Score stimmt nicht mit dem gemeldeten Ergebnis überein.");
    }

    if (
      input.playerTwoScore !== undefined &&
      input.playerTwoScore !== match.playerTwoScore
    ) {
      throw new Error("Der bestätigte Score stimmt nicht mit dem gemeldeten Ergebnis überein.");
    }

    await prisma.tournamentMatch.update({
      where: {
        id: matchId,
      },
      data: {
        status: "COMPLETED",
        confirmedById: viewerId,
        confirmedAt: new Date(),
      },
    });

    return getTournamentDetail(prisma, viewerId, match.tournamentId);
  }

  const playerOneScore = input.playerOneScore;
  const playerTwoScore = input.playerTwoScore;

  if (playerOneScore === undefined || playerTwoScore === undefined) {
    throw new Error("Bitte beide Scores eintragen.");
  }
  const maximumScore = match.tournament.matchMode === "BEST_OF_ONE"
    ? 1
    : match.tournament.matchMode === "BEST_OF_FIVE" ? 3 : 2;
  if (playerOneScore > maximumScore || playerTwoScore > maximumScore) {
    throw new Error(
      `Im ${match.tournament.matchMode === "BEST_OF_ONE" ? "Best-of-1" : match.tournament.matchMode === "BEST_OF_FIVE" ? "Best-of-5" : "Best-of-3"} wurde ein zu hoher Score gemeldet.`,
    );
  }

  const winnerId =
    playerOneScore === playerTwoScore
      ? null
      : input.winnerId?.trim() ||
        (playerOneScore > playerTwoScore ? match.playerOneId : match.playerTwoId);

  if (winnerId && winnerId !== match.playerOneId && winnerId !== match.playerTwoId) {
    throw new Error("Der Gewinner muss einer der Match-Spieler sein.");
  }

  const now = new Date();

  await prisma.tournamentMatch.update({
    where: {
      id: matchId,
    },
    data: {
      status:
        action === "adminConfirm" || !ruleConfig.tournaments.requireResultConfirmation
          ? "COMPLETED"
          : "REPORTED",
      playerOneScore,
      playerTwoScore,
      winnerId: winnerId || null,
      notes: input.notes?.trim() || null,
      reportedById: action === "adminConfirm" ? match.reportedById : viewerId,
      reportedAt: action === "adminConfirm" ? (match.reportedAt ?? now) : now,
      confirmedById: action === "adminConfirm" ? viewerId : null,
      confirmedAt:
        action === "adminConfirm" || !ruleConfig.tournaments.requireResultConfirmation
          ? now
          : null,
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
          registeredDeck: {
            include: { cards: true },
          },
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

  if (!tournament || tournament.runId !== activeRun.id || !canOperateTournament(activeRun, viewerId, tournament.hostId)) {
    throw new Error("Nur Host oder Kampagnen-Organizer können das Turnier abschließen.");
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
    await persistTournamentSnapshots(tx, tournament);
    await grantTournamentRewards(tx, tournament);
    await tx.tournament.update({
      where: {
        id: tournamentId,
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    await markTournamentProgressionReady(tx, tournamentId);
  });

  return getTournamentDetail(prisma, viewerId, tournamentId);
}

export async function registerTournamentDeck(
  prisma: PrismaClient,
  viewerId: string,
  tournamentId: string,
  deckId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const [tournament, deck, rules] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId } }),
    prisma.deck.findFirst({
      where: { id: deckId, userId: viewerId, runId: activeRun.id },
      include: { cards: true },
    }),
    getActiveCampaignRuleConfig(prisma, activeRun.id),
  ]);
  if (!tournament || tournament.runId !== activeRun.id) {
    throw new DomainError({ code: "tournament_not_found", message: "Turnier nicht gefunden.", status: 404 });
  }
  if (tournament.status !== "DRAFT" || tournament.startedAt) {
    throw new DomainError({ code: "tournament_already_started", message: "Nach dem Turnierstart kann das Deck nicht mehr gewechselt werden.", status: 409 });
  }
  if (!deck) {
    throw new DomainError({ code: "tournament_deck_not_found", message: "Dieses Kampagnendeck wurde nicht gefunden.", status: 404 });
  }
  const sectionCounts = deck.cards.reduce(
    (counts, row) => {
      counts[row.section] += row.quantity;
      return counts;
    },
    { MAIN: 0, EXTRA: 0, SIDE: 0 },
  );
  if (
    sectionCounts.MAIN < rules.decks.minMainDeck
    || sectionCounts.MAIN > rules.decks.maxMainDeck
    || sectionCounts.EXTRA > rules.decks.maxExtraDeck
    || sectionCounts.SIDE > rules.decks.maxSideDeck
  ) {
    throw new DomainError({
      code: "tournament_deck_size_invalid",
      message: `Das Turnierdeck muss ${rules.decks.minMainDeck}–${rules.decks.maxMainDeck} Main-, höchstens ${rules.decks.maxExtraDeck} Extra- und höchstens ${rules.decks.maxSideDeck} Side-Deck-Karten enthalten.`,
      status: 409,
    });
  }
  if (rules.decks.ownershipRequired && !rules.decks.allowProxies) {
    const owned = await prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        runId: activeRun.id,
        userId: viewerId,
        lockState: "AVAILABLE",
        cardId: { in: deck.cards.map((row) => row.cardId) },
      },
      _count: { _all: true },
    });
    const ownedByCardId = new Map(owned.map((row) => [row.cardId, row._count._all]));
    const missing = deck.cards.find(
      (row) => row.quantity > (ownedByCardId.get(row.cardId) ?? 0),
    );
    if (missing) {
      throw new DomainError({
        code: "tournament_deck_ownership_invalid",
        message: "Das Turnierdeck enthält mehr Kopien einer Karte als aktuell verfügbar sind.",
        status: 409,
        details: {
          cardId: missing.cardId,
          required: missing.quantity,
          available: ownedByCardId.get(missing.cardId) ?? 0,
        },
      });
    }
  }
  const participant = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: viewerId } },
  });
  if (!participant || participant.status === "DECLINED" || participant.status === "DROPPED") {
    throw new DomainError({ code: "tournament_not_invited", message: "Du bist für dieses Turnier nicht registriert.", status: 403 });
  }
  await prisma.tournamentParticipant.update({
    where: { id: participant.id },
    data: {
      status: "ACCEPTED",
      joinedAt: participant.joinedAt ?? new Date(),
      checkedInAt: new Date(),
      registeredDeckId: deck.id,
    },
  });
  return getTournamentDetail(prisma, viewerId, tournamentId);
}

type TournamentPair = { playerOneId: string; playerTwoId: string | null };

function createRoundRobinPairs(userIds: string[], roundIndex: number): TournamentPair[] {
  const rotating = [...userIds];
  if (rotating.length % 2 === 1) rotating.push("__BYE__");
  const roundCount = rotating.length - 1;
  if (roundIndex >= roundCount) {
    throw new DomainError({ code: "round_robin_complete", message: "Alle Round-Robin-Runden wurden bereits gespielt.", status: 409 });
  }
  const fixed = rotating[0]!;
  const rest = rotating.slice(1);
  for (let step = 0; step < roundIndex; step += 1) rest.unshift(rest.pop()!);
  const arranged = [fixed, ...rest];
  const pairs: TournamentPair[] = [];
  for (let index = 0; index < arranged.length / 2; index += 1) {
    const left = arranged[index]!;
    const right = arranged[arranged.length - 1 - index]!;
    if (left === "__BYE__") pairs.push({ playerOneId: right, playerTwoId: null });
    else pairs.push({ playerOneId: left, playerTwoId: right === "__BYE__" ? null : right });
  }
  return pairs;
}

async function snapshotRegisteredDecksAtStart(
  tx: Prisma.TransactionClient,
  tournament: TournamentRecord,
  requireDeckRegistration: boolean,
) {
  const accepted = tournament.participants.filter((participant) => participant.status === "ACCEPTED");
  if (requireDeckRegistration && accepted.some((participant) => !participant.registeredDeck)) {
    throw new DomainError({
      code: "tournament_decks_missing",
      message: "Alle akzeptierten Teilnehmer müssen vor dem Start ein Deck einchecken.",
      status: 409,
    });
  }
  for (const participant of accepted) {
    const deck = participant.registeredDeck;
    await tx.tournamentDeckSnapshot.upsert({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: participant.userId } },
      create: {
        tournamentId: tournament.id,
        userId: participant.userId,
        deckId: deck?.id ?? null,
        deckName: deck?.name ?? null,
        cards: (deck?.cards ?? []).map((card) => ({
          cardId: card.cardId,
          section: card.section,
          quantity: card.quantity,
        })),
      },
      update: {},
    });
  }
}

export async function getCampaignLeaderboard(
  prisma: PrismaClient,
  viewerId: string,
): Promise<CampaignLeaderboardResponse> {
  const activeRun = await getActiveRun(prisma, viewerId);
  const membership = await requireRunMembership(prisma, {
    runId: activeRun.id,
    userId: viewerId,
  });
  const historicalTournaments = await prisma.tournament.findMany({
    where: {
      runId: activeRun.id,
      status: "COMPLETED",
      OR: [
        { results: { none: {} } },
        { deckSnapshots: { none: {} } },
      ],
    },
    select: { id: true, completedAt: true, updatedAt: true },
  });
  for (const historical of historicalTournaments) {
    const loaded = await loadTournament(prisma, historical.id);
    if (!loaded) continue;
    await prisma.$transaction(async (tx) => {
      await persistTournamentSnapshots(tx, loaded as TournamentRecord);
      if (!historical.completedAt) {
        await tx.tournament.update({
          where: { id: historical.id },
          data: { completedAt: historical.updatedAt },
        });
      }
    });
  }
  const [memberships, completedTournaments, tournamentRewards] = await Promise.all([
    prisma.runMembership.findMany({
      where: { runId: activeRun.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.tournament.findMany({
      where: { runId: activeRun.id, status: "COMPLETED" },
      include: {
        results: { orderBy: { rank: "asc" } },
        deckSnapshots: true,
        mvpCards: {
          orderBy: { position: "asc" },
          include: { card: true },
        },
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.rewardGrant.findMany({
      where: {
        runId: activeRun.id,
        reason: { startsWith: "TOURNAMENT_REWARD | " },
      },
      select: {
        reason: true,
        amountCredits: true,
        packQuantity: true,
        packSet: { select: { name: true } },
      },
    }),
  ]);

  const memberById = new Map(memberships.map((entry) => [entry.userId, entry.user]));
  const aggregate = new Map(memberships.map((entry) => [entry.userId, {
    userId: entry.userId,
    duelistId: entry.user.duelistId,
    displayName: entry.user.displayName,
    tournamentWins: 0,
    runnerUpFinishes: 0,
    podiumFinishes: 0,
    participations: 0,
    matchPoints: 0,
    matchWins: 0,
    losses: 0,
    draws: 0,
    byes: 0,
    latestTitleAt: null as string | null,
  }]));
  const rewardsByTournament = new Map<string, typeof tournamentRewards>();
  for (const reward of tournamentRewards) {
    const tournamentId = reward.reason?.split(" | ")[1];
    if (!tournamentId) continue;
    const current = rewardsByTournament.get(tournamentId) ?? [];
    current.push(reward);
    rewardsByTournament.set(tournamentId, current);
  }

  const archive: CampaignLeaderboardResponse["winnerArchive"] = [];
  for (const tournament of completedTournaments) {
    let resultRows = tournament.results;
    if (resultRows.length === 0) {
      const loaded = await loadTournament(prisma, tournament.id);
      resultRows = loaded
        ? computeStandings(loaded as TournamentRecord).standings.map((row) => ({
            id: `derived-${tournament.id}-${row.userId}`,
            tournamentId: tournament.id,
            createdAt: tournament.completedAt ?? tournament.updatedAt,
            ...row,
          }))
        : [];
    }

    const completedAt = (tournament.completedAt ?? tournament.updatedAt).toISOString();
    for (const result of resultRows) {
      const row = aggregate.get(result.userId);
      if (!row) continue;
      const realWins = Math.max(0, result.wins - result.byes);
      row.participations += 1;
      row.matchPoints += result.matchPoints;
      row.matchWins += realWins;
      row.losses += result.losses;
      row.draws += result.draws;
      row.byes += result.byes;
      if (result.rank === 1) {
        row.tournamentWins += 1;
        row.latestTitleAt = !row.latestTitleAt || completedAt > row.latestTitleAt
          ? completedAt
          : row.latestTitleAt;
      }
      if (result.rank === 2) row.runnerUpFinishes += 1;
      if (result.rank <= 3) row.podiumFinishes += 1;
    }

    const snapshotsByUser = new Map(tournament.deckSnapshots.map((snapshot) => [
      snapshot.userId,
      normalizeSnapshotCards(snapshot.cards),
    ]));
    const candidatePairs = [...snapshotsByUser.entries()].flatMap(([userId, cards]) =>
      [...new Set(cards.map((card) => card.cardId))].map((cardId) => ({ userId, cardId })),
    );
    const candidateCardIds = [...new Set(candidatePairs.map((entry) => entry.cardId))];
    const candidateCards = candidateCardIds.length > 0
      ? await prisma.card.findMany({
          where: { id: { in: candidateCardIds } },
          select: { id: true, name: true, externalCardId: true },
        })
      : [];
    const candidateCardById = new Map(candidateCards.map((card) => [card.id, card]));

    archive.push({
      tournamentId: tournament.id,
      title: tournament.title,
      formatLabel: tournament.formatLabel,
      completedAt,
      participantCount: resultRows.length,
      podium: resultRows.slice(0, 3).map((result) => ({
        rank: result.rank,
        userId: result.userId,
        duelistId: result.duelistId,
        displayName: result.displayName,
      })),
      mvpCards: tournament.mvpCards.map((entry) => ({
        id: entry.id,
        cardId: entry.cardId,
        cardName: entry.card.name,
        imageUrl: getCardAssetUrl(entry.card.externalCardId),
        featuredUserId: entry.featuredUserId,
        featuredDisplayName: memberById.get(entry.featuredUserId)?.displayName ?? "Duelist",
        position: entry.position,
        note: entry.note,
      })),
      mvpCandidates: candidatePairs.flatMap(({ userId, cardId }) => {
        const card = candidateCardById.get(cardId);
        const user = memberById.get(userId);
        return card && user ? [{
          cardId,
          cardName: card.name,
          imageUrl: getCardAssetUrl(card.externalCardId),
          featuredUserId: userId,
          featuredDisplayName: user.displayName,
        }] : [];
      }),
      rewardSummary: (() => {
        const rewards = rewardsByTournament.get(tournament.id) ?? [];
        return {
          totalCredits: rewards.reduce((total, reward) => total + reward.amountCredits, 0),
          totalPacks: rewards.reduce((total, reward) => total + reward.packQuantity, 0),
          packSetNames: [...new Set(rewards.flatMap((reward) => reward.packSet?.name ? [reward.packSet.name] : []))],
          grantCount: rewards.length,
        };
      })(),
    });
  }

  const rows = [...aggregate.values()]
    .map((row) => {
      const played = row.matchWins + row.losses + row.draws;
      return {
        ...row,
        winRate: played > 0 ? Number((row.matchWins / played).toFixed(3)) : 0,
      };
    })
    .sort((left, right) =>
      right.tournamentWins - left.tournamentWins
      || right.runnerUpFinishes - left.runnerUpFinishes
      || right.matchWins - left.matchWins
      || right.winRate - left.winRate
      || left.displayName.localeCompare(right.displayName, "de"),
    )
    .map((row, index) => ({ rank: index + 1, ...row }));

  return {
    runId: activeRun.id,
    viewerRole: membership.role,
    rows,
    winnerArchive: archive,
  };
}

export async function updateTournamentMvpCards(
  prisma: PrismaClient,
  options: {
    viewerId: string;
    tournamentId: string;
    input: UpdateTournamentMvpCardsRequest;
  },
) {
  const activeRun = await getActiveRun(prisma, options.viewerId);
  const membership = await requireRunMembership(prisma, {
    runId: activeRun.id,
    userId: options.viewerId,
  });
  const tournament = await loadTournament(prisma, options.tournamentId);
  if (!tournament || tournament.runId !== activeRun.id) {
    throw new DomainError({
      code: "tournament_not_found",
      message: "Dieses Turnier wurde nicht gefunden.",
      status: 404,
    });
  }
  if (tournament.status !== "COMPLETED") {
    throw new DomainError({
      code: "tournament_not_completed",
      message: "MVP-Karten können erst nach dem Turnierabschluss gewählt werden.",
      status: 409,
    });
  }
  if (tournament.hostId !== options.viewerId
    && membership.role !== "OWNER"
    && membership.role !== "ORGANIZER") {
    throw new DomainError({
      code: "tournament_mvp_forbidden",
      message: "Nur Host oder Kampagnen-Organizer können MVP-Karten wählen.",
      status: 403,
    });
  }

  await prisma.$transaction(async (tx) => {
    await persistTournamentSnapshots(tx, tournament as TournamentRecord);
    const snapshots = await tx.tournamentDeckSnapshot.findMany({
      where: { tournamentId: tournament.id },
    });
    const cardsByUser = new Map(snapshots.map((snapshot) => [
      snapshot.userId,
      new Set(normalizeSnapshotCards(snapshot.cards).map((card) => card.cardId)),
    ]));
    const uniqueCards = new Set<string>();
    for (const entry of options.input.cards) {
      if (uniqueCards.has(entry.cardId)) {
        throw new DomainError({
          code: "duplicate_tournament_mvp",
          message: "Eine Karte kann pro Turnier nur einmal als MVP ausgestellt werden.",
          status: 409,
        });
      }
      uniqueCards.add(entry.cardId);
      if (!cardsByUser.get(entry.featuredUserId)?.has(entry.cardId)) {
        throw new DomainError({
          code: "tournament_mvp_card_not_used",
          message: "Die MVP-Karte wurde im gespeicherten Turnierdeck dieses Spielers nicht gefunden.",
          status: 409,
        });
      }
    }
    const existingCards = options.input.cards.length > 0
      ? await tx.card.count({ where: { id: { in: options.input.cards.map((entry) => entry.cardId) } } })
      : 0;
    if (existingCards !== options.input.cards.length) {
      throw new DomainError({
        code: "tournament_mvp_card_missing",
        message: "Mindestens eine MVP-Karte wurde nicht gefunden.",
        status: 404,
      });
    }
    await tx.tournamentMvpCard.deleteMany({ where: { tournamentId: tournament.id } });
    if (options.input.cards.length > 0) {
      await tx.tournamentMvpCard.createMany({
        data: options.input.cards.map((entry, index) => ({
          tournamentId: tournament.id,
          cardId: entry.cardId,
          featuredUserId: entry.featuredUserId,
          position: index,
          note: entry.note ?? null,
          selectedById: options.viewerId,
        })),
      });
    }
  });

  return getCampaignLeaderboard(prisma, options.viewerId);
}
