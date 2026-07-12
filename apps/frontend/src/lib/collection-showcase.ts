import {
  CardKind,
  CollectionLayoutMode,
  CollectionSortMode,
  EntryLockState,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  binderCoverCatalog,
  getBinderCoverMeta,
  type BinderCoverKey,
} from "@/lib/collection-showcase-config";
import { getCardAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";
import { binderSlotCount } from "@/lib/binder-open-layout";
import { getActiveRun } from "@/lib/run-service";

type CollectionEntryRecord = Prisma.CollectionEntryGetPayload<{
  include: {
    card: true;
    setCard: {
      include: {
        set: true;
      };
    };
  };
}>;

type BinderSlotRecord = Prisma.CollectionBinderSlotGetPayload<{
  include: {
    collectionEntry: {
      include: {
        card: true;
        setCard: {
          include: {
            set: true;
          };
        };
      };
    };
  };
}>;

type BinderPageRecord = Prisma.CollectionBinderPageGetPayload<{
  include: {
    slots: {
      include: {
        collectionEntry: {
          include: {
            card: true;
            setCard: {
              include: {
                set: true;
              };
            };
          };
        };
      };
      orderBy: {
        slotIndex: "asc";
      };
    };
  };
}>;

type BinderRecord = Prisma.CollectionBinderGetPayload<{
  include: {
    pages: {
      include: {
        slots: {
          include: {
            collectionEntry: {
              include: {
                card: true;
                setCard: {
                  include: {
                    set: true;
                  };
                };
              };
            };
          };
          orderBy: {
            slotIndex: "asc";
          };
        };
      };
      orderBy: {
        pageIndex: "asc";
      };
    };
  };
}>;

type CreateBinderInput = {
  name: string;
  coverKey: BinderCoverKey;
  description?: string | null;
  makeActive?: boolean;
};

type UpdateBinderInput = {
  name?: string;
  coverKey?: BinderCoverKey;
  description?: string | null;
  isActive?: boolean;
};

type CreatePresetInput = {
  name: string;
  binderId?: string | null;
  searchQuery?: string;
  kind?: CardKind | null;
  duplicatesOnly?: boolean;
  layoutMode?: CollectionLayoutMode;
  sortMode?: CollectionSortMode;
  makeActive?: boolean;
};

type UpdatePresetInput = {
  name?: string;
  binderId?: string | null;
  searchQuery?: string;
  kind?: CardKind | null;
  duplicatesOnly?: boolean;
  layoutMode?: CollectionLayoutMode;
  sortMode?: CollectionSortMode;
  isActive?: boolean;
};

export const collectionBinderSlotCount = binderSlotCount;

export type CollectionBinderSlotStatus = "empty" | "filled" | "missing";

export type CollectionBinderSlotDto = {
  id: string;
  slotIndex: number;
  status: CollectionBinderSlotStatus;
  collectionEntryId: string | null;
  entryReferenceId: string | null;
  cardId: string | null;
  cardName: string | null;
  imageUrl: string | null;
  printingLabel: string | null;
  setCode: string | null;
  rarity: string | null;
  kind: CardKind | null;
  lockState: EntryLockState | null;
};

export type CollectionBinderPageDto = {
  id: string;
  pageIndex: number;
  filledSlots: number;
  updatedAt: string;
  slots: CollectionBinderSlotDto[];
};

export type CollectionBinderDto = {
  id: string;
  name: string;
  coverKey: string;
  coverName: string;
  coverImageUrl: string;
  description: string;
  accentColor: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  pages: CollectionBinderPageDto[];
};

export type CollectionPresetDto = {
  id: string;
  binderId: string | null;
  name: string;
  searchQuery: string;
  kind: CardKind | null;
  duplicatesOnly: boolean;
  layoutMode: CollectionLayoutMode;
  sortMode: CollectionSortMode;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BinderEditorPrintingDto = {
  key: string;
  setLabel: string;
  setCode: string | null;
  rarity: string | null;
  copies: number;
  availableForBinder: number;
  reservedCopies: number;
  usedInBinderCopies: number;
  entryIds: string[];
  selectableEntryIds: string[];
};

export type BinderEditorInventoryCardDto = {
  cardId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  kind: CardKind;
  totalCopies: number;
  latestAcquiredAt: string;
  printings: BinderEditorPrintingDto[];
};

export type CollectionBinderEditorSnapshot = {
  viewer: {
    id: string;
    displayName: string;
  };
  binder: CollectionBinderDto;
  inventoryCards: BinderEditorInventoryCardDto[];
};

export type SaveBinderPageSlotInput = {
  slotIndex: number;
  collectionEntryId: string | null;
  entryReferenceId?: string | null;
  cardId?: string | null;
  cardName?: string | null;
  imageUrl?: string | null;
  printingLabel?: string | null;
  setCode?: string | null;
  rarity?: string | null;
};

async function loadViewer(prisma: PrismaClient, viewerId: string) {
  return prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });
}

function requireViewer(viewer: Awaited<ReturnType<typeof loadViewer>>) {
  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  return viewer;
}

function getPrintingLabel(entry: CollectionEntryRecord) {
  if (entry.setCard?.set) {
    return `${entry.setCard.set.code} · ${entry.setCard.set.name}`;
  }

  return "Ohne Set-Zuordnung";
}

function createEmptySlotSeed() {
  return Array.from({ length: collectionBinderSlotCount }, (_, slotIndex) => ({
    slotIndex,
    collectionEntryId: null,
    entryReferenceId: null,
    snapshotCardId: null,
    snapshotCardName: null,
    snapshotImageUrl: null,
    snapshotPrintingLabel: null,
    snapshotSetCode: null,
    snapshotRarity: null,
  }));
}

function createSlotSnapshotFromEntry(entry: CollectionEntryRecord) {
  return {
    entryReferenceId: entry.id,
    snapshotCardId: entry.cardId,
    snapshotCardName: entry.card.name,
    snapshotImageUrl: getCardAssetUrl(entry.card.externalCardId),
    snapshotPrintingLabel: getPrintingLabel(entry),
    snapshotSetCode: entry.setCard?.setCode ?? null,
    snapshotRarity: entry.setCard?.rarity ?? null,
  };
}

async function ensureBinderPages(prisma: PrismaClient, userId: string, runId: string) {
  const binders = await prisma.collectionBinder.findMany({
    where: { userId, runId },
    select: {
      id: true,
      pages: {
        select: {
          id: true,
        },
      },
    },
  });

  const missingPageBinders = binders.filter((binder) => binder.pages.length === 0);

  if (missingPageBinders.length === 0) {
    return;
  }

  await prisma.$transaction(
    missingPageBinders.map((binder) =>
      prisma.collectionBinderPage.create({
        data: {
          binderId: binder.id,
          pageIndex: 0,
          slots: {
            create: createEmptySlotSeed(),
          },
        },
      }),
    ),
  );
}

async function ensureCollectionShowcaseDefaults(prisma: PrismaClient, userId: string, runId: string) {
  const [existingBinders, existingPresets] = await Promise.all([
    prisma.collectionBinder.count({
      where: { userId, runId },
    }),
    prisma.collectionPreset.count({
      where: {
        userId,
        OR: [{ binderId: null }, { binder: { runId } }],
      },
    }),
  ]);

  if (existingBinders === 0) {
    const defaultCover = binderCoverCatalog[0];

    await prisma.collectionBinder.create({
      data: {
        userId,
        runId,
        name: "Kampagnen-Binder",
        coverKey: defaultCover.key,
        description: "Dein Arbeits-Binder für diese Kampagne.",
        accentColor: defaultCover.accentColor,
        isActive: true,
      },
    });
  }

  if (existingPresets === 0) {
    await prisma.collectionPreset.createMany({
      data: [
        {
          userId,
          name: "Vitrine",
          searchQuery: "",
          kind: null,
          duplicatesOnly: false,
          layoutMode: CollectionLayoutMode.BINDER,
          sortMode: CollectionSortMode.MOST_COPIES,
          isActive: true,
        },
        {
          userId,
          name: "Neueste Zugänge",
          searchQuery: "",
          kind: null,
          duplicatesOnly: false,
          layoutMode: CollectionLayoutMode.GRID,
          sortMode: CollectionSortMode.NEWEST_ACQUIRED,
          isActive: false,
        },
        {
          userId,
          name: "Duplikate",
          searchQuery: "",
          kind: null,
          duplicatesOnly: true,
          layoutMode: CollectionLayoutMode.GRID,
          sortMode: CollectionSortMode.MOST_COPIES,
          isActive: false,
        },
      ],
    });
  }

  await ensureBinderPages(prisma, userId, runId);
}

function mapBinderSlot(slot: BinderSlotRecord): CollectionBinderSlotDto {
  if (slot.collectionEntry && slot.collectionEntry.lockState !== EntryLockState.TRADED) {
    return {
      id: slot.id,
      slotIndex: slot.slotIndex,
      status: "filled",
      collectionEntryId: slot.collectionEntryId,
      entryReferenceId: slot.entryReferenceId ?? slot.collectionEntryId,
      cardId: slot.collectionEntry.cardId,
      cardName: slot.collectionEntry.card.name,
      imageUrl:
        getCardAssetUrl(slot.collectionEntry.card.externalCardId) ??
        resolveAppImageUrl(slot.snapshotImageUrl) ??
        null,
      printingLabel: getPrintingLabel(slot.collectionEntry),
      setCode: slot.collectionEntry.setCard?.setCode ?? null,
      rarity: slot.collectionEntry.setCard?.rarity ?? null,
      kind: slot.collectionEntry.card.kind,
      lockState: slot.collectionEntry.lockState,
    };
  }

  const missingCardId = slot.snapshotCardId ?? slot.collectionEntry?.cardId ?? null;
  const missingCardName = slot.snapshotCardName ?? slot.collectionEntry?.card.name ?? null;
  const missingImageUrl =
    resolveAppImageUrl(slot.snapshotImageUrl) ??
    getCardAssetUrl(slot.collectionEntry?.card.externalCardId ?? null) ??
    null;
  const missingPrintingLabel =
    slot.snapshotPrintingLabel ??
    (slot.collectionEntry ? getPrintingLabel(slot.collectionEntry) : null);
  const missingSetCode = slot.snapshotSetCode ?? slot.collectionEntry?.setCard?.setCode ?? null;
  const missingRarity = slot.snapshotRarity ?? slot.collectionEntry?.setCard?.rarity ?? null;

  if (slot.entryReferenceId || missingCardId || missingCardName || missingPrintingLabel) {
    return {
      id: slot.id,
      slotIndex: slot.slotIndex,
      status: "missing",
      collectionEntryId: null,
      entryReferenceId: slot.entryReferenceId ?? slot.collectionEntryId,
      cardId: missingCardId,
      cardName: missingCardName,
      imageUrl: missingImageUrl,
      printingLabel: missingPrintingLabel,
      setCode: missingSetCode,
      rarity: missingRarity,
      kind: slot.collectionEntry?.card.kind ?? null,
      lockState: slot.collectionEntry?.lockState ?? null,
    };
  }

  return {
    id: slot.id,
    slotIndex: slot.slotIndex,
    status: "empty",
    collectionEntryId: null,
    entryReferenceId: null,
    cardId: null,
    cardName: null,
    imageUrl: null,
    printingLabel: null,
    setCode: null,
    rarity: null,
    kind: null,
    lockState: null,
  };
}

function mapBinderPage(page: BinderPageRecord): CollectionBinderPageDto {
  const slots = page.slots.map(mapBinderSlot);

  return {
    id: page.id,
    pageIndex: page.pageIndex,
    filledSlots: slots.filter((slot) => slot.status === "filled").length,
    updatedAt: page.updatedAt.toISOString(),
    slots,
  };
}

function mapBinder(binder: BinderRecord): CollectionBinderDto {
  const cover = getBinderCoverMeta(binder.coverKey);
  const pages = binder.pages.map(mapBinderPage);

  return {
    id: binder.id,
    name: binder.name,
    coverKey: binder.coverKey,
    coverName: cover.name,
    coverImageUrl: cover.imageUrl,
    description: binder.description ?? cover.description,
    accentColor: binder.accentColor ?? cover.accentColor,
    isActive: binder.isActive,
    createdAt: binder.createdAt.toISOString(),
    updatedAt: binder.updatedAt.toISOString(),
    pageCount: pages.length,
    pages,
  };
}

function mapPreset(preset: {
  id: string;
  binderId: string | null;
  name: string;
  searchQuery: string;
  kind: CardKind | null;
  duplicatesOnly: boolean;
  layoutMode: CollectionLayoutMode;
  sortMode: CollectionSortMode;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CollectionPresetDto {
  return {
    id: preset.id,
    binderId: preset.binderId,
    name: preset.name,
    searchQuery: preset.searchQuery,
    kind: preset.kind,
    duplicatesOnly: preset.duplicatesOnly,
    layoutMode: preset.layoutMode,
    sortMode: preset.sortMode,
    isActive: preset.isActive,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
  };
}

async function loadBinderRecords(prisma: PrismaClient, userId: string, runId: string) {
  return prisma.collectionBinder.findMany({
    where: { userId, runId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: {
      pages: {
        orderBy: {
          pageIndex: "asc",
        },
        include: {
          slots: {
            orderBy: {
              slotIndex: "asc",
            },
            include: {
              collectionEntry: {
                include: {
                  card: true,
                  setCard: {
                    include: {
                      set: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

async function loadCollectionEditorInventory(
  prisma: PrismaClient,
  userId: string,
  runId: string,
  binder: BinderRecord,
) {
  const entries = await prisma.collectionEntry.findMany({
    where: {
      userId,
      runId,
      lockState: {
        not: EntryLockState.TRADED,
      },
    },
    orderBy: {
      acquiredAt: "desc",
    },
    include: {
      card: true,
      setCard: {
        include: {
          set: true,
        },
      },
    },
  });

  const usedEntryIds = new Set(
    binder.pages.flatMap((page) =>
      page.slots
        .filter(
          (slot) =>
            slot.collectionEntryId &&
            slot.collectionEntry &&
            slot.collectionEntry.lockState !== EntryLockState.TRADED,
        )
        .map((slot) => slot.collectionEntryId as string),
    ),
  );

  const groupedCards = new Map<
    string,
    {
      cardId: string;
      name: string;
      slug: string;
      imageUrl: string | null;
      kind: CardKind;
      totalCopies: number;
      latestAcquiredAt: string;
      printings: Map<
        string,
        {
          key: string;
          setLabel: string;
          setCode: string | null;
          rarity: string | null;
          copies: number;
          availableForBinder: number;
          reservedCopies: number;
          usedInBinderCopies: number;
          entryIds: string[];
          selectableEntryIds: string[];
        }
      >;
    }
  >();

  for (const entry of entries) {
    const existingCard = groupedCards.get(entry.cardId);

    if (!existingCard) {
      groupedCards.set(entry.cardId, {
        cardId: entry.cardId,
        name: entry.card.name,
        slug: entry.card.slug,
        imageUrl: getCardAssetUrl(entry.card.externalCardId),
        kind: entry.card.kind,
        totalCopies: 0,
        latestAcquiredAt: entry.acquiredAt.toISOString(),
        printings: new Map(),
      });
    }

    const card = groupedCards.get(entry.cardId)!;
    const printingKey = entry.setCard?.id ?? `loose:${entry.source}`;
    const printingLabel = getPrintingLabel(entry);

    card.totalCopies += 1;

    if (entry.acquiredAt.toISOString() > card.latestAcquiredAt) {
      card.latestAcquiredAt = entry.acquiredAt.toISOString();
    }

    const existingPrinting = card.printings.get(printingKey);

    if (!existingPrinting) {
      card.printings.set(printingKey, {
        key: printingKey,
        setLabel: printingLabel,
        setCode: entry.setCard?.setCode ?? null,
        rarity: entry.setCard?.rarity ?? null,
        copies: 0,
        availableForBinder: 0,
        reservedCopies: 0,
        usedInBinderCopies: 0,
        entryIds: [],
        selectableEntryIds: [],
      });
    }

    const printing = card.printings.get(printingKey)!;
    printing.copies += 1;
    printing.entryIds.push(entry.id);

    if (entry.lockState === EntryLockState.RESERVED) {
      printing.reservedCopies += 1;
    }

    if (usedEntryIds.has(entry.id)) {
      printing.usedInBinderCopies += 1;
    }

    if (entry.lockState === EntryLockState.AVAILABLE && !usedEntryIds.has(entry.id)) {
      printing.availableForBinder += 1;
      printing.selectableEntryIds.push(entry.id);
    }
  }

  return [...groupedCards.values()]
    .map((card) => ({
      cardId: card.cardId,
      name: card.name,
      slug: card.slug,
      imageUrl: card.imageUrl,
      kind: card.kind,
      totalCopies: card.totalCopies,
      latestAcquiredAt: card.latestAcquiredAt,
      printings: [...card.printings.values()].sort((left, right) => {
        if (right.availableForBinder !== left.availableForBinder) {
          return right.availableForBinder - left.availableForBinder;
        }

        if (right.copies !== left.copies) {
          return right.copies - left.copies;
        }

        return left.setLabel.localeCompare(right.setLabel, "de");
      }),
    }))
    .sort((left, right) => {
      if (right.totalCopies !== left.totalCopies) {
        return right.totalCopies - left.totalCopies;
      }

      return left.name.localeCompare(right.name, "de");
    });
}

async function requireBinderRecord(
  prisma: PrismaClient,
  userId: string,
  runId: string,
  binderId: string,
) {
  const binder = await prisma.collectionBinder.findFirst({
    where: {
      id: binderId,
      userId,
      runId,
    },
    include: {
      pages: {
        orderBy: {
          pageIndex: "asc",
        },
        include: {
          slots: {
            orderBy: {
              slotIndex: "asc",
            },
            include: {
              collectionEntry: {
                include: {
                  card: true,
                  setCard: {
                    include: {
                      set: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!binder) {
    throw new Error("Binder wurde nicht gefunden.");
  }

  return binder;
}

function validateFullPageSlotInput(slots: SaveBinderPageSlotInput[]) {
  if (slots.length !== collectionBinderSlotCount) {
    throw new Error("Eine Binder-Seite muss genau 18 Slots enthalten.");
  }

  const slotIndexes = new Set(slots.map((slot) => slot.slotIndex));

  if (slotIndexes.size !== collectionBinderSlotCount) {
    throw new Error("Slot-Indizes müssen pro Seite eindeutig sein.");
  }

  for (let slotIndex = 0; slotIndex < collectionBinderSlotCount; slotIndex += 1) {
    if (!slotIndexes.has(slotIndex)) {
      throw new Error("Alle Slot-Indizes von 0 bis 17 müssen enthalten sein.");
    }
  }
}

export async function getCollectionShowcaseSnapshot(prisma: PrismaClient, viewerId: string) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);
  await ensureCollectionShowcaseDefaults(prisma, viewer.id, activeRun.id);

  const [binders, presets] = await Promise.all([
    loadBinderRecords(prisma, viewer.id, activeRun.id),
    prisma.collectionPreset.findMany({
      where: {
        userId: viewer.id,
        OR: [{ binderId: null }, { binder: { runId: activeRun.id } }],
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  return {
    viewer: {
      id: viewer.id,
      displayName: viewer.displayName,
    },
    binders: binders.map(mapBinder),
    presets: presets.map(mapPreset),
  };
}

export async function getCollectionBinderEditorSnapshot(
  prisma: PrismaClient,
  viewerId: string,
  binderId: string,
): Promise<CollectionBinderEditorSnapshot> {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);
  await ensureCollectionShowcaseDefaults(prisma, viewer.id, activeRun.id);

  const binder = await requireBinderRecord(prisma, viewer.id, activeRun.id, binderId);
  const inventoryCards = await loadCollectionEditorInventory(
    prisma,
    viewer.id,
    activeRun.id,
    binder,
  );

  return {
    viewer: {
      id: viewer.id,
      displayName: viewer.displayName,
    },
    binder: mapBinder(binder),
    inventoryCards,
  };
}

export async function createCollectionBinder(
  prisma: PrismaClient,
  viewerId: string,
  input: CreateBinderInput,
) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const cover = getBinderCoverMeta(input.coverKey);
  const activeRun = await getActiveRun(prisma, viewer.id);

  const binder = await prisma.$transaction(async (tx) => {
    if (input.makeActive ?? true) {
      await tx.collectionBinder.updateMany({
        where: { userId: viewer.id, runId: activeRun.id },
        data: { isActive: false },
      });
    }

    return tx.collectionBinder.create({
      data: {
        userId: viewer.id,
        runId: activeRun.id,
        name: input.name.trim(),
        coverKey: input.coverKey,
        description: input.description?.trim() || cover.description,
        accentColor: cover.accentColor,
        isActive: input.makeActive ?? true,
        pages: {
          create: {
            pageIndex: 0,
            slots: {
              create: createEmptySlotSeed(),
            },
          },
        },
      },
      include: {
        pages: {
          orderBy: {
            pageIndex: "asc",
          },
          include: {
            slots: {
              orderBy: {
                slotIndex: "asc",
              },
              include: {
                collectionEntry: {
                  include: {
                    card: true,
                    setCard: {
                      include: {
                        set: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  return mapBinder(binder);
}

export async function updateCollectionBinder(
  prisma: PrismaClient,
  viewerId: string,
  binderId: string,
  input: UpdateBinderInput,
) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);
  const current = await prisma.collectionBinder.findFirst({
    where: {
      id: binderId,
      userId: viewer.id,
      runId: activeRun.id,
    },
  });

  if (!current) {
    throw new Error("Binder wurde nicht gefunden.");
  }

  const cover = getBinderCoverMeta(input.coverKey ?? current.coverKey);

  const binder = await prisma.$transaction(async (tx) => {
    if (input.isActive) {
      await tx.collectionBinder.updateMany({
        where: { userId: viewer.id, runId: activeRun.id },
        data: { isActive: false },
      });
    }

    return tx.collectionBinder.update({
      where: { id: current.id },
      data: {
        name: input.name?.trim() || current.name,
        coverKey: input.coverKey ?? current.coverKey,
        description:
          input.description === undefined
            ? current.description
            : input.description?.trim() || cover.description,
        accentColor: cover.accentColor,
        isActive: input.isActive ?? current.isActive,
      },
      include: {
        pages: {
          orderBy: {
            pageIndex: "asc",
          },
          include: {
            slots: {
              orderBy: {
                slotIndex: "asc",
              },
              include: {
                collectionEntry: {
                  include: {
                    card: true,
                    setCard: {
                      include: {
                        set: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  return mapBinder(binder);
}

export async function createCollectionPreset(
  prisma: PrismaClient,
  viewerId: string,
  input: CreatePresetInput,
) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);

  const preset = await prisma.$transaction(async (tx) => {
    if (input.makeActive ?? true) {
      await tx.collectionPreset.updateMany({
        where: {
          userId: viewer.id,
          OR: [{ binderId: null }, { binder: { runId: activeRun.id } }],
        },
        data: { isActive: false },
      });
    }

    if (input.binderId) {
      const binder = await tx.collectionBinder.findFirst({
        where: {
          id: input.binderId,
          userId: viewer.id,
          runId: activeRun.id,
        },
        select: {
          id: true,
        },
      });

      if (!binder) {
        throw new Error("Binder wurde nicht gefunden.");
      }
    }

    return tx.collectionPreset.create({
      data: {
        userId: viewer.id,
        binderId: input.binderId ?? null,
        name: input.name.trim(),
        searchQuery: input.searchQuery?.trim() ?? "",
        kind: input.kind ?? null,
        duplicatesOnly: input.duplicatesOnly ?? false,
        layoutMode: input.layoutMode ?? CollectionLayoutMode.BINDER,
        sortMode: input.sortMode ?? CollectionSortMode.MOST_COPIES,
        isActive: input.makeActive ?? true,
      },
    });
  });

  return mapPreset(preset);
}

export async function updateCollectionPreset(
  prisma: PrismaClient,
  viewerId: string,
  presetId: string,
  input: UpdatePresetInput,
) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);
  const current = await prisma.collectionPreset.findFirst({
    where: {
      id: presetId,
      userId: viewer.id,
      OR: [{ binderId: null }, { binder: { runId: activeRun.id } }],
    },
  });

  if (!current) {
    throw new Error("Preset wurde nicht gefunden.");
  }

  const preset = await prisma.$transaction(async (tx) => {
    if (input.isActive) {
      await tx.collectionPreset.updateMany({
        where: {
          userId: viewer.id,
          OR: [{ binderId: null }, { binder: { runId: activeRun.id } }],
        },
        data: { isActive: false },
      });
    }

    if (input.binderId) {
      const binder = await tx.collectionBinder.findFirst({
        where: {
          id: input.binderId,
          userId: viewer.id,
          runId: activeRun.id,
        },
        select: {
          id: true,
        },
      });

      if (!binder) {
        throw new Error("Binder wurde nicht gefunden.");
      }
    }

    return tx.collectionPreset.update({
      where: { id: current.id },
      data: {
        name: input.name?.trim() || current.name,
        binderId: input.binderId === undefined ? current.binderId : input.binderId,
        searchQuery: input.searchQuery === undefined ? current.searchQuery : input.searchQuery.trim(),
        kind: input.kind === undefined ? current.kind : input.kind,
        duplicatesOnly:
          input.duplicatesOnly === undefined ? current.duplicatesOnly : input.duplicatesOnly,
        layoutMode: input.layoutMode ?? current.layoutMode,
        sortMode: input.sortMode ?? current.sortMode,
        isActive: input.isActive ?? current.isActive,
      },
    });
  });

  return mapPreset(preset);
}

export async function createCollectionBinderPage(
  prisma: PrismaClient,
  viewerId: string,
  binderId: string,
) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);
  const binder = await prisma.collectionBinder.findFirst({
    where: {
      id: binderId,
      userId: viewer.id,
      runId: activeRun.id,
    },
    include: {
      pages: {
        select: {
          pageIndex: true,
        },
      },
    },
  });

  if (!binder) {
    throw new Error("Binder wurde nicht gefunden.");
  }

  const nextPageIndex =
    binder.pages.length > 0 ? Math.max(...binder.pages.map((page) => page.pageIndex)) + 1 : 0;

  const page = await prisma.collectionBinderPage.create({
    data: {
      binderId: binder.id,
      pageIndex: nextPageIndex,
      slots: {
        create: createEmptySlotSeed(),
      },
    },
    include: {
      slots: {
        orderBy: {
          slotIndex: "asc",
        },
        include: {
          collectionEntry: {
            include: {
              card: true,
              setCard: {
                include: {
                  set: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return mapBinderPage(page);
}

export async function saveCollectionBinderPage(
  prisma: PrismaClient,
  viewerId: string,
  binderId: string,
  pageId: string,
  slots: SaveBinderPageSlotInput[],
) {
  const viewer = requireViewer(await loadViewer(prisma, viewerId));
  const activeRun = await getActiveRun(prisma, viewer.id);
  validateFullPageSlotInput(slots);

  const page = await prisma.collectionBinderPage.findFirst({
    where: {
      id: pageId,
      binderId,
      binder: {
        userId: viewer.id,
        runId: activeRun.id,
      },
    },
    include: {
      slots: {
        select: {
          collectionEntryId: true,
        },
      },
    },
  });

  if (!page) {
    throw new Error("Binder-Seite wurde nicht gefunden.");
  }

  const existingPageEntryIds = new Set(
    page.slots
      .map((slot) => slot.collectionEntryId)
      .filter((collectionEntryId): collectionEntryId is string => Boolean(collectionEntryId)),
  );
  const requestedEntryIds = [...new Set(slots.map((slot) => slot.collectionEntryId).filter(Boolean))];
  const entryRecords = requestedEntryIds.length
    ? await prisma.collectionEntry.findMany({
        where: {
          id: {
            in: requestedEntryIds as string[],
          },
          userId: viewer.id,
          runId: activeRun.id,
          lockState: {
            not: EntryLockState.TRADED,
          },
        },
        include: {
          card: true,
          setCard: {
            include: {
              set: true,
            },
          },
        },
      })
    : [];

  const entryRecordMap = new Map(entryRecords.map((entry) => [entry.id, entry]));

  const otherUsedSlots = await prisma.collectionBinderSlot.findMany({
    where: {
      page: {
        binderId,
        binder: {
          runId: activeRun.id,
        },
      },
      pageId: {
        not: page.id,
      },
      collectionEntryId: {
        not: null,
      },
      collectionEntry: {
        is: {
          lockState: {
            not: EntryLockState.TRADED,
          },
        },
      },
    },
    select: {
      collectionEntryId: true,
    },
  });

  const otherUsedEntryIds = new Set(
    otherUsedSlots
      .map((slot) => slot.collectionEntryId)
      .filter((collectionEntryId): collectionEntryId is string => Boolean(collectionEntryId)),
  );
  const currentPageEntryIds = new Set<string>();

  const normalizedSlots = slots
    .slice()
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .map((slot) => {
      if (slot.collectionEntryId) {
        if (otherUsedEntryIds.has(slot.collectionEntryId)) {
          throw new Error("Diese Sammlungskopie wird in diesem Binder bereits auf einer anderen Seite verwendet.");
        }

        if (currentPageEntryIds.has(slot.collectionEntryId)) {
          throw new Error("Dieselbe Sammlungskopie darf innerhalb eines Binders nur einmal vorkommen.");
        }

        const entry = entryRecordMap.get(slot.collectionEntryId);

        if (!entry) {
          throw new Error("Mindestens eine gezogene Karte ist nicht mehr für den Binder verfügbar.");
        }

        if (
          entry.lockState !== EntryLockState.AVAILABLE &&
          !existingPageEntryIds.has(entry.id)
        ) {
          throw new Error("Reservierte Karten können nicht neu in einen Binder gelegt werden.");
        }

        currentPageEntryIds.add(entry.id);

        return {
          slotIndex: slot.slotIndex,
          collectionEntryId: entry.id,
          ...createSlotSnapshotFromEntry(entry),
        };
      }

      if (slot.entryReferenceId || slot.cardId || slot.cardName || slot.printingLabel) {
        return {
          slotIndex: slot.slotIndex,
          collectionEntryId: null,
          entryReferenceId: slot.entryReferenceId ?? null,
          snapshotCardId: slot.cardId ?? null,
          snapshotCardName: slot.cardName ?? null,
          snapshotImageUrl: slot.imageUrl ?? null,
          snapshotPrintingLabel: slot.printingLabel ?? null,
          snapshotSetCode: slot.setCode ?? null,
          snapshotRarity: slot.rarity ?? null,
        };
      }

      return {
        slotIndex: slot.slotIndex,
        collectionEntryId: null,
        entryReferenceId: null,
        snapshotCardId: null,
        snapshotCardName: null,
        snapshotImageUrl: null,
        snapshotPrintingLabel: null,
        snapshotSetCode: null,
        snapshotRarity: null,
      };
    });

  const updatedPage = await prisma.$transaction(async (tx) => {
    const savedPage = await tx.collectionBinderPage.update({
      where: {
        id: page.id,
      },
      data: {
        updatedAt: new Date(),
        slots: {
          deleteMany: {},
          create: normalizedSlots,
        },
      },
      include: {
        slots: {
          orderBy: {
            slotIndex: "asc",
          },
          include: {
            collectionEntry: {
              include: {
                card: true,
                setCard: {
                  include: {
                    set: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    await tx.collectionBinder.update({
      where: { id: binderId },
      data: { updatedAt: new Date() },
    });

    return savedPage;
  });

  return mapBinderPage(updatedPage);
}
