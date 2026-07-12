import { CardKind, EntryLockState, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  collectionBinderSlotCount,
  createCollectionBinder,
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
});
