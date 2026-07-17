import { createHash, randomUUID } from "node:crypto";
import { CustomPackEra, OwnershipSource, Prisma, type PrismaClient } from "@prisma/client";
import type { CreateCustomPackRequest, UpdateCustomPackDraftRequest } from "@ygo/contracts";
import { applyLedgerAmount, assertSufficientCredits, DomainError } from "@ygo/domain";
import { getActiveCampaignRuleVersionId } from "@/lib/campaign-rule-service";
import { getOrCreateWallet, requireRunMembership } from "@/lib/run-service";

const ERA_SLOTS: Record<CustomPackEra, Array<{ slotIndex: number; count: number; allowedRarities: string[]; weight: number }>> = {
  EARLY_TCG: [
    { slotIndex: 0, count: 1, allowedRarities: ["Rare", "Super Rare", "Ultra Rare"], weight: 1 },
    { slotIndex: 1, count: 8, allowedRarities: ["Common"], weight: 1 },
  ],
  GX_5DS: [
    { slotIndex: 0, count: 1, allowedRarities: ["Rare", "Super Rare", "Ultra Rare", "Secret Rare"], weight: 1 },
    { slotIndex: 1, count: 8, allowedRarities: ["Common"], weight: 1 },
  ],
  MODERN_CORE: [
    { slotIndex: 0, count: 1, allowedRarities: ["Super Rare", "Ultra Rare", "Secret Rare"], weight: 1 },
    { slotIndex: 1, count: 7, allowedRarities: ["Common"], weight: 1 },
    { slotIndex: 2, count: 1, allowedRarities: ["Common", "Rare", "Super Rare", "Ultra Rare"], weight: 1 },
  ],
  PROMO_CUSTOM: [
    { slotIndex: 0, count: 1, allowedRarities: ["Promo"], weight: 1 },
  ],
};

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
  const reachableRarities = new Set(input.slots.flatMap((slot) => slot.allowedRarities));
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
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

export async function listCustomPacks(prisma: PrismaClient, viewerId: string, runId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId });
  return prisma.customPackDefinition.findMany({
    where: { runId },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { version: "desc" }, include: { poolEntries: true, slots: true } } },
  });
}

export async function createCustomPack(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  input: CreateCustomPackRequest,
) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const slots = ERA_SLOTS[input.era].map((slot) => ({ ...slot, allowedRarities: slot.allowedRarities }));
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
          slots: { create: slots.map((slot) => ({ ...slot, allowedRarities: slot.allowedRarities })) },
        },
      },
    },
    include: { versions: { include: { poolEntries: true, slots: true } } },
  });
}

async function requireDraftVersion(prisma: PrismaClient, viewerId: string, runId: string, versionId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const version = await prisma.customPackVersion.findFirst({
    where: { id: versionId, definition: { runId } },
    include: { definition: true, poolEntries: true, slots: true },
  });
  if (!version) throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
  assertDraft(version.status);
  return version;
}

export async function updateCustomPackDraft(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  versionId: string,
  input: UpdateCustomPackDraftRequest,
) {
  const version = await requireDraftVersion(prisma, viewerId, runId, versionId);
  validatePackDraft(input, version.packSize);

  const cardIds = [...new Set(input.poolEntries.map((entry) => entry.cardId))];
  const cards = await prisma.card.count({ where: { id: { in: cardIds } } });
  if (cards !== cardIds.length) {
    throw new DomainError({ code: "custom_pack_unknown_card", message: "Mindestens eine Karte existiert nicht.", status: 400 });
  }
  const requestedSetCards = input.poolEntries.filter((entry) => entry.setCardId);
  if (requestedSetCards.length > 0) {
    const setCards = await prisma.setCard.findMany({
      where: { id: { in: requestedSetCards.map((entry) => entry.setCardId!) } },
      select: { id: true, cardId: true },
    });
    const validPairs = new Set(setCards.map((entry) => `${entry.id}:${entry.cardId}`));
    if (requestedSetCards.some((entry) => !validPairs.has(`${entry.setCardId}:${entry.cardId}`))) {
      throw new DomainError({ code: "custom_pack_printing_mismatch", message: "Mindestens eine Druckversion gehört nicht zur gewählten Karte.", status: 400 });
    }
  }

  return prisma.$transaction(async (tx) => {
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
      data: input.slots.map((slot) => ({
        versionId,
        slotIndex: slot.slotIndex,
        count: slot.count,
        allowedRarities: slot.allowedRarities,
        weight: slot.weight,
      })),
    });
    return tx.customPackVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { definition: true, poolEntries: { include: { card: true } }, slots: true },
    });
  });
}

export async function publishCustomPackVersion(prisma: PrismaClient, viewerId: string, runId: string, versionId: string) {
  const version = await requireDraftVersion(prisma, viewerId, runId, versionId);
  validatePackDraft({
    poolEntries: version.poolEntries.map((entry) => ({ cardId: entry.cardId, setCardId: entry.setCardId, rarity: entry.rarity, weight: entry.weight })),
    slots: version.slots.map((slot) => ({ slotIndex: slot.slotIndex, count: slot.count, allowedRarities: slot.allowedRarities as string[], weight: slot.weight })),
  }, version.packSize);
  return prisma.$transaction(async (tx) => {
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
    for (const [index, entry] of version.poolEntries.entries()) {
      const setCard = await tx.setCard.create({
        data: {
          setId: generatedSet.id,
          cardId: entry.cardId,
          setCode: `${generatedCode}-${String(index + 1).padStart(3, "0")}`,
          rarity: entry.rarity,
          collectorNumber: String(index + 1).padStart(3, "0"),
          pullWeight: entry.weight,
        },
      });
      await tx.customPackCardPoolEntry.update({
        where: { id: entry.id },
        data: { setCardId: setCard.id },
      });
    }
    const published = await tx.customPackVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: new Date(), generatedSetId: generatedSet.id },
      include: { definition: true, poolEntries: { include: { card: true } }, slots: true },
    });
    await tx.customPackDefinition.update({ where: { id: version.definitionId }, data: { status: "PUBLISHED" } });
    await tx.campaignCustomPackAccess.upsert({
      where: { runId_versionId: { runId, versionId } },
      create: { runId, versionId, price: version.price, rewardOnly: version.rewardOnly },
      update: { price: version.price, rewardOnly: version.rewardOnly },
    });
    return published;
  });
}

export async function openCustomPackVersion(
  prisma: PrismaClient,
  viewerId: string,
  runId: string,
  versionId: string,
  seed: string = randomUUID(),
) {
  await requireRunMembership(prisma, { runId, userId: viewerId });
  return prisma.$transaction(async (tx) => {
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
    if (access.rewardOnly) {
      throw new DomainError({ code: "custom_pack_reward_only", message: "Dieses Pack ist nur als Belohnung erhältlich.", status: 409 });
    }
    const price = access.price ?? version.price;
    const wallet = await getOrCreateWallet(tx, { runId, userId: viewerId });
    assertSufficientCredits({ balance: wallet.balance, cost: price });
    const balanceAfter = applyLedgerAmount({ balance: wallet.balance, amount: -price });
    const ruleVersionId = await getActiveCampaignRuleVersionId(tx, runId);
    const random = createDeterministicRandom(seed);
    const pulls: Array<{ cardId: string; setCardId: string; rarity: string; slotIndex: number }> = [];
    for (const slot of [...version.slots].sort((a, b) => a.slotIndex - b.slotIndex)) {
      const allowedRarities = slot.allowedRarities as string[];
      for (let copy = 0; copy < slot.count; copy += 1) {
        const rarity = allowedRarities[Math.floor(random() * allowedRarities.length)]!;
        const candidates = version.poolEntries.filter((entry) => entry.rarity === rarity && entry.setCardId);
        const selected = weightedPick(candidates, random);
        pulls.push({
          cardId: selected.cardId,
          setCardId: selected.setCardId!,
          rarity,
          slotIndex: slot.slotIndex,
        });
      }
    }
    const auditHash = createHash("sha256").update(`${runId}:${viewerId}:${versionId}:${seed}`).digest("hex");
    const batch = await tx.packOpeningBatch.create({
      data: {
        runId,
        userId: viewerId,
        setId: version.generatedSetId,
        ruleVersionId,
        type: "SINGLE_PACK",
        quantity: 1,
        totalCost: price,
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
    await tx.creditWallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
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
}

export async function createNextCustomPackDraft(prisma: PrismaClient, viewerId: string, runId: string, versionId: string) {
  await requireRunMembership(prisma, { runId, userId: viewerId, organizerOnly: true });
  const source = await prisma.customPackVersion.findFirst({
    where: { id: versionId, definition: { runId } },
    include: { poolEntries: true, slots: true },
  });
  if (!source) throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
  const latest = await prisma.customPackVersion.aggregate({ where: { definitionId: source.definitionId }, _max: { version: true } });
  return prisma.customPackVersion.create({
    data: {
      definitionId: source.definitionId,
      version: (latest._max.version ?? 0) + 1,
      packSize: source.packSize,
      displaySize: source.displaySize,
      price: source.price,
      rewardOnly: source.rewardOnly,
      slotConfig: source.slotConfig as Prisma.InputJsonValue,
      poolEntries: { create: source.poolEntries.map((entry) => ({ cardId: entry.cardId, setCardId: entry.setCardId, rarity: entry.rarity, weight: entry.weight })) },
      slots: { create: source.slots.map((slot) => ({ slotIndex: slot.slotIndex, count: slot.count, allowedRarities: slot.allowedRarities as Prisma.InputJsonValue, weight: slot.weight })) },
    },
    include: { poolEntries: true, slots: true },
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
              ...slot,
              allowedRarities: slot.allowedRarities as Prisma.InputJsonValue,
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
  await requireRunMembership(prisma, { runId, userId: viewerId });
  const version = await prisma.customPackVersion.findFirst({
    where: { id: versionId, definition: { runId } },
    include: { poolEntries: { include: { card: true } }, slots: true, definition: true },
  });
  if (!version) throw new DomainError({ code: "custom_pack_not_found", message: "Packversion nicht gefunden.", status: 404 });
  const input = {
    poolEntries: version.poolEntries.map((entry) => ({ cardId: entry.cardId, setCardId: entry.setCardId, rarity: entry.rarity, weight: entry.weight })),
    slots: version.slots.map((slot) => ({ slotIndex: slot.slotIndex, count: slot.count, allowedRarities: slot.allowedRarities as string[], weight: slot.weight })),
  };
  validatePackDraft(input, version.packSize);
  const random = createDeterministicRandom(options.seed);
  const rarityCounts = new Map<string, number>();
  const cardCounts = new Map<string, { cardId: string; name: string; count: number }>();
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    for (const slot of input.slots.sort((a, b) => a.slotIndex - b.slotIndex)) {
      for (let copy = 0; copy < slot.count; copy += 1) {
        const rarity = slot.allowedRarities[Math.floor(random() * slot.allowedRarities.length)];
        const pool = version.poolEntries.filter((entry) => entry.rarity === rarity);
        const selected = weightedPick(pool, random);
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
