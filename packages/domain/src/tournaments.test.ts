import { describe, expect, it } from "vitest";
import { pairSwissRound } from "./tournaments";

describe("pairSwissRound", () => {
  it("prefers pairings that have not been played before", () => {
    const pairs = pairSwissRound({
      participants: [
        { userId: "a", seed: 1 },
        { userId: "b", seed: 2 },
        { userId: "c", seed: 3 },
        { userId: "d", seed: 4 },
      ],
      standings: [
        { userId: "a", rank: 1, seed: 1 },
        { userId: "b", rank: 2, seed: 2 },
        { userId: "c", rank: 3, seed: 3 },
        { userId: "d", rank: 4, seed: 4 },
      ],
      historicMatches: [
        { playerOneId: "a", playerTwoId: "b" },
      ],
    });

    expect(pairs[0]).toEqual({ playerOneId: "a", playerTwoId: "c" });
  });

  it("assigns a bye when one player remains", () => {
    const pairs = pairSwissRound({
      participants: [
        { userId: "a", seed: 1 },
        { userId: "b", seed: 2 },
        { userId: "c", seed: 3 },
      ],
      standings: [
        { userId: "a", rank: 1, seed: 1 },
        { userId: "b", rank: 2, seed: 2 },
        { userId: "c", rank: 3, seed: 3 },
      ],
      historicMatches: [],
    });

    expect(pairs).toHaveLength(2);
    expect(pairs[1]?.playerTwoId).toBeNull();
  });
});
