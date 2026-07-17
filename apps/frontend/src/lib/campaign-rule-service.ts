import { CampaignRuleVersionStatus, Prisma, type PrismaClient } from "@prisma/client";
import type { CampaignRuleConfig, CampaignRulePreset } from "@ygo/contracts";
import { campaignRuleConfigSchema } from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { requireRunMembership } from "@/lib/run-service";

type Db = PrismaClient | Prisma.TransactionClient;

type LegacyRunSettings = {
  startingCredits: number;
  defaultPackPrice: number;
  defaultDisplaySize: number;
  freePacksPerSetUnlock: number;
  initialSetUnlockCount: number;
  setsPerProgressionStep: number;
  separatePromoProgression: boolean;
  tournamentWinnerCredits: number;
  tournamentRunnerUpCredits: number;
  tournamentParticipationCredits: number;
};

export function buildCampaignRuleConfig(run: LegacyRunSettings): CampaignRuleConfig {
  return campaignRuleConfigSchema.parse({
    economy: {
      startingCredits: run.startingCredits,
      creditLimit: null,
      packPrice: run.defaultPackPrice,
      displaySize: run.defaultDisplaySize,
    },
    progression: {
      initialSetUnlockCount: run.initialSetUnlockCount,
      setsPerStep: run.setsPerProgressionStep,
      freePacksPerSetUnlock: run.freePacksPerSetUnlock,
      separatePromoProgression: run.separatePromoProgression,
      catchUpMode: "NONE",
    },
    collection: {
      duplicateRule: "KEEP_ALL",
      printingSpecificBinders: true,
      physicalCopyReservation: true,
    },
    decks: {
      allowProxies: false,
      minMainDeck: 40,
      maxMainDeck: 60,
      maxExtraDeck: 15,
      maxSideDeck: 15,
      tournamentDeckLock: true,
    },
    trades: {
      enabled: true,
      allowCredits: false,
      reservationMinutes: 1440,
    },
    tournaments: {
      matchMode: "BEST_OF_THREE",
      requireResultConfirmation: true,
      winnerCredits: run.tournamentWinnerCredits,
      runnerUpCredits: run.tournamentRunnerUpCredits,
      participationCredits: run.tournamentParticipationCredits,
    },
    audit: {
      requireReasonForChanges: true,
      activationMode: "IMMEDIATE",
    },
  });
}

export function serializeCampaignRuleVersion(version: {
  id: string;
  runId: string;
  version: number;
  status: CampaignRuleVersionStatus;
  presetKey: string | null;
  config: Prisma.JsonValue;
  effectiveAt: Date | null;
  effectiveCheckpointId: string | null;
  createdById: string;
  createdAt: Date;
  activatedAt: Date | null;
}) {
  return {
    id: version.id,
    runId: version.runId,
    version: version.version,
    status: version.status,
    preset: version.presetKey as CampaignRulePreset | null,
    config: campaignRuleConfigSchema.parse(version.config),
    effectiveAt: version.effectiveAt?.toISOString() ?? null,
    effectiveCheckpointId: version.effectiveCheckpointId,
    createdById: version.createdById,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString() ?? null,
  };
}

export async function ensureInitialCampaignRuleVersion(
  db: Db,
  options: { runId: string; createdById: string; preset?: CampaignRulePreset },
) {
  const existing = await db.campaignRuleVersion.findFirst({
    where: { runId: options.runId },
    orderBy: { version: "desc" },
  });
  if (existing) return existing;

  const run = await db.playGroupRun.findUnique({ where: { id: options.runId } });
  if (!run) throw new DomainError({ code: "run_not_found", message: "Kampagne nicht gefunden.", status: 404 });

  const created = await db.campaignRuleVersion.create({
    data: {
      runId: run.id,
      version: 1,
      status: "ACTIVE",
      presetKey: options.preset ?? "CLASSIC_PROGRESSION",
      config: buildCampaignRuleConfig(run) as Prisma.InputJsonValue,
      effectiveAt: run.createdAt,
      createdById: options.createdById,
      activatedAt: new Date(),
    },
  });
  await db.playGroupRun.update({ where: { id: run.id }, data: { activeRuleVersionId: created.id } });
  return created;
}

export async function listCampaignRuleVersions(prisma: PrismaClient, viewerId: string, runId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId });
  const versions = await prisma.campaignRuleVersion.findMany({
    where: { runId },
    orderBy: { version: "desc" },
  });
  return versions.map(serializeCampaignRuleVersion);
}

export async function createCampaignRuleVersion(
  prisma: PrismaClient,
  options: {
    runId: string;
    viewerId: string;
    preset: CampaignRulePreset;
    config: CampaignRuleConfig;
    effectiveAt?: string | null;
    effectiveCheckpointId?: string | null;
    activateImmediately?: boolean;
  },
) {
  await requireRunMembership(prisma, { runId: options.runId, userId: options.viewerId, organizerOnly: true });
  const config = campaignRuleConfigSchema.parse(options.config);

  return prisma.$transaction(async (tx) => {
    const latest = await tx.campaignRuleVersion.findFirst({
      where: { runId: options.runId },
      orderBy: { version: "desc" },
    });
    const shouldActivate = options.activateImmediately === true;
    if (shouldActivate) {
      await tx.campaignRuleVersion.updateMany({
        where: { runId: options.runId, status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
    }
    const version = await tx.campaignRuleVersion.create({
      data: {
        runId: options.runId,
        version: (latest?.version ?? 0) + 1,
        status: shouldActivate
          ? "ACTIVE"
          : options.effectiveAt || options.effectiveCheckpointId
            ? "SCHEDULED"
            : "DRAFT",
        presetKey: options.preset,
        config: config as Prisma.InputJsonValue,
        effectiveAt: options.effectiveAt ? new Date(options.effectiveAt) : null,
        effectiveCheckpointId: options.effectiveCheckpointId ?? null,
        createdById: options.viewerId,
        activatedAt: shouldActivate ? new Date() : null,
      },
    });
    if (shouldActivate) {
      await tx.playGroupRun.update({
        where: { id: options.runId },
        data: {
          activeRuleVersionId: version.id,
          startingCredits: config.economy.startingCredits,
          defaultPackPrice: config.economy.packPrice,
          defaultDisplaySize: config.economy.displaySize,
          initialSetUnlockCount: config.progression.initialSetUnlockCount,
          setsPerProgressionStep: config.progression.setsPerStep,
          freePacksPerSetUnlock: config.progression.freePacksPerSetUnlock,
          separatePromoProgression: config.progression.separatePromoProgression,
          tournamentWinnerCredits: config.tournaments.winnerCredits,
          tournamentRunnerUpCredits: config.tournaments.runnerUpCredits,
          tournamentParticipationCredits: config.tournaments.participationCredits,
        },
      });
    }
    return serializeCampaignRuleVersion(version);
  });
}

export async function activateCampaignRuleVersion(
  prisma: PrismaClient,
  options: { runId: string; versionId: string; viewerId: string },
) {
  await requireRunMembership(prisma, { runId: options.runId, userId: options.viewerId, organizerOnly: true });
  const version = await prisma.campaignRuleVersion.findFirst({
    where: { id: options.versionId, runId: options.runId },
  });
  if (!version) throw new DomainError({ code: "rule_version_not_found", message: "Regelversion nicht gefunden.", status: 404 });
  return createCampaignRuleVersion(prisma, {
    runId: options.runId,
    viewerId: options.viewerId,
    preset: (version.presetKey as CampaignRulePreset | null) ?? "CUSTOM",
    config: campaignRuleConfigSchema.parse(version.config),
    activateImmediately: true,
  });
}

export async function getActiveCampaignRuleVersionId(db: Db, runId: string) {
  const run = await db.playGroupRun.findUnique({
    where: { id: runId },
    select: { activeRuleVersionId: true, ownerId: true },
  });
  if (!run) return null;
  if (run.activeRuleVersionId) return run.activeRuleVersionId;
  const version = await ensureInitialCampaignRuleVersion(db, { runId, createdById: run.ownerId });
  return version.id;
}
