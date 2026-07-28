import { CardKind, EntryLockState, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  collectionBinderSlotCount,
  createCollectionBinder,
  deleteEmptyCollectionBinder,
  getCollectionBinderEditorSnapshot,
  getCollectionShowcaseSnapshot,
  saveCollectionBinderPage,
  type SaveBinderPageSlotInput,
} from "@/lib/collection-showcase";

const prisma = new PrismaClient();

function emptyPageSlots(): SaveBinderPageSlotInput[] {
  return Array.from({ length: collectionBinderSlotCount }, (_, slotIndex) => ({
    slotIndex,
    collectionEntryId: null,
  }));
}

describe("collection binder saving", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates exactly one default working binder for a new campaign", async () => {
    const tag = `vitest-binder-default-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        duelistId: tag.toUpperCase(),
        email: `${tag}@example.test`,
        passwordHash: "test-hash",
        displayName: "Default Binder Tester",
      },
    });

    try {
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} Campaign`,
          memberships: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { activeRunId: run.id },
      });

      const snapshot = await getCollectionShowcaseSnapshot(prisma, user.id);

      expect(snapshot.binders).toHaveLength(1);
      expect(snapshot.binders[0]).toEqual(
        expect.objectContaining({
          name: "Kampagnen-Binder",
          isActive: true,
        }),
      );
      expect(snapshot.binders[0]?.pages).toHaveLength(1);

      const extraBinder = await createCollectionBinder(prisma, user.id, {
        name: "Leerer Test-Binder",
        coverKey: "void-eye",
      });
      await expect(
        deleteEmptyCollectionBinder(prisma, user.id, extraBinder.id),
      ).resolves.toEqual(expect.objectContaining({ deletedBinderId: extraBinder.id }));
      await expect(
        deleteEmptyCollectionBinder(prisma, user.id, snapshot.binders[0]!.id),
      ).resolves.toEqual(
        expect.objectContaining({
          deletedBinderId: snapshot.binders[0]!.id,
          activeBinderId: expect.any(String),
        }),
      );
      const replacementSnapshot = await getCollectionShowcaseSnapshot(prisma, user.id);
      expect(replacementSnapshot.binders).toHaveLength(1);
      expect(replacementSnapshot.binders[0]).toEqual(
        expect.objectContaining({
          name: "Kampagnen-Binder",
          isActive: true,
          pageCount: 1,
        }),
      );
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("blocks newly placed reserved copies but keeps already saved reserved slots readable", async () => {
    const tag = `vitest-binder-reserved-${Date.now()}`;
    const createdIds: {
      userId?: string;
      cardId?: string;
      setId?: string;
      runId?: string;
    } = {};

    try {
      const user = await prisma.user.create({
        data: {
          duelistId: `${tag}-duelist`,
          email: `${tag}@example.test`,
          passwordHash: "test-hash",
          displayName: "Codex Binder Tester",
        },
      });
      createdIds.userId = user.id;

      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: user.id,
          name: `${tag} Campaign`,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
      });
      createdIds.runId = run.id;

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeRunId: run.id,
        },
      });

      const card = await prisma.card.create({
        data: {
          slug: `${tag}-card`,
          name: `${tag} Reserved Dragon`,
          kind: CardKind.MONSTER,
          currentOracleText: "Test card for binder reservation validation.",
        },
      });
      createdIds.cardId = card.id;

      const set = await prisma.cardSet.create({
        data: {
          code: `${tag}-SET`,
          name: `${tag} Test Booster`,
          releaseDate: new Date("2002-03-08T00:00:00.000Z"),
          region: "TCG",
          productType: "CORE_BOOSTER",
          isOpenable: true,
          packSize: 9,
        },
      });
      createdIds.setId = set.id;

      const setCard = await prisma.setCard.create({
        data: {
          setId: set.id,
          cardId: card.id,
          setCode: `${tag}-001`,
          rarity: "Common",
        },
      });

      const reservedEntry = await prisma.collectionEntry.create({
        data: {
          userId: user.id,
          cardId: card.id,
          setCardId: setCard.id,
          runId: run.id,
          source: "MANUAL_GRANT",
          lockState: EntryLockState.RESERVED,
        },
      });

      const binder = await createCollectionBinder(prisma, user.id, {
        name: `${tag} Binder`,
        coverKey: "golden-dragon",
        makeActive: true,
      });
      const page = binder.pages[0]!;

      await expect(
        saveCollectionBinderPage(prisma, user.id, binder.id, page.id, [
          { slotIndex: 0, collectionEntryId: reservedEntry.id },
          ...emptyPageSlots().slice(1),
        ]),
      ).rejects.toThrow("Reservierte Karten können nicht neu in einen Binder gelegt werden.");

      await prisma.collectionBinderSlot.update({
        where: {
          pageId_slotIndex: {
            pageId: page.id,
            slotIndex: 0,
          },
        },
        data: {
          collectionEntryId: reservedEntry.id,
          entryReferenceId: reservedEntry.id,
          snapshotCardId: card.id,
          snapshotCardName: card.name,
          snapshotPrintingLabel: `${set.code} · ${set.name}`,
          snapshotSetCode: setCard.setCode,
          snapshotRarity: setCard.rarity,
        },
      });

      await expect(
        saveCollectionBinderPage(prisma, user.id, binder.id, page.id, [
          { slotIndex: 0, collectionEntryId: reservedEntry.id },
          ...emptyPageSlots().slice(1),
        ]),
      ).resolves.toEqual(expect.objectContaining({ id: page.id }));

      await prisma.user.update({
        where: { id: user.id },
        data: { showcaseBinderId: binder.id },
      });
      await prisma.profileShowcaseSnapshot.create({
        data: {
          userId: user.id,
          sourceBinderId: binder.id,
          binderName: binder.name,
          highlightedCards: [],
        },
      });

      await expect(
        deleteEmptyCollectionBinder(prisma, user.id, binder.id),
      ).resolves.toEqual(
        expect.objectContaining({ deletedBinderId: binder.id }),
      );
      expect(
        await prisma.collectionEntry.count({
          where: { id: reservedEntry.id, userId: user.id },
        }),
      ).toBe(1);
      expect(
        await prisma.user.findUnique({
          where: { id: user.id },
          select: { showcaseBinderId: true },
        }),
      ).toEqual({ showcaseBinderId: null });
      expect(
        await prisma.profileShowcaseSnapshot.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    } finally {
      if (createdIds.userId) {
        await prisma.user.deleteMany({ where: { id: createdIds.userId } });
      }
      if (createdIds.runId) {
        await prisma.playGroupRun.deleteMany({ where: { id: createdIds.runId } });
      }
      if (createdIds.setId) {
        await prisma.cardSet.deleteMany({ where: { id: createdIds.setId } });
      }
      if (createdIds.cardId) {
        await prisma.card.deleteMany({ where: { id: createdIds.cardId } });
      }
    }
  });

  it("groups printings by card identity and places distinct physical copies repeatedly", async () => {
    const tag = `vitest-binder-copies-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        duelistId: `${tag}-duelist`.toUpperCase(),
        email: `${tag}@example.test`,
        passwordHash: "test-hash",
        displayName: "Copy Binder Tester",
      },
    });
    const run = await prisma.playGroupRun.create({
      data: {
        ownerId: user.id,
        name: `${tag} Campaign`,
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { activeRunId: run.id },
    });
    const card = await prisma.card.create({
      data: {
        slug: `${tag}-dragon`,
        name: `${tag} Dragon`,
        kind: CardKind.MONSTER,
      },
    });
    const set = await prisma.cardSet.create({
      data: {
        code: `${tag}-SET`,
        name: `${tag} Booster`,
        releaseDate: new Date("2002-03-08T00:00:00.000Z"),
        region: "TCG",
        productType: "CORE_BOOSTER",
        isOpenable: true,
        packSize: 9,
      },
    });
    const setCard = await prisma.setCard.create({
      data: {
        setId: set.id,
        cardId: card.id,
        setCode: `${tag}-001`,
        rarity: "Ultra Rare",
      },
    });

    try {
      await prisma.collectionEntry.createMany({
        data: [
          {
            userId: user.id,
            runId: run.id,
            cardId: card.id,
            source: "MANUAL_GRANT",
          },
          {
            userId: user.id,
            runId: run.id,
            cardId: card.id,
            source: "MANUAL_GRANT",
          },
          {
            userId: user.id,
            runId: run.id,
            cardId: card.id,
            setCardId: setCard.id,
            source: "PACK_OPENING",
          },
        ],
      });
      const binder = await createCollectionBinder(prisma, user.id, {
        name: `${tag} Binder`,
        coverKey: "storm-eye",
      });
      const editor = await getCollectionBinderEditorSnapshot(
        prisma,
        user.id,
        binder.id,
      );

      expect(editor.inventoryCards).toHaveLength(1);
      expect(editor.inventoryCards[0]).toMatchObject({
        cardId: card.id,
        totalCopies: 3,
      });
      expect(editor.inventoryCards[0]?.printings).toHaveLength(2);
      const entryIds = editor.inventoryCards[0]!.printings.flatMap(
        (printing) => printing.selectableEntryIds,
      );
      expect(new Set(entryIds).size).toBe(3);

      await saveCollectionBinderPage(
        prisma,
        user.id,
        binder.id,
        binder.pages[0]!.id,
        [
          ...entryIds.map((collectionEntryId, slotIndex) => ({
            slotIndex,
            collectionEntryId,
          })),
          ...emptyPageSlots().slice(entryIds.length),
        ],
      );
      expect(
        await prisma.collectionBinderSlot.count({
          where: {
            page: { binderId: binder.id },
            collectionEntryId: { in: entryIds },
          },
        }),
      ).toBe(3);
    } finally {
      await prisma.playGroupRun.deleteMany({ where: { id: run.id } });
      await prisma.cardSet.deleteMany({ where: { id: set.id } });
      await prisma.card.deleteMany({ where: { id: card.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
});
