import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { claimRewardPack } from "@/lib/pack-openings";
import { applyProgressionCheckpoint } from "@/lib/progression-service";
import { completeTournament } from "@/lib/tournament-service";

const prisma = new PrismaClient();

describe("tournament rewards and progression", () => {
  afterAll(async () => {
    await prisma.$disconnect();
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
      }

      const owner = await prisma.user.create({
        data: {
          duelistId: `${tag}-owner`,
          email: `${tag}-owner@example.test`,
          passwordHash: "test-hash",
          displayName: "Codex Owner",
        },
      });
      const player = await prisma.user.create({
        data: {
          duelistId: `${tag}-player`,
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

      await completeTournament(prisma, owner.id, tournament.id);

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

      await expect(
        prisma.runSetUnlock.findUnique({
          where: { runId_setId: { runId: run.id, setId: nextSet.id } },
        }),
      ).resolves.toBeNull();

      await completeTournament(prisma, owner.id, tournament.id);
      await expect(
        prisma.rewardGrant.count({ where: { runId: run.id, recipientId: owner.id } }),
      ).resolves.toBe(1);

      await applyProgressionCheckpoint(prisma, owner.id, run.id, checkpoint.id);

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
});
