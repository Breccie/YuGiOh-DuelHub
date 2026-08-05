import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  chooseCampaignStartingPack,
  decideRunJoinRequest,
  getCampaignStartingPackChoice,
  joinRunByInviteCode,
  listRunJoinRequests,
} from "@/lib/run-service";
import { buildCampaignRuleConfig } from "@/lib/campaign-rule-service";

const prisma = new PrismaClient();

describe("campaign join approval", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists an approval request and only creates membership after manager approval", async () => {
    const tag = `join-approval-${Date.now()}`;
    const owner = await prisma.user.create({
      data: {
        duelistId: `${tag}-OWNER`.toUpperCase(),
        email: `${tag}-owner@example.test`,
        passwordHash: "test-hash",
        displayName: "Approval Owner",
      },
    });
    const applicant = await prisma.user.create({
      data: {
        duelistId: `${tag}-PLAYER`.toUpperCase(),
        email: `${tag}-player@example.test`,
        passwordHash: "test-hash",
        displayName: "Approval Player",
      },
    });
    const inviteCode = `JA${Date.now()}`;
    const run = await prisma.playGroupRun.create({
      data: {
        ownerId: owner.id,
        name: tag,
        inviteCode,
        joinType: "APPROVAL",
        startingCredits: 0,
        memberships: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    const startingSets = await Promise.all(["A", "B"].map((suffix) => prisma.cardSet.create({
      data: {
        code: `${tag}-${suffix}`,
        name: `Starting Set ${suffix}`,
        releaseDate: new Date("2002-03-08T00:00:00.000Z"),
        region: "TCG",
        productType: "CORE_BOOSTER",
        isOpenable: true,
        packSize: 9,
      },
    })));

    try {
      const result = await joinRunByInviteCode(
        prisma,
        applicant.id,
        inviteCode,
        "Ich möchte mitspielen.",
      );
      expect(result.kind).toBe("PENDING");
      expect(await prisma.runMembership.findUnique({
        where: { runId_userId: { runId: run.id, userId: applicant.id } },
      })).toBeNull();

      const requests = await listRunJoinRequests(prisma, {
        runId: run.id,
        viewerId: owner.id,
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        userId: applicant.id,
        status: "PENDING",
        message: "Ich möchte mitspielen.",
      });

      const approved = await decideRunJoinRequest(prisma, {
        runId: run.id,
        requestId: requests[0]!.id,
        viewerId: owner.id,
        decision: "APPROVE",
      });
      expect(approved.status).toBe("APPROVED");
      await expect(prisma.runMembership.findUniqueOrThrow({
        where: { runId_userId: { runId: run.id, userId: applicant.id } },
      })).resolves.toMatchObject({ role: "PLAYER" });
      expect(await listRunJoinRequests(prisma, {
        runId: run.id,
        viewerId: owner.id,
      })).toEqual([]);

      const config = buildCampaignRuleConfig(run);
      config.progression.startingPackMode = "PLAYER_CHOICE";
      config.progression.startingPackCount = 3;
      config.progression.startingSetIds = startingSets.map((set) => set.id);
      const version = await prisma.campaignRuleVersion.create({
        data: {
          runId: run.id,
          version: 1,
          status: "ACTIVE",
          config,
          createdById: owner.id,
          activatedAt: new Date(),
        },
      });
      await prisma.playGroupRun.update({
        where: { id: run.id },
        data: { activeRuleVersionId: version.id },
      });

      const choice = await getCampaignStartingPackChoice(prisma, {
        runId: run.id,
        userId: applicant.id,
      });
      expect(choice).toMatchObject({ enabled: true, packQuantity: 3, selectedSetId: null });
      expect(choice.options).toHaveLength(2);
      const selected = await chooseCampaignStartingPack(prisma, {
        runId: run.id,
        userId: applicant.id,
        setId: startingSets[1]!.id,
      });
      expect(selected.selectedSetId).toBe(startingSets[1]!.id);
      await expect(chooseCampaignStartingPack(prisma, {
        runId: run.id,
        userId: applicant.id,
        setId: startingSets[0]!.id,
      })).rejects.toMatchObject({ status: 409 });
    } finally {
      await prisma.rewardGrant.deleteMany({ where: { runId: run.id } });
      await prisma.playGroupRun.update({
        where: { id: run.id },
        data: { activeRuleVersionId: null },
      });
      await prisma.campaignRuleVersion.deleteMany({ where: { runId: run.id } });
      await prisma.playGroupRun.delete({ where: { id: run.id } });
      await prisma.cardSet.deleteMany({ where: { id: { in: startingSets.map((set) => set.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, applicant.id] } } });
    }
  });
});
