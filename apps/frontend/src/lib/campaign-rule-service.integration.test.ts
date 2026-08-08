import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  activateCampaignRuleVersion,
  buildCampaignRuleConfig,
  createCampaignRuleVersion,
  ensureInitialCampaignRuleVersion,
  getActiveCampaignRuleVersionId,
} from "@/lib/campaign-rule-service";

const prisma = new PrismaClient();

describe("campaign rule activation", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("activates due date and checkpoint versions without cloning them", async () => {
    const tag = `vitest-rule-${Date.now()}`;
    let userId: string | undefined;
    let runId: string | undefined;
    let checkpointId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: tag.toUpperCase(),
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Rule Tester",
        },
      });
      userId = user.id;
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          defaultPackPrice: 100,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      runId = run.id;

      const initial = await ensureInitialCampaignRuleVersion(prisma, {
        runId: run.id,
        createdById: user.id,
      });
      const baseConfig = buildCampaignRuleConfig(run);
      const dateVersion = await createCampaignRuleVersion(prisma, {
        runId: run.id,
        viewerId: user.id,
        preset: "CUSTOM",
        reason: "Datumsbasierte Regelaktivierung testen",
        effectiveAt: new Date(Date.now() - 60_000).toISOString(),
        config: {
          ...baseConfig,
          economy: { ...baseConfig.economy, packPrice: 777 },
          audit: { ...baseConfig.audit, activationMode: "AT_DATE" },
        },
      });
      expect(dateVersion.status).toBe("SCHEDULED");

      const dateActiveId = await getActiveCampaignRuleVersionId(prisma, run.id);
      expect(dateActiveId).toBe(dateVersion.id);
      const afterDate = await prisma.playGroupRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(afterDate.defaultPackPrice).toBe(777);

      const checkpoint = await prisma.runProgressionCheckpoint.create({
        data: {
          runId: run.id,
          sequence: 1,
          title: "Scheduled rules checkpoint",
          status: "LOCKED",
        },
      });
      checkpointId = checkpoint.id;
      const checkpointVersion = await createCampaignRuleVersion(prisma, {
        runId: run.id,
        viewerId: user.id,
        preset: "CUSTOM",
        reason: "Checkpointbasierte Regelaktivierung testen",
        effectiveCheckpointId: checkpoint.id,
        config: {
          ...baseConfig,
          economy: { ...baseConfig.economy, packPrice: 888 },
          audit: { ...baseConfig.audit, activationMode: "NEXT_PROGRESSION_STEP" },
        },
      });
      expect(checkpointVersion.status).toBe("SCHEDULED");
      expect(await getActiveCampaignRuleVersionId(prisma, run.id)).toBe(dateVersion.id);
      expect(await getActiveCampaignRuleVersionId(prisma, run.id, { checkpointId: checkpoint.id }))
        .toBe(checkpointVersion.id);

      const [versions, finalRun] = await Promise.all([
        prisma.campaignRuleVersion.findMany({ where: { runId: run.id }, orderBy: { version: "asc" } }),
        prisma.playGroupRun.findUniqueOrThrow({ where: { id: run.id } }),
      ]);
      expect(versions).toHaveLength(3);
      expect(versions.find((version) => version.id === initial.id)?.status).toBe("SUPERSEDED");
      expect(versions.find((version) => version.id === checkpointVersion.id)?.status).toBe("ACTIVE");
      expect(finalRun.defaultPackPrice).toBe(888);
    } finally {
      if (runId) {
        await prisma.playGroupRun.updateMany({ where: { id: runId }, data: { activeRuleVersionId: null } });
      }
      if (checkpointId) {
        await prisma.runProgressionCheckpoint.deleteMany({ where: { id: checkpointId } });
      }
      if (runId) {
        await prisma.campaignRuleVersion.deleteMany({ where: { runId } });
        await prisma.playGroupRun.deleteMany({ where: { id: runId } });
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it("serializes concurrent manual activations to one ACTIVE version", async () => {
    const tag = `vitest-rule-race-${Date.now()}`;
    let userId: string | undefined;
    let runId: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: tag.toUpperCase(),
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Rule Race Tester",
        },
      });
      userId = user.id;
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      runId = run.id;
      await ensureInitialCampaignRuleVersion(prisma, { runId: run.id, createdById: user.id });
      const config = buildCampaignRuleConfig(run);
      const scheduled = await createCampaignRuleVersion(prisma, {
        runId: run.id,
        viewerId: user.id,
        preset: "CUSTOM",
        reason: "Geplante Aktivierung im Paralleltest",
        effectiveAt: new Date(Date.now() + 86_400_000).toISOString(),
        config: {
          ...config,
          economy: { ...config.economy, packPrice: 999 },
          audit: { ...config.audit, activationMode: "AT_DATE" },
        },
      });
      const firstDraft = await createCampaignRuleVersion(prisma, {
        runId: run.id,
        viewerId: user.id,
        preset: "CUSTOM",
        reason: "Erste parallele Regelversion",
        config: { ...config, economy: { ...config.economy, packPrice: 321 } },
      });
      const secondDraft = await createCampaignRuleVersion(prisma, {
        runId: run.id,
        viewerId: user.id,
        preset: "CUSTOM",
        reason: "Zweite parallele Regelversion",
        config: { ...config, economy: { ...config.economy, packPrice: 654 } },
      });

      await Promise.all([
        activateCampaignRuleVersion(prisma, {
          runId: run.id,
          versionId: firstDraft.id,
          viewerId: user.id,
        }),
        activateCampaignRuleVersion(prisma, {
          runId: run.id,
          versionId: secondDraft.id,
          viewerId: user.id,
        }),
      ]);

      const [activeVersions, finalRun, supersededScheduled] = await Promise.all([
        prisma.campaignRuleVersion.findMany({ where: { runId: run.id, status: "ACTIVE" } }),
        prisma.playGroupRun.findUniqueOrThrow({ where: { id: run.id } }),
        prisma.campaignRuleVersion.findUniqueOrThrow({ where: { id: scheduled.id } }),
      ]);
      expect(activeVersions).toHaveLength(1);
      expect(finalRun.activeRuleVersionId).toBe(activeVersions[0]!.id);
      expect([firstDraft.id, secondDraft.id]).toContain(activeVersions[0]!.id);
      expect(supersededScheduled.status).toBe("SUPERSEDED");
      expect(await getActiveCampaignRuleVersionId(prisma, run.id, {
        now: new Date(Date.now() + 172_800_000),
      })).toBe(activeVersions[0]!.id);
    } finally {
      if (runId) {
        await prisma.playGroupRun.updateMany({ where: { id: runId }, data: { activeRuleVersionId: null } });
        await prisma.campaignRuleVersion.deleteMany({ where: { runId } });
        await prisma.playGroupRun.deleteMany({ where: { id: runId } });
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it("lets packs that stored the former default inherit a changed campaign price", async () => {
    const tag = `vitest-rule-price-${Date.now()}`;
    let userId: string | undefined;
    let runId: string | undefined;
    const setIds: string[] = [];

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: tag.toUpperCase(),
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Price Rule Tester",
        },
      });
      userId = user.id;
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} run`,
          defaultPackPrice: 100,
          defaultDisplaySize: 24,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      runId = run.id;
      const sets = await Promise.all(["INHERIT", "CUSTOM"].map((suffix) =>
        prisma.cardSet.create({
          data: {
            code: `${tag}-${suffix}`,
            name: `${tag} ${suffix}`,
            releaseDate: new Date("2002-03-08T00:00:00.000Z"),
            region: "TCG",
            productType: "CORE_BOOSTER",
            isOpenable: true,
            packSize: 9,
          },
        }),
      ));
      setIds.push(...sets.map((set) => set.id));
      await prisma.runSetUnlock.createMany({
        data: [
          { runId: run.id, setId: sets[0]!.id, packPrice: 100, displaySize: 24 },
          { runId: run.id, setId: sets[1]!.id, packPrice: 175, displaySize: 24 },
        ],
      });
      await ensureInitialCampaignRuleVersion(prisma, {
        runId: run.id,
        createdById: user.id,
      });
      const config = buildCampaignRuleConfig(run);
      await createCampaignRuleVersion(prisma, {
        runId: run.id,
        viewerId: user.id,
        preset: "CUSTOM",
        reason: "Globalen Packpreis auf null setzen",
        activateImmediately: true,
        config: {
          ...config,
          economy: { ...config.economy, packPrice: 0, displaySize: 24 },
        },
      });

      const [updatedRun, inheritedUnlock, customUnlock] = await Promise.all([
        prisma.playGroupRun.findUniqueOrThrow({ where: { id: run.id } }),
        prisma.runSetUnlock.findUniqueOrThrow({
          where: { runId_setId: { runId: run.id, setId: sets[0]!.id } },
        }),
        prisma.runSetUnlock.findUniqueOrThrow({
          where: { runId_setId: { runId: run.id, setId: sets[1]!.id } },
        }),
      ]);
      expect(updatedRun.defaultPackPrice).toBe(0);
      expect(inheritedUnlock.packPrice).toBeNull();
      expect(inheritedUnlock.displaySize).toBeNull();
      expect(customUnlock.packPrice).toBe(175);
    } finally {
      if (runId) {
        await prisma.playGroupRun.updateMany({ where: { id: runId }, data: { activeRuleVersionId: null } });
        await prisma.campaignRuleVersion.deleteMany({ where: { runId } });
        await prisma.runSetUnlock.deleteMany({ where: { runId } });
        await prisma.playGroupRun.deleteMany({ where: { id: runId } });
      }
      if (setIds.length > 0) await prisma.cardSet.deleteMany({ where: { id: { in: setIds } } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
  });
});
