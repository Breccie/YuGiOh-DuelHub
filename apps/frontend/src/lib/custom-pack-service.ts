import { createHash, randomUUID } from "node:crypto";
import { OwnershipSource, Prisma, type CustomPackEra, type PrismaClient } from "@prisma/client";
import type { CreateCustomPackRequest, UpdateCustomPackDraftRequest } from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import { getActiveCampaignRuleVersionId } from "@/lib/campaign-rule-service";
import {
  assertPackAccessAvailable,
  isCampaignPackAvailableNow,
} from "@/lib/campaign-pack-access-service";
import {
  getCustomPackEraPreset,
  normalizeCustomPackRarityOptions,
  toPersistedCustomPackSlot,
} from "@/lib/custom-pack-config";
import { getOrCreateWallet, requireRunMembership } from "@/lib/run-service";

type Db = PrismaClient | Prisma.TransactionClient;

async function withSerializableTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2034";
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Unreachable transaction retry state.");
}

type CustomPackTemplateConfig = {
  definition: {
    name: string;
    code: string;
    description: string | null;
    era: CustomPackEra;
  };
  version: {
    packSize: number;
    displaySize: number;
    price: number;
    rewardOnly: boolean;
    slotConfig: Prisma.JsonValue;
    poolEntries: Array<{
      cardId: string;
      setCardId: string | null;
      rarity: string;
      weight: number;
    }>;
    slots: Array<{
      slotIndex: number;
      count: number;
      allowedRarities: string[];
      weight: number;
      rarityWeights?: Array<{ rarity: string; weight: number }>;
    }>;
  };
};

function assertDraft(status: string) {
  if (status !== "DRAFT") {
    throw new DomainError({ code: "custom_pack_immutable", message: "Veröffentlichte Packversionen sind unveränderlich.", status: 409 });
  }
}

export function validatePackDraft(input: UpdateCustomPackDraftRequest, packSize?: number) {
  if (input.poolEntries.length === 0) {
    throw new DomainError({ code: "custom_pack_empty_pool", message: "Der Kartenpool darf nicht leer sein.", status: 400 });
  }
  const poolRarities = new Set(input.poolEntries.map((entry) => entry.rarity));
  const reachableRarities = new Set(input.slots.flatMap((slot) =>
    normalizeCustomPackRarityOptions(slot).map((option) => option.rarity),
  ));
  const emptyRarity = [...reachableRarities].find((rarity) => !poolRarities.has(rarity));
  if (emptyRarity) {
    throw new DomainError({ code: "custom_pack_empty_rarity", message: `Für ${emptyRarity} ist kein Kartenpool definiert.`, status: 400 });
  }
  const unreachable = [...poolRarities].find((rarity) => !reachableRarities.has(rarity));
  if (unreachable) {
    throw new DomainError({ code: "custom_pack_unreachable_card", message: `${unreachable}-Karten sind über keinen Slot erreichbar.`, status: 400 });
  }
  const totalCards = input.slots.reduce((sum, slot) => sum + slot.count, 0);
  if (packSize !== undefined && totalCards !== packSize) {
    throw new DomainError({ code: "custom_pack_size_mismatch", message: `Die Slotkonfiguration erzeugt ${totalCards} statt ${packSize} Karten.`, status: 400 });
  }
}

function hashSeed(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

export function createDeterministicRandom(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T extends { weight: number }>(items: T[], random: () => number) {
  if (items.length === 0) {
    throw new DomainError({
      code: "custom_pack_empty_runtime_pool",
      message: "Für einen Pack-Slot ist kein gültiger Kartenpool verfügbar.",
      status: 409,
    });
  }
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

function pickSlotRarity(
  rarityOptions: Array<{ rarity: string; weight: number }>,
  random: () => number,
) {
  return weightedPick(rarityOptions, random).rarity;
}

export async function listCustomPacks(prisma: PrismaClient, viewerId: string, runId: string) {
  const membership = await requireRunMembership(prisma, { runId, userId: viewerId });
  const isOrganizer = membership.role === "OWNER" || membership.role === "ORGANIZER";
  const packs = await prisma.customPackDefinition.findMany({
    where: { runId },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { version: "desc" },
        include: {
          poolEntries: { include: { card: { select: { name: true, externalCardId: true } } } },
          slots: true,
          accesses: true,
        },
      },
    },
  });
  if (isOrganizer) return packs;

  return packs
    .map((pack) => ({
      ...pack,
      versions: pack.versions
        .filter((version) =>
          version.status === "PUBLISHED"
            && version.accesses.some((access) =>
              access.runId === runId
              && !access.rewardOnly
              && isCampaignPackAvailableNow(access),
            ),
        )
        .map((version) => ({
          ...version,
          poolEntries: [],
          slots: [],
          accesses: version.accesses.filter((access) => access.runId === runId),
        })),
    }))
    .filter((pack) => pack.versions.length > 0);
}

export async function createCustomPack(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  input: CreateCustomPackRequest,
) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const slots = getCustomPackEraPreset(input.era).map(toPersistedCustomPackSlot);
  const packSize = input.era === "PROMO_CUSTOM" && input.packSize === 9 ? 1 : input.packSize;
  return prisma.customPackDefinition.create({
    data: {
      runId,
      createdById: viewerId,
      name: input.name,
      code: input.code.toUpperCase(),
      description: input.description ?? null,
      era: input.era,
      versions: {
        create: {
          version: 1,
          packSize,
          displaySize: input.displaySize,
          price: input.price,
          slotConfig: { era: input.era, editable: true },
          slots: {
            create: slots.map((slot) => ({
              slotIndex: slot.slotIndex,
              count: slot.count,
              allowedRarities: slot.allowedRarities,
              weight: slot.weight,
              rarityWeights: slot.rarityOptions,
            })),
          },
        },
      },
    },
    include: { versions: { include: { poolEntries: true, slots: true } } },
  });
}

export async function updateCustomPackDraft(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  versionId: string,
  input: UpdateCustomPackDraftRequest,
) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  return withSerializableTransaction(prisma, async (tx) => {
    const version = await tx.customPackVersion.findFirst({
      where: { id: versionId, definition: { runId } },
      include: { definition: true },
    });
    if (!version) {
      throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
    }
    assertDraft(version.status);
    const nextPackSize = input.packSize ?? version.packSize;
    validatePackDraft(input, nextPackSize);

    const cardIds = [...new Set(input.poolEntries.map((entry) => entry.cardId))];
    const cards = await tx.card.count({ where: { id: { in: cardIds } } });
    if (cards !== cardIds.length) {
      throw new DomainError({ code: "custom_pack_unknown_card", message: "Mindestens eine Karte existiert nicht.", status: 400 });
    }
    const requestedSetCards = input.poolEntries.filter((entry) => entry.setCardId);
    if (requestedSetCards.length > 0) {
      const setCards = await tx.setCard.findMany({
        where: { id: { in: requestedSetCards.map((entry) => entry.setCardId!) } },
        select: { id: true, cardId: true },
      });
      const validPairs = new Set(setCards.map((entry) => `${entry.id}:${entry.cardId}`));
      if (requestedSetCards.some((entry) => !validPairs.has(`${entry.setCardId}:${entry.cardId}`))) {
        throw new DomainError({ code: "custom_pack_printing_mismatch", message: "Mindestens eine Druckversion gehört nicht zur gewählten Karte.", status: 400 });
      }
    }

    await tx.customPackCardPoolEntry.deleteMany({ where: { versionId } });
    await tx.customPackSlot.deleteMany({ where: { versionId } });
    await tx.customPackCardPoolEntry.createMany({
      data: input.poolEntries.map((entry) => ({
        versionId,
        cardId: entry.cardId,
        setCardId: entry.setCardId ?? null,
        rarity: entry.rarity,
        weight: entry.weight,
      })),
    });
    await tx.customPackSlot.createMany({
      data: input.slots.map((inputSlot) => {
        const slot = toPersistedCustomPackSlot({
          ...inputSlot,
          rarityOptions: normalizeCustomPackRarityOptions(inputSlot),
        });
        return {
          versionId,
          slotIndex: slot.slotIndex,
          count: slot.count,
          allowedRarities: slot.allowedRarities,
          weight: slot.weight,
          rarityWeights: slot.rarityOptions,
        };
      }),
    });
    await tx.customPackVersion.update({
      where: { id: versionId },
      data: {
        packSize: nextPackSize,
        displaySize: input.displaySize ?? version.displaySize,
        price: input.price ?? version.price,
      },
    });
    return tx.customPackVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { definition: true, poolEntries: { include: { card: true } }, slots: true },
    });
  });
}

export async function publishCustomPackVersion(prisma: PrismaClient, viewerId: string, runId: string, versionId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  return withSerializableTransaction(prisma, async (tx) => {
    const version = await tx.customPackVersion.findFirst({
      where: { id: versionId, definition: { runId } },
      include: { definition: true, poolEntries: true, slots: true },
    });
    if (!version) {
      throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
    }
    assertDraft(version.status);
    validatePackDraft({
      poolEntries: version.poolEntries.map((entry) => ({ cardId: entry.cardId, setCardId: entry.setCardId, rarity: entry.rarity, weight: entry.weight })),
      slots: version.slots.map((slot) => ({
        slotIndex: slot.slotIndex,
        count: slot.count,
        allowedRarities: slot.allowedRarities as string[],
        weight: slot.weight,
        rarityOptions: normalizeCustomPackRarityOptions(slot),
      })),
    }, version.packSize);

    const generatedCode = `CUST-${version.definitionId.slice(-8)}-V${version.version}`.toUpperCase();
    const generatedSet = await tx.cardSet.create({
      data: {
        code: generatedCode,
        name: `${version.definition.name} v${version.version}`,
        releaseDate: new Date(),
        region: "CUSTOM",
        productType: "SPECIAL",
        isOpenable: false,
        packSize: version.packSize,
        notes: `Unveränderlicher Kartenbestand für CustomPackVersion:${version.id}`,
      },
    });
    const generatedPrintings = version.poolEntries.map((entry, index) => {
      const collectorNumber = String(index + 1).padStart(3, "0");
      return {
        entry,
        collectorNumber,
        setCode: `${generatedCode}-${collectorNumber}`,
      };
    });
    await tx.setCard.createMany({
      data: generatedPrintings.map(({ entry, collectorNumber, setCode }) => ({
        setId: generatedSet.id,
        cardId: entry.cardId,
        setCode,
        rarity: entry.rarity,
        collectorNumber,
        pullWeight: entry.weight,
      })),
    });
    const createdPrintings = await tx.setCard.findMany({
      where: { setId: generatedSet.id },
      select: { id: true, setCode: true },
    });
    const printingIdByCode = new Map(
      createdPrintings.map((printing) => [printing.setCode, printing.id]),
    );
    await tx.customPackCardPoolEntry.deleteMany({ where: { versionId } });
    await tx.customPackCardPoolEntry.createMany({
      data: generatedPrintings.map(({ entry, setCode }) => ({
        versionId,
        cardId: entry.cardId,
        setCardId: printingIdByCode.get(setCode)!,
        rarity: entry.rarity,
        weight: entry.weight,
      })),
    });
    const published = await tx.customPackVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: new Date(), generatedSetId: generatedSet.id },
      include: { definition: true, poolEntries: { include: { card: true } }, slots: true },
    });
    await tx.customPackDefinition.update({ where: { id: version.definitionId }, data: { status: "PUBLISHED" } });
    return published;
  });
}

async function findExistingCustomPackOpening(
  db: Db,
  options: {
    runId: string;
    viewerId: string;
    versionId: string;
    idempotencyKey: string;
  },
) {
  const batch = await db.packOpeningBatch.findUnique({
    where: {
      runId_userId_idempotencyKey: {
        runId: options.runId,
        userId: options.viewerId,
        idempotencyKey: options.idempotencyKey,
      },
    },
    include: {
      openings: {
        orderBy: { openedAt: "asc" },
        include: { pulls: { orderBy: [{ slotIndex: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!batch) return null;

  const opening = batch.openings[0];
  if (!opening || opening.customPackVersionId !== options.versionId) {
    throw new DomainError({
      code: "custom_pack_idempotency_conflict",
      message: "Dieser Kauf-Schlüssel wurde bereits für eine andere Packöffnung verwendet.",
      status: 409,
    });
  }

  return {
    id: opening.id,
    versionId: options.versionId,
    seed: opening.randomSeed ?? "",
    auditHash: opening.auditHash ?? "",
    price: batch.totalCost,
    pulls: opening.pulls.map((pull) => ({
      cardId: pull.cardId,
      setCardId: pull.setCardId,
      rarity: pull.rarity ?? "Unknown",
      slotIndex: pull.slotIndex,
    })),
  };
}

export async function openCustomPackVersion(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  versionId: string,
  options: { idempotencyKey: string },
) {
  await requireRunMembership(prisma, { runId, userId: viewerId });
  const idempotencyKey = options.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new DomainError({
      code: "idempotency_key_required",
      message: "Für das Öffnen eines Custom Packs ist ein Idempotency-Key erforderlich.",
      status: 400,
    });
  }
  const seed = randomUUID();

  try {
    return await withSerializableTransaction(prisma, async (tx) => {
      const existing = await findExistingCustomPackOpening(tx, {
        runId,
        viewerId,
        versionId,
        idempotencyKey,
      });
      if (existing) return existing;

      const access = await tx.campaignCustomPackAccess.findUnique({
        where: { runId_versionId: { runId, versionId } },
        include: {
          version: {
            include: { definition: true, poolEntries: true, slots: true },
          },
        },
      });
      const version = access?.version;
      if (!access || !version || version.status !== "PUBLISHED" || !version.generatedSetId) {
        throw new DomainError({ code: "custom_pack_unavailable", message: "Diese Packversion ist in der Kampagne nicht freigeschaltet.", status: 409 });
      }
      if (version.definition.runId !== runId) {
        throw new DomainError({ code: "custom_pack_cross_campaign", message: "Diese Packversion gehört nicht zu dieser Kampagne.", status: 409 });
      }
      assertPackAccessAvailable({
        ...access,
        productName: version.definition.name,
      });
      if (access.rewardOnly) {
        throw new DomainError({ code: "custom_pack_reward_only", message: "Dieses Pack ist nur als Belohnung erhältlich.", status: 409 });
      }
      const price = access.price ?? version.price;
      const ruleVersionId = await getActiveCampaignRuleVersionId(tx, runId);
      const wallet = await getOrCreateWallet(tx, { runId, userId: viewerId });
      const random = createDeterministicRandom(seed);
      const poolsByRarity = new Map<string, typeof version.poolEntries>();
      for (const entry of version.poolEntries) {
        if (!entry.setCardId) continue;
        const pool = poolsByRarity.get(entry.rarity) ?? [];
        pool.push(entry);
        poolsByRarity.set(entry.rarity, pool);
      }
      const pulls: Array<{ cardId: string; setCardId: string; rarity: string; slotIndex: number }> = [];
      for (const slot of [...version.slots].sort((a, b) => a.slotIndex - b.slotIndex)) {
        for (let copy = 0; copy < slot.count; copy += 1) {
          const rarity = pickSlotRarity(normalizeCustomPackRarityOptions(slot), random);
          const selected = weightedPick(poolsByRarity.get(rarity) ?? [], random);
          pulls.push({
            cardId: selected.cardId,
            setCardId: selected.setCardId!,
            rarity,
            slotIndex: slot.slotIndex,
          });
        }
      }
      const debit = await tx.creditWallet.updateMany({
        where: { id: wallet.id, balance: { gte: price } },
        data: { balance: { decrement: price } },
      });
      if (debit.count !== 1) {
        const currentWallet = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        throw new DomainError({
          code: "insufficient_credits",
          message: "Nicht genug Credits für diesen Kauf.",
          status: 409,
          details: { balance: currentWallet.balance, cost: price },
        });
      }
      const updatedWallet = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const balanceAfter = updatedWallet.balance;
      const auditHash = createHash("sha256")
        .update(JSON.stringify({ runId, viewerId, versionId, ruleVersionId, price, seed, pulls }))
        .digest("hex");
      const batch = await tx.packOpeningBatch.create({
        data: {
          runId,
          userId: viewerId,
          setId: version.generatedSetId,
          ruleVersionId,
          type: "SINGLE_PACK",
          quantity: 1,
          totalCost: price,
          idempotencyKey,
        },
      });
      const opening = await tx.packOpening.create({
        data: {
          runId,
          userId: viewerId,
          setId: version.generatedSetId,
          batchId: batch.id,
          ruleVersionId,
          customPackVersionId: version.id,
          randomSeed: seed,
          auditHash,
          notes: `CustomPackVersion:${version.id}`,
        },
      });
      await tx.packPull.createMany({
        data: pulls.map((pull) => ({ ...pull, openingId: opening.id })),
      });
      await tx.collectionEntry.createMany({
        data: pulls.map((pull) => ({
          userId: viewerId,
          runId,
          cardId: pull.cardId,
          setCardId: pull.setCardId,
          source: OwnershipSource.PACK_OPENING,
          sourceReferenceId: opening.id,
        })),
      });
      await tx.creditLedgerEntry.create({
        data: {
          runId,
          walletId: wallet.id,
          userId: viewerId,
          amount: -price,
          balanceAfter,
          source: "PACK_PURCHASE",
          referenceType: "CustomPackVersion",
          referenceId: version.id,
          note: `Custom Pack geöffnet: ${version.definition.name} v${version.version}`,
        },
      });
      return {
        id: opening.id,
        versionId: version.id,
        seed,
        auditHash,
        price,
        pulls,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findExistingCustomPackOpening(prisma, {
        runId,
        viewerId,
        versionId,
        idempotencyKey,
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function createNextCustomPackDraft(prisma: PrismaClient, viewerId: string, runId: string, versionId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  return withSerializableTransaction(prisma, async (tx) => {
    const source = await tx.customPackVersion.findFirst({
      where: { id: versionId, definition: { runId } },
      include: { poolEntries: true, slots: true },
    });
    if (!source) throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
    const latest = await tx.customPackVersion.aggregate({ where: { definitionId: source.definitionId }, _max: { version: true } });
    return tx.customPackVersion.create({
      data: {
        definitionId: source.definitionId,
        version: (latest._max.version ?? 0) + 1,
        packSize: source.packSize,
        displaySize: source.displaySize,
        price: source.price,
        rewardOnly: source.rewardOnly,
        slotConfig: source.slotConfig as Prisma.InputJsonValue,
        poolEntries: { create: source.poolEntries.map((entry) => ({ cardId: entry.cardId, setCardId: entry.setCardId, rarity: entry.rarity, weight: entry.weight })) },
        slots: {
          create: source.slots.map((slot) => ({
            slotIndex: slot.slotIndex,
            count: slot.count,
            allowedRarities: slot.allowedRarities as Prisma.InputJsonValue,
            weight: slot.weight,
            rarityWeights: normalizeCustomPackRarityOptions(slot) as Prisma.InputJsonValue,
          })),
        },
      },
      include: { poolEntries: true, slots: true },
    });
  });
}

export async function listCustomPackTemplates(prisma: PrismaClient, viewerId: string) {
  return prisma.customPackTemplate.findMany({
    where: { createdById: viewerId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createCustomPackTemplate(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  definitionId: string,
  name?: string,
) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const definition = await prisma.customPackDefinition.findFirst({
    where: { id: definitionId, runId },
    include: {
      versions: {
        orderBy: [{ status: "desc" }, { version: "desc" }],
        take: 1,
        include: { poolEntries: true, slots: true },
      },
    },
  });
  const version = definition?.versions[0];
  if (!definition || !version) {
    throw new DomainError({ code: "custom_pack_not_found", message: "Custom Pack nicht gefunden.", status: 404 });
  }
  const config: CustomPackTemplateConfig = {
    definition: {
      name: definition.name,
      code: definition.code,
      description: definition.description,
      era: definition.era,
    },
    version: {
      packSize: version.packSize,
      displaySize: version.displaySize,
      price: version.price,
      rewardOnly: version.rewardOnly,
      slotConfig: version.slotConfig,
      poolEntries: version.poolEntries.map((entry) => ({
        cardId: entry.cardId,
        setCardId: entry.setCardId,
        rarity: entry.rarity,
        weight: entry.weight,
      })),
      slots: version.slots.map((slot) => ({
        slotIndex: slot.slotIndex,
        count: slot.count,
        allowedRarities: slot.allowedRarities as string[],
        weight: slot.weight,
        rarityWeights: normalizeCustomPackRarityOptions(slot),
      })),
    },
  };
  return prisma.customPackTemplate.create({
    data: {
      createdById: viewerId,
      sourceDefinitionId: definition.id,
      name: name?.trim() || definition.name,
      era: definition.era,
      config: config as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function copyCustomPackTemplateToRun(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  templateId: string,
  overrides: { name?: string; code?: string } = {},
) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const template = await prisma.customPackTemplate.findFirst({
    where: { id: templateId, createdById: viewerId },
  });
  if (!template) {
    throw new DomainError({ code: "custom_pack_template_not_found", message: "Private Packvorlage nicht gefunden.", status: 404 });
  }
  const config = template.config as unknown as CustomPackTemplateConfig;
  if (!config?.definition || !config?.version) {
    throw new DomainError({ code: "custom_pack_template_invalid", message: "Die Packvorlage ist beschädigt.", status: 409 });
  }
  const code = (overrides.code?.trim() || `${config.definition.code}-${template.id.slice(-5)}`).toUpperCase();
  return prisma.customPackDefinition.create({
    data: {
      runId,
      createdById: viewerId,
      name: overrides.name?.trim() || config.definition.name,
      code,
      description: config.definition.description,
      era: config.definition.era,
      versions: {
        create: {
          version: 1,
          packSize: config.version.packSize,
          displaySize: config.version.displaySize,
          price: config.version.price,
          rewardOnly: config.version.rewardOnly,
          slotConfig: config.version.slotConfig as Prisma.InputJsonValue,
          poolEntries: { create: config.version.poolEntries },
          slots: {
            create: config.version.slots.map((slot) => ({
              slotIndex: slot.slotIndex,
              count: slot.count,
              allowedRarities: slot.allowedRarities as Prisma.InputJsonValue,
              weight: slot.weight,
              rarityWeights: (slot.rarityWeights
                ?? normalizeCustomPackRarityOptions(slot)) as Prisma.InputJsonValue,
            })),
          },
        },
      },
    },
    include: { versions: { include: { poolEntries: true, slots: true } } },
  });
}

export async function simulateCustomPackVersion(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  versionId: string,
  options: { iterations: number; seed: string },
) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const version = await prisma.customPackVersion.findFirst({
    where: { id: versionId, definition: { runId } },
    include: { poolEntries: { include: { card: true } }, slots: true, definition: true },
  });
  if (!version) throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
  const input = {
    poolEntries: version.poolEntries.map((entry) => ({ cardId: entry.cardId, setCardId: entry.setCardId, rarity: entry.rarity, weight: entry.weight })),
    slots: version.slots.map((slot) => ({
      slotIndex: slot.slotIndex,
      count: slot.count,
      allowedRarities: slot.allowedRarities as string[],
      weight: slot.weight,
      rarityOptions: normalizeCustomPackRarityOptions(slot),
    })),
  };
  validatePackDraft(input, version.packSize);
  const random = createDeterministicRandom(options.seed);
  const rarityCounts = new Map<string, number>();
  const cardCounts = new Map<string, { cardId: string; name: string; count: number }>();
  const poolsByRarity = new Map<string, typeof version.poolEntries>();
  for (const entry of version.poolEntries) {
    const pool = poolsByRarity.get(entry.rarity) ?? [];
    pool.push(entry);
    poolsByRarity.set(entry.rarity, pool);
  }
  const orderedSlots = [...input.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    for (const slot of orderedSlots) {
      for (let copy = 0; copy < slot.count; copy += 1) {
        const rarity = pickSlotRarity(normalizeCustomPackRarityOptions(slot), random);
        const selected = weightedPick(poolsByRarity.get(rarity) ?? [], random);
        rarityCounts.set(rarity, (rarityCounts.get(rarity) ?? 0) + 1);
        const current = cardCounts.get(selected.cardId) ?? { cardId: selected.cardId, name: selected.card.name, count: 0 };
        current.count += 1;
        cardCounts.set(selected.cardId, current);
      }
    }
  }
  const totalCards = options.iterations * version.packSize;
  return {
    versionId,
    iterations: options.iterations,
    seed: options.seed,
    rarityDistribution: [...rarityCounts].map(([rarity, count]) => ({ rarity, count, probability: count / totalCards })),
    cardDistribution: [...cardCounts.values()].sort((a, b) => b.count - a.count).map((item) => ({ ...item, probability: item.count / totalCards })),
  };
}
