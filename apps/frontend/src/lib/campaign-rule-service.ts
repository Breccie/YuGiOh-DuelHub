import { CampaignRuleVersionStatus, Prisma, type PrismaClient } from "@prisma/client";
import type { CampaignRuleConfig, CampaignRulePreset } from "@ygo/contracts";
import { campaignRuleConfigSchema } from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { requireRunMembership } from "@/lib/run-service";

type Db = PrismaClient | Prisma.TransactionClient;

type StoredCampaignRuleVersion = Prisma.CampaignRuleVersionGetPayload<Record<string, never>>;

function isPrismaClient(db: Db): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

async function withSerializableTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Unreachable transaction retry state.");
}

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
  changeReason: string | null;
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
    changeReason: version.changeReason,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString() ?? null,
  };
}

function legacyRunSettings(config: CampaignRuleConfig) {
  return {
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
  };
}

async function lockRunForRuleActivation(tx: Prisma.TransactionClient, runId: string) {
  const locked = await tx.playGroupRun.updateMany({
    where: { id: runId },
    data: { updatedAt: new Date() },
  });
  if (locked.count !== 1) {
    throw new DomainError({ code: "run_not_found", message: "Kampagne nicht gefunden.", status: 404 });
  }
}

async function activateStoredRuleVersion(
  db: Db,
  runId: string,
  version: StoredCampaignRuleVersion,
  options: { supersedeScheduled?: boolean } = {},
) {
  const config = campaignRuleConfigSchema.parse(version.config);
  const activatedAt = new Date();

  if (options.supersedeScheduled) {
    await db.campaignRuleVersion.updateMany({
      where: { runId, status: "SCHEDULED", id: { not: version.id } },
      data: { status: "SUPERSEDED" },
    });
  }
  await db.campaignRuleVersion.updateMany({
    where: { runId, status: "ACTIVE", id: { not: version.id } },
    data: { status: "SUPERSEDED" },
  });
  const activated = await db.campaignRuleVersion.update({
    where: { id: version.id },
    data: { status: "ACTIVE", activatedAt },
  });
  await db.playGroupRun.update({
    where: { id: runId },
    data: {
      activeRuleVersionId: activated.id,
      ...legacyRunSettings(config),
    },
  });

  return activated;
}

export async function ensureInitialCampaignRuleVersion(
  db: Db,
  options: { runId: string; createdById: string; preset?: CampaignRulePreset },
) {
  const [existingActiveVersions, runPointer] = await Promise.all([
    db.campaignRuleVersion.findMany({
      where: { runId: options.runId, status: "ACTIVE" },
      orderBy: { version: "desc" },
      take: 2,
    }),
    db.playGroupRun.findUnique({
      where: { id: options.runId },
      select: { activeRuleVersionId: true },
    }),
  ]);
  const existingActive = existingActiveVersions[0];
  if (
    existingActiveVersions.length === 1
    && existingActive
    && runPointer?.activeRuleVersionId === existingActive.id
  ) {
    return existingActive;
  }
  if (isPrismaClient(db)) {
    return withSerializableTransaction(db, async (tx) => {
      await lockRunForRuleActivation(tx, options.runId);
      return ensureInitialCampaignRuleVersionLocked(tx, options);
    });
  }
  await lockRunForRuleActivation(db, options.runId);
  return ensureInitialCampaignRuleVersionLocked(db, options);
}

async function ensureInitialCampaignRuleVersionLocked(
  tx: Prisma.TransactionClient,
  options: { runId: string; createdById: string; preset?: CampaignRulePreset },
) {
  const existingActive = await tx.campaignRuleVersion.findFirst({
    where: { runId: options.runId, status: "ACTIVE" },
    orderBy: { version: "desc" },
  });
  if (existingActive) {
    await tx.campaignRuleVersion.updateMany({
      where: { runId: options.runId, status: "ACTIVE", id: { not: existingActive.id } },
      data: { status: "SUPERSEDED" },
    });
    await tx.playGroupRun.update({
      where: { id: options.runId },
      data: { activeRuleVersionId: existingActive.id },
    });
    return existingActive;
  }

  const run = await tx.playGroupRun.findUnique({ where: { id: options.runId } });
  if (!run) throw new DomainError({ code: "run_not_found", message: "Kampagne nicht gefunden.", status: 404 });

  const latest = await tx.campaignRuleVersion.findFirst({
    where: { runId: options.runId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const created = await tx.campaignRuleVersion.create({
    data: {
      runId: run.id,
      version: (latest?.version ?? 0) + 1,
      status: "DRAFT",
      presetKey: options.preset ?? "CLASSIC_PROGRESSION",
      config: buildCampaignRuleConfig(run) as Prisma.InputJsonValue,
      effectiveAt: run.createdAt,
      createdById: options.createdById,
      activatedAt: null,
    },
  });
  return activateStoredRuleVersion(tx, run.id, created);
}

export async function listCampaignRuleVersions(prisma: PrismaClient, viewerId: string, runId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId });
  await getActiveCampaignRuleVersionId(prisma, runId);
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
    reason?: string | null;
  },
) {
  await requireRunMembership(prisma, {
    runId: options.runId,
    userId: options.viewerId,
    ownerOnly: true,
  });
  const config = campaignRuleConfigSchema.parse(options.config);
  const changeReason = options.reason?.trim() || null;
  if (config.audit.requireReasonForChanges && !changeReason) {
    throw new DomainError({
      code: "rule_change_reason_required",
      message: "Für diese Regeländerung ist eine Begründung erforderlich.",
      status: 400,
    });
  }

  if (options.effectiveAt && options.effectiveCheckpointId) {
    throw new DomainError({
      code: "rule_activation_ambiguous",
      message: "Eine Regelversion kann entweder nach Datum oder nach Progressionsschritt geplant werden.",
      status: 400,
    });
  }
  if (
    !options.activateImmediately
    && config.audit.activationMode === "AT_DATE"
    && !options.effectiveAt
  ) {
    throw new DomainError({
      code: "rule_activation_date_required",
      message: "Für die zeitgesteuerte Aktivierung ist ein Datum erforderlich.",
      status: 400,
    });
  }
  if (
    !options.activateImmediately
    && config.audit.activationMode === "NEXT_PROGRESSION_STEP"
    && !options.effectiveCheckpointId
  ) {
    throw new DomainError({
      code: "rule_activation_checkpoint_required",
      message: "Für diese Aktivierung ist ein geplanter Progressionsschritt erforderlich.",
      status: 400,
    });
  }

  return withSerializableTransaction(prisma, async (tx) => {
    await lockRunForRuleActivation(tx, options.runId);
    if (options.effectiveCheckpointId) {
      const checkpoint = await tx.runProgressionCheckpoint.findFirst({
        where: { id: options.effectiveCheckpointId, runId: options.runId },
        select: { id: true, status: true },
      });
      if (!checkpoint) {
        throw new DomainError({
          code: "rule_checkpoint_not_found",
          message: "Der gewählte Progressionsschritt gehört nicht zu dieser Kampagne.",
          status: 404,
        });
      }
      if (checkpoint.status === "APPLIED") {
        throw new DomainError({
          code: "rule_checkpoint_already_applied",
          message: "Für einen bereits angewendeten Progressionsschritt kann keine Regelversion geplant werden.",
          status: 409,
        });
      }
    }
    const latest = await tx.campaignRuleVersion.findFirst({
      where: { runId: options.runId },
      orderBy: { version: "desc" },
    });
    const shouldActivate = options.activateImmediately === true;
    const version = await tx.campaignRuleVersion.create({
      data: {
        runId: options.runId,
        version: (latest?.version ?? 0) + 1,
        status: shouldActivate
          ? "DRAFT"
          : options.effectiveAt || options.effectiveCheckpointId
            ? "SCHEDULED"
            : "DRAFT",
        presetKey: options.preset,
        config: config as Prisma.InputJsonValue,
        effectiveAt: options.effectiveAt ? new Date(options.effectiveAt) : null,
        effectiveCheckpointId: options.effectiveCheckpointId ?? null,
        createdById: options.viewerId,
        changeReason,
        activatedAt: null,
      },
    });
    if (shouldActivate) {
      return serializeCampaignRuleVersion(
        await activateStoredRuleVersion(tx, options.runId, version, { supersedeScheduled: true }),
      );
    }
    return serializeCampaignRuleVersion(version);
  });
}

export async function activateCampaignRuleVersion(
  prisma: PrismaClient,
  options: { runId: string; versionId: string; viewerId: string },
) {
  await requireRunMembership(prisma, {
    runId: options.runId,
    userId: options.viewerId,
    ownerOnly: true,
  });
  return withSerializableTransaction(prisma, async (tx) => {
    await lockRunForRuleActivation(tx, options.runId);
    const version = await tx.campaignRuleVersion.findFirst({
      where: { id: options.versionId, runId: options.runId },
    });
    if (!version) throw new DomainError({ code: "rule_version_not_found", message: "Regelversion nicht gefunden.", status: 404 });
    return serializeCampaignRuleVersion(
      await activateStoredRuleVersion(tx, options.runId, version, { supersedeScheduled: true }),
    );
  });
}

async function resolveActiveCampaignRuleVersionLocked(
  tx: Prisma.TransactionClient,
  runId: string,
  options: { checkpointId?: string; now: Date },
) {
  await lockRunForRuleActivation(tx, runId);
  const run = await tx.playGroupRun.findUnique({
    where: { id: runId },
    select: {
      activeRuleVersionId: true,
      ownerId: true,
      activeRuleVersion: { select: { status: true } },
    },
  });
  if (!run) return null;

  const dueConditions: Prisma.CampaignRuleVersionWhereInput[] = [
    { effectiveAt: { not: null, lte: options.now } },
  ];
  if (options.checkpointId) dueConditions.push({ effectiveCheckpointId: options.checkpointId });
  const dueVersions = await tx.campaignRuleVersion.findMany({
    where: { runId, status: "SCHEDULED", OR: dueConditions },
    orderBy: { version: "desc" },
  });
  const dueVersion = dueVersions[0];
  if (dueVersion) {
    if (dueVersions.length > 1) {
      await tx.campaignRuleVersion.updateMany({
        where: { id: { in: dueVersions.slice(1).map((version) => version.id) } },
        data: { status: "SUPERSEDED" },
      });
    }
    return (await activateStoredRuleVersion(tx, runId, dueVersion)).id;
  }

  if (run.activeRuleVersionId && run.activeRuleVersion?.status === "ACTIVE") {
    return run.activeRuleVersionId;
  }
  return (await ensureInitialCampaignRuleVersionLocked(tx, { runId, createdById: run.ownerId })).id;
}

export async function getActiveCampaignRuleVersionId(
  db: Db,
  runId: string,
  options: { checkpointId?: string; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const run = await db.playGroupRun.findUnique({
    where: { id: runId },
    select: {
      activeRuleVersionId: true,
      ownerId: true,
      activeRuleVersion: { select: { status: true } },
    },
  });
  if (!run) return null;

  const dueConditions: Prisma.CampaignRuleVersionWhereInput[] = [
    { effectiveAt: { not: null, lte: now } },
  ];
  if (options.checkpointId) {
    dueConditions.push({ effectiveCheckpointId: options.checkpointId });
  }
  const dueVersion = await db.campaignRuleVersion.findFirst({
    where: {
      runId,
      status: "SCHEDULED",
      OR: dueConditions,
    },
    orderBy: { version: "desc" },
  });
  if (!dueVersion && run.activeRuleVersionId && run.activeRuleVersion?.status === "ACTIVE") {
    return run.activeRuleVersionId;
  }
  const lockedOptions = { checkpointId: options.checkpointId, now };
  if (isPrismaClient(db)) {
    return withSerializableTransaction(db, (tx) => (
      resolveActiveCampaignRuleVersionLocked(tx, runId, lockedOptions)
    ));
  }
  return resolveActiveCampaignRuleVersionLocked(db, runId, lockedOptions);
}

export async function getActiveCampaignRuleConfig(
  db: Db,
  runId: string,
  options: { checkpointId?: string; now?: Date } = {},
) {
  const versionId = await getActiveCampaignRuleVersionId(db, runId, options);
  if (!versionId) {
    throw new DomainError({
      code: "run_not_found",
      message: "Kampagne nicht gefunden.",
      status: 404,
    });
  }
  const version = await db.campaignRuleVersion.findUnique({
    where: { id: versionId },
    select: { config: true },
  });
  if (!version) {
    throw new DomainError({
      code: "rule_version_not_found",
      message: "Aktive Regelversion wurde nicht gefunden.",
      status: 409,
    });
  }
  return campaignRuleConfigSchema.parse(version.config);
}
