import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { claimRewardPack, createRunRewardGrant, openPack } from "@/lib/pack-openings";
import {
  applyProgressionCheckpoint,
  generateRunProgression,
} from "@/lib/progression-service";
import {
  completeTournament,
  recordTournamentMatchResult,
} from "@/lib/tournament-service";

const prisma = new PrismaClient();

describe("tournament rewards and progression", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lets players report external match scores and requires opponent confirmation", async () => {
    const tag = `vitest-match-report-${Date.now()}`;
    const createdIds: {
      runId?: string;
      ownerId?: string;
      playerId?: string;
    } = {};

    try {
      const [owner, player] = await Promise.all([
        prisma.user.create({
          data: {
            duelistId: `${tag}-owner`,
            email: `${tag}-owner@example.test`,
            passwordHash: "test-hash",
            displayName: "Codex Owner",
          },
        }),
        prisma.user.create({
          data: {
            duelistId: `${tag}-player`,
            email: `${tag}-player@example.test`,
            passwordHash: "test-hash",
            displayName: "Codex Player",
          },
        }),
      ]);
      createdIds.ownerId = owner.id;
      createdIds.playerId = player.id;

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: owner.id,
          name: `${tag} run`,
          startingCredits: 0,
          memberships: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: player.id, role: "PLAYER" },
            ],
          },
        },
      });
      createdIds.runId = run.id;

      const tournament = await prisma.tournament.create({
        data: {
          runId: run.id,
          hostId: owner.id,
          title: `${tag} tournament`,
          status: "ACTIVE",
          participants: {
            create: [
              { userId: owner.id, status: "ACCEPTED", joinedAt: new Date(), seed: 1 },
              { userId: player.id, status: "ACCEPTED", joinedAt: new Date(), seed: 2 },
            ],
          },
          rounds: {
            create: {
              roundNumber: 1,
              status: "PAIRED",
            },
          },
        },
        include: {
          rounds: true,
        },
      });
      const match = await prisma.tournamentMatch.create({
        data: {
          tournamentId: tournament.id,
          roundId: tournament.rounds[0]!.id,
          playerOneId: owner.id,
          playerTwoId: player.id,
          status: "PENDING",
          tableNumber: 1,
        },
      });

      const reported = await recordTournamentMatchResult(prisma, owner.id, match.id, {
        action: "report",
        playerOneScore: 2,
        playerTwoScore: 1,
      });

      expect(reported.rounds[0]!.matches[0]).toEqual(
        expect.objectContaining({
          status: "REPORTED",
          playerOneScore: 2,
          playerTwoScore: 1,
          winnerId: owner.id,
          reportedById: owner.id,
          confirmedById: null,
        }),
      );
      expect(reported.standings.standings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: owner.id, matchPoints: 0 }),
          expect.objectContaining({ userId: player.id, matchPoints: 0 }),
        ]),
      );
      await expect(completeTournament(prisma, owner.id, tournament.id)).rejects.toThrow(
        "offene Matches",
      );
      await expect(
        recordTournamentMatchResult(prisma, owner.id, match.id, {
          action: "confirm",
          playerOneScore: 2,
          playerTwoScore: 1,
        }),
      ).rejects.toThrow("eigene Ergebnis");

      const confirmed = await recordTournamentMatchResult(prisma, player.id, match.id, {
        action: "confirm",
        playerOneScore: 2,
        playerTwoScore: 1,
      });

      expect(confirmed.rounds[0]!.matches[0]).toEqual(
        expect.objectContaining({
          status: "COMPLETED",
          confirmedById: player.id,
        }),
      );
      expect(confirmed.standings.standings[0]).toEqual(
        expect.objectContaining({
          userId: owner.id,
          matchPoints: 3,
          wins: 1,
        }),
      );
    } finally {
      if (createdIds.runId) {
        await prisma.playGroupRun.deleteMany({ where: { id: createdIds.runId } });
      }
      if (createdIds.ownerId || createdIds.playerId) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [createdIds.ownerId, createdIds.playerId].filter(Boolean) as string[],
            },
          },
        });
      }
    }
  });

  it("rewards the winner with credits and tournament packs, then unlocks the next pack after apply", async () => {
    const tag = `vitest-tournament-reward-${Date.now()}`;
    const createdIds: {
      runId?: string;
      ownerId?: string;
      playerId?: string;
      nextSetId?: string;
      rewardPackSetId?: string;
      cardIds: string[];
    } = {
      cardIds: [],
    };

    try {
      const [nextSet, rewardPackSet] = await Promise.all([
        prisma.cardSet.create({
          data: {
            code: `${tag}-NEXT`,
            name: `${tag} Next Chronological Booster`,
            releaseDate: new Date("2002-03-08T00:00:00.000Z"),
            region: "TCG",
            productType: "CORE_BOOSTER",
            isOpenable: true,
            packSize: 9,
          },
        }),
        prisma.cardSet.create({
          data: {
            code: `${tag}-TP1`,
            name: `${tag} Tournament Pack 1`,
            releaseDate: new Date("2002-03-08T00:00:00.000Z"),
            region: "TCG",
            productType: "BOOSTER",
            isOpenable: true,
            packSize: 3,
          },
        }),
      ]);
      createdIds.nextSetId = nextSet.id;
      createdIds.rewardPackSetId = rewardPackSet.id;

      for (let index = 1; index <= 5; index += 1) {
        const card = await prisma.card.create({
          data: {
            slug: `${tag}-reward-card-${index}`,
            externalCardId: `${tag}-reward-card-${index}`,
            name: `${tag} Reward Card ${index}`,
            kind: "MONSTER",
          },
        });
        createdIds.cardIds.push(card.id);
        await prisma.setCard.create({
          data: {
            setId: rewardPackSet.id,
            cardId: card.id,
            setCode: `${rewardPackSet.code}-${String(index).padStart(3, "0")}`,
            rarity: index === 1 ? "Ultra Rare" : "Common",
            collectorNumber: String(index),
            pullWeight: index === 1 ? 1 : 5,
          },
        });
        await prisma.setCard.create({
          data: {
            setId: nextSet.id,
            cardId: card.id,
            setCode: `${nextSet.code}-${String(index).padStart(3, "0")}`,
            rarity: index === 1 ? "Ultra Rare" : "Common",
            collectorNumber: String(index),
            pullWeight: index === 1 ? 1 : 5,
          },
        });
      }

      const owner = await prisma.user.create({
        data: {
          duelistId: `${tag.toUpperCase()}-OWNER`,
          email: `${tag}-owner@example.test`,
          passwordHash: "test-hash",
          displayName: "Codex Owner",
        },
      });
      const player = await prisma.user.create({
        data: {
          duelistId: `${tag.toUpperCase()}-PLAYER`,
          email: `${tag}-player@example.test`,
          passwordHash: "test-hash",
          displayName: "Codex Player",
        },
      });
      createdIds.ownerId = owner.id;
      createdIds.playerId = player.id;

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: owner.id,
          name: `${tag} run`,
          startingCredits: 0,
          freePacksPerSetUnlock: 3,
          memberships: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: player.id, role: "PLAYER" },
            ],
          },
          wallets: {
            create: [
              { userId: owner.id, balance: 0 },
              { userId: player.id, balance: 0 },
            ],
          },
        },
      });
      createdIds.runId = run.id;
      await prisma.runSetUnlock.create({
        data: {
          runId: run.id,
          setId: rewardPackSet.id,
          rewardOnly: true,
          note: `${tag} seeded reward-only unlock guard`,
        },
      });

      const tournament = await prisma.tournament.create({
        data: {
          runId: run.id,
          hostId: owner.id,
          title: `${tag} tournament`,
          status: "ACTIVE",
          participants: {
            create: [
              { userId: owner.id, status: "ACCEPTED", joinedAt: new Date(), seed: 1 },
              { userId: player.id, status: "ACCEPTED", joinedAt: new Date(), seed: 2 },
            ],
          },
          rounds: {
            create: {
              roundNumber: 1,
              status: "COMPLETED",
            },
          },
        },
        include: {
          rounds: true,
        },
      });
      await prisma.tournamentMatch.create({
        data: {
          tournamentId: tournament.id,
          roundId: tournament.rounds[0]!.id,
          playerOneId: owner.id,
          playerTwoId: player.id,
          winnerId: owner.id,
          playerOneScore: 2,
          playerTwoScore: 0,
          status: "COMPLETED",
          tableNumber: 1,
        },
      });

      const checkpoint = await prisma.runProgressionCheckpoint.create({
        data: {
          runId: run.id,
          sequence: 1,
          title: `${tag} checkpoint`,
          unlockDate: nextSet.releaseDate,
          requiredTournamentId: tournament.id,
          status: "LOCKED",
          unlocks: {
            create: [
              { runId: run.id, type: "SET", setId: nextSet.id },
              {
                runId: run.id,
                type: "REWARD",
                rewardConfig: {
                  placements: [
                    {
                      rank: 1,
                      credits: 300,
                      packSetId: rewardPackSet.id,
                      packQuantity: 2,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const completedDetail = await completeTournament(prisma, owner.id, tournament.id);

      const [completedTournament, readyCheckpoint, rewardGrant, ownerWallet, ledgerEntry] =
        await Promise.all([
          prisma.tournament.findUnique({ where: { id: tournament.id } }),
          prisma.runProgressionCheckpoint.findUnique({ where: { id: checkpoint.id } }),
          prisma.rewardGrant.findFirst({ where: { runId: run.id, recipientId: owner.id } }),
          prisma.creditWallet.findUnique({
            where: { runId_userId: { runId: run.id, userId: owner.id } },
          }),
          prisma.creditLedgerEntry.findFirst({
            where: { runId: run.id, userId: owner.id, source: "TOURNAMENT_REWARD" },
          }),
        ]);

      expect(completedTournament?.status).toBe("COMPLETED");
      expect(completedDetail.campaign).toEqual(
        expect.objectContaining({
          openMatchCount: 0,
          canComplete: false,
          readyCheckpoint: expect.objectContaining({
            id: checkpoint.id,
            setNames: [nextSet.name],
            freePacksPerSetUnlock: 3,
          }),
        }),
      );
      expect(completedDetail.campaign.rewardGrants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recipientId: owner.id,
            recipientName: owner.displayName,
            rank: 1,
            amountCredits: 300,
            packQuantity: 2,
            packSetName: rewardPackSet.name,
          }),
        ]),
      );
      expect(readyCheckpoint?.status).toBe("READY");
      expect(rewardGrant).toEqual(
        expect.objectContaining({
          amountCredits: 300,
          packSetId: rewardPackSet.id,
          packQuantity: 2,
          status: "PENDING",
        }),
      );
      expect(ownerWallet?.balance).toBe(300);
      expect(ledgerEntry).toEqual(
        expect.objectContaining({
          amount: 300,
          source: "TOURNAMENT_REWARD",
          referenceType: "RewardGrant",
          referenceId: rewardGrant?.id,
        }),
      );
      await expect(
        claimRewardPack(prisma, {
          viewerId: player.id,
          runId: run.id,
          rewardGrantId: rewardGrant!.id,
        }),
      ).rejects.toMatchObject({
        code: "not_reward_recipient",
      });

      const walletBeforeClaim = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });
      const claimPayload = await claimRewardPack(prisma, {
        viewerId: owner.id,
        runId: run.id,
        rewardGrantId: rewardGrant!.id,
      });
      const [walletAfterClaim, claimedGrant, rewardBatchCount, rewardOpeningCount, pullCount] =
        await Promise.all([
          prisma.creditWallet.findUniqueOrThrow({
            where: { runId_userId: { runId: run.id, userId: owner.id } },
          }),
          prisma.rewardGrant.findUniqueOrThrow({ where: { id: rewardGrant!.id } }),
          prisma.packOpeningBatch.count({
            where: {
              runId: run.id,
              userId: owner.id,
              type: "REWARD",
              idempotencyKey: `reward:${rewardGrant!.id}`,
            },
          }),
          prisma.packOpening.count({
            where: {
              runId: run.id,
              userId: owner.id,
              batchId: claimPayload.batch.id,
            },
          }),
          prisma.packPull.count({
            where: {
              opening: {
                batchId: claimPayload.batch.id,
              },
            },
          }),
        ]);

      expect(claimPayload.batch).toEqual(
        expect.objectContaining({
          type: "REWARD",
          quantity: 2,
          totalCost: 0,
          setId: rewardPackSet.id,
        }),
      );
      expect(claimPayload.openings).toHaveLength(2);
      expect(rewardOpeningCount).toBe(2);
      expect(pullCount).toBe(6);
      expect(rewardBatchCount).toBe(1);
      expect(walletAfterClaim.balance).toBe(walletBeforeClaim.balance);
      expect(claimedGrant).toEqual(
        expect.objectContaining({
          status: "CLAIMED",
          claimedAt: expect.any(Date),
        }),
      );

      await expect(
        claimRewardPack(prisma, {
          viewerId: owner.id,
          runId: run.id,
          rewardGrantId: rewardGrant!.id,
        }),
      ).rejects.toMatchObject({
        code: "reward_already_claimed",
      });
      await expect(
        prisma.packOpening.count({
          where: {
            runId: run.id,
            userId: owner.id,
            batchId: claimPayload.batch.id,
          },
        }),
      ).resolves.toBe(2);

      const manualReward = await createRunRewardGrant(prisma, {
        organizerId: owner.id,
        runId: run.id,
        recipientDuelistId: owner.duelistId,
        amountCredits: 25,
        packSetId: rewardPackSet.id,
        packQuantity: 1,
        reason: `${tag} manual mixed reward`,
      });
      expect(manualReward.reward).toEqual(
        expect.objectContaining({
          amountCredits: 25,
          packSetId: rewardPackSet.id,
          packQuantity: 1,
          status: "PENDING",
        }),
      );
      await expect(
        prisma.creditLedgerEntry.findFirst({
          where: {
            runId: run.id,
            userId: owner.id,
            source: "MANUAL_GRANT",
            referenceId: manualReward.reward.id,
          },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          amount: 25,
          referenceType: "RewardGrant",
        }),
      );
      const walletBeforeManualClaim = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });
      const manualClaim = await claimRewardPack(prisma, {
        viewerId: owner.id,
        runId: run.id,
        rewardGrantId: manualReward.reward.id,
      });
      const walletAfterManualClaim = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });
      expect(manualClaim.batch).toEqual(
        expect.objectContaining({
          type: "REWARD",
          quantity: 1,
          totalCost: 0,
        }),
      );
      expect(manualClaim.openings).toHaveLength(1);
      expect(walletAfterManualClaim.balance).toBe(walletBeforeManualClaim.balance);

      await expect(
        prisma.runSetUnlock.findUnique({
          where: { runId_setId: { runId: run.id, setId: nextSet.id } },
        }),
      ).resolves.toBeNull();
      await expect(
        openPack(prisma, {
          viewerId: owner.id,
          runId: run.id,
          setId: nextSet.id,
        }),
      ).rejects.toMatchObject({
        code: "pack_locked",
      });

      await completeTournament(prisma, owner.id, tournament.id);
      await expect(
        prisma.rewardGrant.count({
          where: {
            runId: run.id,
            recipientId: owner.id,
            reason: {
              startsWith: `TOURNAMENT_REWARD | ${tournament.id}`,
            },
          },
        }),
      ).resolves.toBe(1);

      await applyProgressionCheckpoint(prisma, owner.id, run.id, checkpoint.id);

      const freePackReason = `SET_UNLOCK_FREE_PACKS | ${checkpoint.id}`;
      const [ownerFreePackGrant, playerFreePackGrant] = await Promise.all([
        prisma.rewardGrant.findFirst({
          where: {
            runId: run.id,
            recipientId: owner.id,
            packSetId: nextSet.id,
            reason: {
              startsWith: freePackReason,
            },
          },
        }),
        prisma.rewardGrant.findFirst({
          where: {
            runId: run.id,
            recipientId: player.id,
            packSetId: nextSet.id,
            reason: {
              startsWith: freePackReason,
            },
          },
        }),
      ]);

      expect(ownerFreePackGrant).toEqual(
        expect.objectContaining({
          amountCredits: 0,
          packSetId: nextSet.id,
          packQuantity: 3,
          status: "PENDING",
        }),
      );
      expect(playerFreePackGrant).toEqual(
        expect.objectContaining({
          amountCredits: 0,
          packSetId: nextSet.id,
          packQuantity: 3,
          status: "PENDING",
        }),
      );

      await expect(
        prisma.runProgressionCheckpoint.findUnique({ where: { id: checkpoint.id } }),
      ).resolves.toEqual(expect.objectContaining({ status: "APPLIED" }));
      await expect(
        prisma.runSetUnlock.findUnique({
          where: { runId_setId: { runId: run.id, setId: nextSet.id } },
        }),
      ).resolves.toEqual(expect.objectContaining({ setId: nextSet.id }));
      await expect(prisma.playGroupRun.findUnique({ where: { id: run.id } })).resolves.toEqual(
        expect.objectContaining({ historyCursor: nextSet.releaseDate }),
      );

      const walletBeforeFreePackClaim = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });
      const freePackClaim = await claimRewardPack(prisma, {
        viewerId: owner.id,
        runId: run.id,
        rewardGrantId: ownerFreePackGrant!.id,
      });
      const walletAfterFreePackClaim = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });

      expect(freePackClaim.batch).toEqual(
        expect.objectContaining({
          type: "REWARD",
          quantity: 3,
          totalCost: 0,
          setId: nextSet.id,
        }),
      );
      expect(freePackClaim.openings).toHaveLength(3);
      expect(walletAfterFreePackClaim.balance).toBe(walletBeforeFreePackClaim.balance);

      const walletBeforeShopPurchase = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });
      const shopOpening = await openPack(prisma, {
        viewerId: owner.id,
        runId: run.id,
        setId: nextSet.id,
      });
      const walletAfterShopPurchase = await prisma.creditWallet.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: owner.id } },
      });

      expect(shopOpening.set.id).toBe(nextSet.id);
      expect(walletAfterShopPurchase.balance).toBe(
        walletBeforeShopPurchase.balance - run.defaultPackPrice,
      );
      await expect(
        prisma.creditLedgerEntry.findFirst({
          where: {
            runId: run.id,
            userId: owner.id,
            source: "PACK_PURCHASE",
            referenceType: "PackOpeningBatch",
            note: `Pack gekauft: ${nextSet.name}`,
          },
        }),
      ).resolves.toEqual(expect.objectContaining({ amount: -run.defaultPackPrice }));
    } finally {
      if (createdIds.runId) {
        await prisma.playGroupRun.deleteMany({ where: { id: createdIds.runId } });
      }
      if (createdIds.ownerId || createdIds.playerId) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [createdIds.ownerId, createdIds.playerId].filter(Boolean) as string[],
            },
          },
        });
      }
      if (createdIds.nextSetId || createdIds.rewardPackSetId) {
        await prisma.cardSet.deleteMany({
          where: {
            id: {
              in: [createdIds.nextSetId, createdIds.rewardPackSetId].filter(Boolean) as string[],
            },
          },
        });
      }
      if (createdIds.cardIds.length > 0) {
        await prisma.card.deleteMany({
          where: {
            id: {
              in: createdIds.cardIds,
            },
          },
        });
      }
    }
  });

  it("generates chronological checkpoints without turning tournament packs into free unlocks", async () => {
    const tag = `vitest-progression-generator-${Date.now()}`;
    const createdIds: {
      runId?: string;
      ownerId?: string;
      playerId?: string;
      setIds: string[];
      promoSourceIds: string[];
    } = {
      setIds: [],
      promoSourceIds: [],
    };

    try {
      const [firstSet, tournamentPack, secondSet] = await Promise.all([
        prisma.cardSet.create({
          data: {
            code: `${tag}-LOB`,
            name: `${tag} Legend Booster`,
            releaseDate: new Date("2099-03-08T00:00:00.000Z"),
            region: "TCG",
            productType: "CORE_BOOSTER",
            isOpenable: true,
            packSize: 9,
          },
        }),
        prisma.cardSet.create({
          data: {
            code: `${tag}-TP1`,
            name: `${tag} Tournament Pack 1`,
            releaseDate: new Date("2099-04-01T00:00:00.000Z"),
            region: "TCG",
            productType: "BOOSTER",
            isOpenable: true,
            packSize: 3,
          },
        }),
        prisma.cardSet.create({
          data: {
            code: `${tag}-MRD`,
            name: `${tag} Metal Booster`,
            releaseDate: new Date("2099-06-26T00:00:00.000Z"),
            region: "TCG",
            productType: "CORE_BOOSTER",
            isOpenable: true,
            packSize: 9,
          },
        }),
      ]);
      createdIds.setIds.push(firstSet.id, tournamentPack.id, secondSet.id);

      const [owner, player] = await Promise.all([
        prisma.user.create({
          data: {
            duelistId: `${tag}-owner`,
            email: `${tag}-owner@example.test`,
            passwordHash: "test-hash",
            displayName: "Codex Owner",
          },
        }),
        prisma.user.create({
          data: {
            duelistId: `${tag}-player`,
            email: `${tag}-player@example.test`,
            passwordHash: "test-hash",
            displayName: "Codex Player",
          },
        }),
      ]);
      createdIds.ownerId = owner.id;
      createdIds.playerId = player.id;

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: owner.id,
          name: `${tag} run`,
          startingCredits: 0,
          tournamentWinnerCredits: 900,
          tournamentRunnerUpCredits: 450,
          tournamentParticipationCredits: 125,
          memberships: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: player.id, role: "PLAYER" },
            ],
          },
          wallets: {
            create: [
              { userId: owner.id, balance: 0 },
              { userId: player.id, balance: 0 },
            ],
          },
        },
      });
      createdIds.runId = run.id;

      const [promoSource, packRewardSource] = await Promise.all([
        prisma.promoSource.create({
          data: {
            code: `${tag}-JUMP`,
            name: `${tag} Jump Promo`,
            sourceType: "PROMO_CHOICE",
            claimMode: "CHOOSE",
            availableFrom: new Date("2099-03-01T00:00:00.000Z"),
          },
        }),
        prisma.promoSource.create({
          data: {
            code: `${tag}-PACK-REWARD`,
            name: `${tag} Pack Reward Source`,
            sourceType: "PACK_REWARD",
            claimMode: "RANDOM",
            availableFrom: new Date("2099-03-01T00:00:00.000Z"),
          },
        }),
      ]);
      createdIds.promoSourceIds.push(promoSource.id, packRewardSource.id);

      const event = await prisma.historyEvent.create({
        data: {
          runId: run.id,
          title: `${tag} historical event`,
          type: "TOURNAMENT_PACK_PERIOD",
          eventDate: new Date("2099-04-15T00:00:00.000Z"),
        },
      });

      const generated = await generateRunProgression(prisma, owner.id, run.id, {
        count: 2,
        fromDate: "2099-01-01T00:00:00.000Z",
        setsPerCheckpoint: 1,
        includePromos: true,
        includeTournamentPacks: true,
      });

      expect(generated.generatedCheckpoints).toHaveLength(2);
      expect(
        generated.generatedCheckpoints.flatMap((checkpoint) =>
          checkpoint.unlocks
            .filter((unlock) => unlock.type === "SET")
            .map((unlock) => unlock.setId),
        ),
      ).toEqual([firstSet.id, secondSet.id]);
      const generatedPromoSourceIds = generated.generatedCheckpoints.flatMap((checkpoint) =>
        checkpoint.unlocks
          .filter((unlock) => unlock.type === "PROMO_SOURCE")
          .map((unlock) => unlock.promoSourceId),
      );
      expect(generatedPromoSourceIds).toContain(promoSource.id);
      expect(generatedPromoSourceIds).not.toContain(packRewardSource.id);
      expect(
        generated.generatedCheckpoints.flatMap((checkpoint) =>
          checkpoint.unlocks
            .filter((unlock) => unlock.type === "HISTORY_EVENT")
            .map((unlock) => unlock.historyEventId),
        ),
      ).toEqual([event.id]);

      const secondReward = generated.generatedCheckpoints[1]!.unlocks.find(
        (unlock) => unlock.type === "REWARD",
      );
      expect(JSON.stringify(secondReward?.rewardConfig)).toContain(tournamentPack.id);
      expect(secondReward?.rewardConfig).toEqual(
        expect.objectContaining({
          placements: expect.arrayContaining([
            expect.objectContaining({ rank: 1, credits: 900 }),
            expect.objectContaining({ rank: 2, credits: 450 }),
            expect.objectContaining({ fromRank: 3, toRank: 8, credits: 125 }),
          ]),
        }),
      );

      await expect(
        generateRunProgression(prisma, owner.id, run.id, {
          count: 2,
          fromDate: "2099-01-01T00:00:00.000Z",
        }),
      ).rejects.toMatchObject({
        code: "progression_generation_empty",
      });

      const tournament = await prisma.tournament.create({
        data: {
          runId: run.id,
          hostId: owner.id,
          title: `${tag} tournament`,
          status: "ACTIVE",
          participants: {
            create: [
              { userId: owner.id, status: "ACCEPTED", joinedAt: new Date(), seed: 1 },
              { userId: player.id, status: "ACCEPTED", joinedAt: new Date(), seed: 2 },
            ],
          },
          rounds: {
            create: {
              roundNumber: 1,
              status: "COMPLETED",
            },
          },
        },
        include: {
          rounds: true,
        },
      });
      await prisma.tournamentMatch.create({
        data: {
          tournamentId: tournament.id,
          roundId: tournament.rounds[0]!.id,
          playerOneId: owner.id,
          playerTwoId: player.id,
          winnerId: owner.id,
          playerOneScore: 2,
          playerTwoScore: 0,
          status: "COMPLETED",
          tableNumber: 1,
        },
      });

      await completeTournament(prisma, owner.id, tournament.id);

      await expect(
        prisma.runProgressionCheckpoint.findUnique({
          where: { id: generated.generatedCheckpoints[0]!.id },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          requiredTournamentId: tournament.id,
          status: "READY",
        }),
      );

      await applyProgressionCheckpoint(
        prisma,
        owner.id,
        run.id,
        generated.generatedCheckpoints[0]!.id,
      );

      await expect(
        prisma.runSetUnlock.findUnique({
          where: { runId_setId: { runId: run.id, setId: firstSet.id } },
        }),
      ).resolves.toEqual(expect.objectContaining({ setId: firstSet.id }));
      await expect(
        prisma.runSetUnlock.findUnique({
          where: { runId_setId: { runId: run.id, setId: tournamentPack.id } },
        }),
      ).resolves.toBeNull();
      await expect(
        prisma.runPromoAccess.findUnique({
          where: {
            runId_promoSourceId: {
              runId: run.id,
              promoSourceId: promoSource.id,
            },
          },
        }),
      ).resolves.toEqual(expect.objectContaining({ promoSourceId: promoSource.id }));
    } finally {
      if (createdIds.runId) {
        await prisma.playGroupRun.deleteMany({ where: { id: createdIds.runId } });
      }
      if (createdIds.promoSourceIds.length > 0) {
        await prisma.promoSource.deleteMany({
          where: {
            id: {
              in: createdIds.promoSourceIds,
            },
          },
        });
      }
      if (createdIds.ownerId || createdIds.playerId) {
        await prisma.user.deleteMany({
          where: {
            id: {
              in: [createdIds.ownerId, createdIds.playerId].filter(Boolean) as string[],
            },
          },
        });
      }
      if (createdIds.setIds.length > 0) {
        await prisma.cardSet.deleteMany({
          where: {
            id: {
              in: createdIds.setIds,
            },
          },
        });
      }
    }
  });
});
