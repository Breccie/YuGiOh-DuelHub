import type { PackAvailabilityStatus, PrismaClient } from "@prisma/client";
import type {
  CampaignPackAccessDto,
  CampaignPackAccessResponse,
  UpdateCampaignPackAccessRequest,
} from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { getPackAssetUrl } from "@/lib/asset-urls";
import { requireRunMembership } from "@/lib/run-service";

function isAvailableNow(input: {
  availabilityStatus: PackAvailabilityStatus;
  availableFrom: Date | null;
  availableUntil: Date | null;
}, now = new Date()) {
  if (input.availabilityStatus === "LOCKED") return false;
  if (input.availableFrom && input.availableFrom > now) return false;
  if (input.availableUntil && input.availableUntil <= now) return false;
  return input.availabilityStatus === "AVAILABLE"
    || input.availabilityStatus === "SCHEDULED";
}

export function assertPackAccessAvailable(input: {
  availabilityStatus: PackAvailabilityStatus;
  availableFrom: Date | null;
  availableUntil: Date | null;
  productName: string;
}) {
  if (isAvailableNow(input)) return;

  throw new DomainError({
    code: "pack_locked",
    message: `${input.productName} ist in dieser Kampagne derzeit gesperrt.`,
    status: 409,
  });
}

export async function listCampaignPackAccess(
  prisma: PrismaClient,
  options: { runId: string; viewerId: string },
): Promise<CampaignPackAccessResponse> {
  const membership = await requireRunMembership(prisma, {
    runId: options.runId,
    userId: options.viewerId,
  });
  const [sets, customVersions] = await Promise.all([
    prisma.cardSet.findMany({
      where: {
        isOpenable: true,
        region: { not: "CUSTOM" },
      },
      include: {
        runUnlocks: {
          where: { runId: options.runId },
          take: 1,
        },
      },
      orderBy: [{ releaseDate: "asc" }, { code: "asc" }],
    }),
    prisma.customPackVersion.findMany({
      where: {
        status: "PUBLISHED",
        definition: { runId: options.runId },
      },
      include: {
        definition: true,
        accesses: {
          where: { runId: options.runId },
          take: 1,
        },
      },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
    }),
  ]);

  const setItems: CampaignPackAccessDto[] = sets.map((set) => {
    const access = set.runUnlocks[0] ?? null;
    return {
      accessId: access?.id ?? null,
      kind: "SET",
      productId: set.id,
      name: set.name,
      code: set.code,
      imageUrl: getPackAssetUrl(set.code, set.name),
      availabilityStatus: access?.availabilityStatus ?? "LOCKED",
      isAvailableNow: access ? isAvailableNow(access) && !access.rewardOnly : false,
      availableFrom: access?.availableFrom?.toISOString() ?? null,
      availableUntil: access?.availableUntil?.toISOString() ?? null,
      price: access?.packPrice ?? null,
      displaySize: access?.displaySize ?? null,
      rewardOnly: access?.rewardOnly ?? false,
      unlockedAt: access?.unlockedAt.toISOString() ?? null,
      statusReason: access?.statusReason ?? access?.note ?? null,
    };
  });

  const customItems: CampaignPackAccessDto[] = customVersions.map((version) => {
    const access = version.accesses[0] ?? null;
    return {
      accessId: access?.id ?? null,
      kind: "CUSTOM",
      productId: version.id,
      name: `${version.definition.name} · V${version.version}`,
      code: version.definition.code,
      imageUrl: getPackAssetUrl(version.definition.code, version.definition.name),
      availabilityStatus: access?.availabilityStatus ?? "LOCKED",
      isAvailableNow: access ? isAvailableNow(access) && !access.rewardOnly : false,
      availableFrom: access?.availableFrom?.toISOString() ?? null,
      availableUntil: access?.availableUntil?.toISOString() ?? null,
      price: access?.price ?? version.price,
      displaySize: version.displaySize,
      rewardOnly: access?.rewardOnly ?? version.rewardOnly,
      unlockedAt: access?.unlockedAt.toISOString() ?? null,
      statusReason: access?.statusReason ?? null,
    };
  });

  return {
    runId: options.runId,
    viewerRole: membership.role,
    items: [...setItems, ...customItems],
  };
}

export async function updateCampaignPackAccess(
  prisma: PrismaClient,
  options: {
    runId: string;
    viewerId: string;
    input: UpdateCampaignPackAccessRequest;
  },
) {
  await requireRunMembership(prisma, {
    runId: options.runId,
    userId: options.viewerId,
    organizerOnly: true,
  });

  const availableFrom = options.input.availableFrom
    ? new Date(options.input.availableFrom)
    : null;
  const availableUntil = options.input.availableUntil
    ? new Date(options.input.availableUntil)
    : null;

  await prisma.$transaction(async (tx) => {
    let productName: string;

    if (options.input.kind === "SET") {
      const set = await tx.cardSet.findFirst({
        where: {
          id: options.input.productId,
          isOpenable: true,
          region: { not: "CUSTOM" },
        },
      });
      if (!set) {
        throw new DomainError({
          code: "campaign_pack_not_found",
          message: "Dieses Pack wurde nicht gefunden.",
          status: 404,
        });
      }
      productName = set.name;
      await tx.runSetUnlock.upsert({
        where: {
          runId_setId: { runId: options.runId, setId: set.id },
        },
        create: {
          runId: options.runId,
          setId: set.id,
          packPrice: options.input.price,
          displaySize: options.input.displaySize,
          rewardOnly: options.input.rewardOnly ?? false,
          availabilityStatus: options.input.availabilityStatus,
          availableFrom,
          availableUntil,
          updatedById: options.viewerId,
          statusReason: options.input.reason,
          note: "Manuelle Kampagnensteuerung.",
        },
        update: {
          packPrice: options.input.price,
          displaySize: options.input.displaySize,
          rewardOnly: options.input.rewardOnly,
          availabilityStatus: options.input.availabilityStatus,
          availableFrom,
          availableUntil,
          updatedById: options.viewerId,
          statusReason: options.input.reason,
        },
      });
    } else {
      const version = await tx.customPackVersion.findFirst({
        where: {
          id: options.input.productId,
          status: "PUBLISHED",
          definition: { runId: options.runId },
        },
        include: { definition: true },
      });
      if (!version) {
        throw new DomainError({
          code: "custom_pack_version_not_found",
          message: "Diese veröffentlichte Custom-Pack-Version wurde nicht gefunden.",
          status: 404,
        });
      }
      productName = `${version.definition.name} · V${version.version}`;
      await tx.campaignCustomPackAccess.upsert({
        where: {
          runId_versionId: { runId: options.runId, versionId: version.id },
        },
        create: {
          runId: options.runId,
          versionId: version.id,
          price: options.input.price ?? version.price,
          rewardOnly: options.input.rewardOnly ?? version.rewardOnly,
          availabilityStatus: options.input.availabilityStatus,
          availableFrom,
          availableUntil,
          updatedById: options.viewerId,
          statusReason: options.input.reason,
        },
        update: {
          price: options.input.price,
          rewardOnly: options.input.rewardOnly,
          availabilityStatus: options.input.availabilityStatus,
          availableFrom,
          availableUntil,
          updatedById: options.viewerId,
          statusReason: options.input.reason,
        },
      });
    }

    await tx.historyEvent.create({
      data: {
        runId: options.runId,
        type: "CUSTOM",
        title: `Packzugriff: ${productName}`,
        description: `${options.input.availabilityStatus} · ${options.input.reason} · ${options.viewerId}`,
        eventDate: new Date(),
        isUnlocked: options.input.availabilityStatus !== "LOCKED",
      },
    });
  });

  return listCampaignPackAccess(prisma, options);
}

export { isAvailableNow as isCampaignPackAvailableNow };
