export type SwissStanding = {
  userId: string;
  rank: number;
  seed: number | null;
};

export type SwissParticipant = {
  userId: string;
  seed: number | null;
};

export type SwissHistoricMatch = {
  playerOneId: string;
  playerTwoId: string | null;
};

export type SwissPair = {
  playerOneId: string;
  playerTwoId: string | null;
};

export function pairSwissRound(options: {
  participants: SwissParticipant[];
  standings: SwissStanding[];
  historicMatches: SwissHistoricMatch[];
}) {
  const standingRanks = new Map(
    options.standings.map((standing) => [standing.userId, standing.rank]),
  );
  const playedPairs = new Set(
    options.historicMatches
      .filter((match) => Boolean(match.playerTwoId))
      .map((match) => [match.playerOneId, match.playerTwoId].sort().join(":")),
  );

  const remaining = [...options.participants].sort((left, right) => {
    const leftRank = standingRanks.get(left.userId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = standingRanks.get(right.userId) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER);
  });

  const pairs: SwissPair[] = [];

  while (remaining.length > 1) {
    const player = remaining.shift();

    if (!player) {
      break;
    }

    let opponentIndex = remaining.findIndex((candidate) => {
      return !playedPairs.has([player.userId, candidate.userId].sort().join(":"));
    });

    if (opponentIndex === -1) {
      opponentIndex = 0;
    }

    const opponent = remaining.splice(opponentIndex, 1)[0];
    pairs.push({
      playerOneId: player.userId,
      playerTwoId: opponent?.userId ?? null,
    });
  }

  if (remaining.length === 1) {
    pairs.push({
      playerOneId: remaining[0].userId,
      playerTwoId: null,
    });
  }

  return pairs;
}
