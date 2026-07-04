import {
  CardKind,
  DeckSection,
  EntryLockState,
  ErrataPolicy,
  FormatType,
  OwnershipSource,
  PrismaClient,
  Region,
  TournamentMatchStatus,
  TournamentParticipantStatus,
  TournamentRoundStatus,
  TournamentStatus,
  TradeStatus,
} from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function readDatabaseUrlFromDotEnv() {
  if (!existsSync(".env")) {
    return null;
  }

  const envContent = readFileSync(".env", "utf8");
  const databaseLine = envContent
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("DATABASE_URL="));

  if (!databaseLine) {
    return null;
  }

  return databaseLine
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^['\"]|['\"]$/g, "");
}

function isLocalDevSqliteDatabase(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return false;
  }

  const normalizedUrl = databaseUrl.toLowerCase();

  return (
    /(^|[:/\\.-])(dev|demo|local|test)\.db($|[?#])/.test(normalizedUrl) &&
    !/(prod|production|staging)/.test(normalizedUrl)
  );
}

function assertSafeSeedReset() {
  const databaseUrl = process.env.DATABASE_URL ?? readDatabaseUrlFromDotEnv() ?? "";
  const allowDestructiveSeed = process.env.ALLOW_DESTRUCTIVE_SEED === "1";

  if (allowDestructiveSeed || isLocalDevSqliteDatabase(databaseUrl)) {
    return;
  }

  throw new Error(
    "Refusing to reset seed data outside a local dev SQLite database. " +
      "Set ALLOW_DESTRUCTIVE_SEED=1 only for an intentional local reset.",
  );
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function createEmptyBinderSlots() {
  return Array.from({ length: 18 }, (_, slotIndex) => ({
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

async function resetDatabase() {
  await prisma.tournamentMatch.deleteMany();
  await prisma.tournamentRound.deleteMany();
  await prisma.tournamentParticipant.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.duelAppointment.deleteMany();
  await prisma.duelRequest.deleteMany();
  await prisma.deckExport.deleteMany();
  await prisma.tradeVersionItem.deleteMany();
  await prisma.tradeVersion.deleteMany();
  await prisma.tradeItem.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.deckCard.deleteMany();
  await prisma.deck.deleteMany();
  await prisma.banlistEntry.deleteMany();
  await prisma.banlist.deleteMany();
  await prisma.formatProfile.deleteMany();
  await prisma.collectionBinderSlot.deleteMany();
  await prisma.collectionBinderPage.deleteMany();
  await prisma.collectionPreset.deleteMany();
  await prisma.collectionBinder.deleteMany();
  await prisma.collectionEntry.deleteMany();
  await prisma.packPull.deleteMany();
  await prisma.packOpening.deleteMany();
  await prisma.setCard.deleteMany();
  await prisma.cardTextVersion.deleteMany();
  await prisma.cardSet.deleteMany();
  await prisma.card.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  assertSafeSeedReset();
  await resetDatabase();

  const debugPasswordHash = hashPassword("Yugi001");
  const defaultPasswordHash = hashPassword("duelhub123");

  const [owner, friend, rival] = await Promise.all([
    prisma.user.create({
      data: {
        duelistId: "YUGI-001",
        email: "demo.duelist@example.com",
        passwordHash: debugPasswordHash,
        displayName: "Yugi Moto",
        avatarKey: "apprentice-sigil",
        bio: "Debug-Duelist mit hohem Testguthaben für Pack-Openings, Trades und Turniere.",
        favoriteEra: "5D's",
        isPublic: true,
      },
    }),
    prisma.user.create({
      data: {
        duelistId: "KAIBA-002",
        email: "trade.partner@example.com",
        passwordHash: defaultPasswordHash,
        displayName: "Trade Partner",
        avatarKey: "white-dragon",
        bio: "Mag High-Rarity-Reprints, testet Decklisten in EDOPro und schaut sich fremde Binder an.",
        favoriteEra: "GX",
        isPublic: true,
      },
    }),
    prisma.user.create({
      data: {
        duelistId: "JOEY-003",
        email: "weekend.rival@example.com",
        passwordHash: defaultPasswordHash,
        displayName: "Weekend Rival",
        avatarKey: "flame-scar",
        bio: "Nimmt an Wochenend-Cups teil und sucht vor allem Progression-Matches.",
        favoriteEra: "DM",
        isPublic: true,
      },
    }),
  ]);

  await prisma.friendship.createMany({
    data: [
      {
        requesterId: owner.id,
        addresseeId: friend.id,
        status: "ACCEPTED",
      },
      {
        requesterId: rival.id,
        addresseeId: owner.id,
        status: "PENDING",
      },
    ],
  });

  const format = await prisma.formatProfile.create({
    data: {
      slug: "classic-progression",
      name: "Classic Progression",
      type: FormatType.PROGRESSION,
      region: Region.TCG,
      startDate: new Date("2002-03-01T00:00:00.000Z"),
      defaultErrataPolicy: ErrataPolicy.BAN_ON_ERRATA,
      description:
        "Chronologisches Desktop-Format mit historischen Bannlisten, Einzelkopien in der Sammlung und Errata-Sperre pro Snapshot.",
    },
  });

  const cards = await Promise.all([
    prisma.card.create({
      data: {
        slug: "relic-channeler",
        externalCardId: "10000001",
        name: "Relic Channeler",
        kind: CardKind.MONSTER,
        attribute: "LIGHT",
        monsterType: "Spellcaster",
        levelRankLink: 4,
        atk: 1600,
        def: 1200,
        currentOracleText:
          "If this card is Normal Summoned: draw 1 card, then discard 1 card.",
      },
    }),
    prisma.card.create({
      data: {
        slug: "vault-drake",
        externalCardId: "10000002",
        name: "Vault Drake",
        kind: CardKind.MONSTER,
        attribute: "DARK",
        monsterType: "Dragon",
        levelRankLink: 7,
        atk: 2500,
        def: 1800,
        currentOracleText:
          "Cannot be Special Summoned. You can Tribute 2 monsters to Normal Summon this card without Tribute Set.",
      },
    }),
    prisma.card.create({
      data: {
        slug: "ember-scribe",
        externalCardId: "10000003",
        name: "Ember Scribe",
        kind: CardKind.SPELL,
        currentOracleText:
          "Add 1 Level 4 or lower monster from your GY to your hand.",
      },
    }),
    prisma.card.create({
      data: {
        slug: "mirror-garrison",
        externalCardId: "10000004",
        name: "Mirror Garrison",
        kind: CardKind.TRAP,
        currentOracleText:
          "When an opponent's monster declares an attack: target 1 monster you control; it cannot be destroyed by that battle.",
      },
    }),
    prisma.card.create({
      data: {
        slug: "tuning-gear",
        externalCardId: "10000005",
        name: "Tuning Gear",
        kind: CardKind.SPELL,
        currentOracleText:
          "Add 1 Machine monster from your Deck to your hand, then place 1 card from your hand on the bottom of the Deck.",
      },
    }),
    prisma.card.create({
      data: {
        slug: "graveyard-scout",
        externalCardId: "10000006",
        name: "Graveyard Scout",
        kind: CardKind.MONSTER,
        attribute: "EARTH",
        monsterType: "Warrior",
        levelRankLink: 3,
        atk: 1200,
        def: 900,
        currentOracleText:
          "If this card is sent to the GY: you can reveal the top card of your Deck.",
      },
    }),
  ]);

  const [
    relicChanneler,
    vaultDrake,
    emberScribe,
    mirrorGarrison,
    tuningGear,
    graveyardScout,
  ] = cards;

  await prisma.cardTextVersion.createMany({
    data: [
      {
        cardId: relicChanneler.id,
        label: "Launch text",
        effectText: "If this card is Normal Summoned: draw 2 cards.",
        effectiveFrom: new Date("2003-05-01T00:00:00.000Z"),
        effectiveTo: new Date("2011-09-01T00:00:00.000Z"),
        isErrata: false,
      },
      {
        cardId: relicChanneler.id,
        label: "Post-errata text",
        effectText:
          "If this card is Normal Summoned: draw 1 card, then discard 1 card.",
        effectiveFrom: new Date("2011-09-01T00:00:00.000Z"),
        isErrata: true,
        isCurrent: true,
      },
      {
        cardId: vaultDrake.id,
        label: "Current text",
        effectText:
          "Cannot be Special Summoned. You can Tribute 2 monsters to Normal Summon this card without Tribute Set.",
        effectiveFrom: new Date("2004-02-01T00:00:00.000Z"),
        isCurrent: true,
      },
      {
        cardId: emberScribe.id,
        label: "Current text",
        effectText:
          "Add 1 Level 4 or lower monster from your GY to your hand.",
        effectiveFrom: new Date("2004-02-01T00:00:00.000Z"),
        isCurrent: true,
      },
      {
        cardId: mirrorGarrison.id,
        label: "Current text",
        effectText:
          "When an opponent's monster declares an attack: target 1 monster you control; it cannot be destroyed by that battle.",
        effectiveFrom: new Date("2004-02-01T00:00:00.000Z"),
        isCurrent: true,
      },
      {
        cardId: tuningGear.id,
        label: "Current text",
        effectText:
          "Add 1 Machine monster from your Deck to your hand, then place 1 card from your hand on the bottom of the Deck.",
        effectiveFrom: new Date("2004-02-01T00:00:00.000Z"),
        isCurrent: true,
      },
      {
        cardId: graveyardScout.id,
        label: "Current text",
        effectText:
          "If this card is sent to the GY: you can reveal the top card of your Deck.",
        effectiveFrom: new Date("2004-02-01T00:00:00.000Z"),
        isCurrent: true,
      },
    ],
  });

  const starterSet = await prisma.cardSet.create({
    data: {
      code: "SMP-START",
      name: "Starter Chronicles",
      region: Region.TCG,
      releaseDate: new Date("2003-05-01T00:00:00.000Z"),
      productType: "CORE_BOOSTER",
      packSize: 9,
      notes:
        "Seed-Datensatz für Desktop-Profile, Pack-Openings, Trades, Duelle und Turniere.",
    },
  });

  const setCards = await Promise.all([
    prisma.setCard.create({
      data: {
        setId: starterSet.id,
        cardId: relicChanneler.id,
        setCode: "SMP-START-001",
        rarity: "Super Rare",
        collectorNumber: "001",
        pullWeight: 1,
      },
    }),
    prisma.setCard.create({
      data: {
        setId: starterSet.id,
        cardId: vaultDrake.id,
        setCode: "SMP-START-002",
        rarity: "Ultra Rare",
        collectorNumber: "002",
        pullWeight: 1,
      },
    }),
    prisma.setCard.create({
      data: {
        setId: starterSet.id,
        cardId: emberScribe.id,
        setCode: "SMP-START-003",
        rarity: "Common",
        collectorNumber: "003",
        pullWeight: 6,
      },
    }),
    prisma.setCard.create({
      data: {
        setId: starterSet.id,
        cardId: mirrorGarrison.id,
        setCode: "SMP-START-004",
        rarity: "Rare",
        collectorNumber: "004",
        pullWeight: 4,
      },
    }),
    prisma.setCard.create({
      data: {
        setId: starterSet.id,
        cardId: tuningGear.id,
        setCode: "SMP-START-005",
        rarity: "Common",
        collectorNumber: "005",
        pullWeight: 5,
      },
    }),
    prisma.setCard.create({
      data: {
        setId: starterSet.id,
        cardId: graveyardScout.id,
        setCode: "SMP-START-006",
        rarity: "Common",
        collectorNumber: "006",
        pullWeight: 5,
      },
    }),
  ]);

  const [
    starterRelic,
    starterVault,
    starterEmber,
    starterMirror,
    starterTuning,
    starterScout,
  ] = setCards;

  const banlist = await prisma.banlist.create({
    data: {
      formatProfileId: format.id,
      name: "Classic Progression - Autumn 2011",
      effectiveFrom: new Date("2011-09-01T00:00:00.000Z"),
      errataPolicy: ErrataPolicy.BAN_ON_ERRATA,
      notes:
        "Beispiel-Saison mit historischer Errata-Sperre und limitierten Staple-Slots.",
    },
  });

  await prisma.banlistEntry.createMany({
    data: [
      {
        banlistId: banlist.id,
        cardId: relicChanneler.id,
        allowedCopies: 3,
      },
      {
        banlistId: banlist.id,
        cardId: vaultDrake.id,
        allowedCopies: 1,
      },
      {
        banlistId: banlist.id,
        cardId: emberScribe.id,
        allowedCopies: 2,
      },
      {
        banlistId: banlist.id,
        cardId: mirrorGarrison.id,
        allowedCopies: 3,
      },
      {
        banlistId: banlist.id,
        cardId: tuningGear.id,
        allowedCopies: 2,
      },
      {
        banlistId: banlist.id,
        cardId: graveyardScout.id,
        allowedCopies: 3,
      },
    ],
  });

  const ownerOpening = await prisma.packOpening.create({
    data: {
      userId: owner.id,
      setId: starterSet.id,
      openedAt: new Date("2011-09-02T12:00:00.000Z"),
      randomSeed: "seed-owner-001",
      auditHash: "seeded-opening-owner",
    },
  });

  const friendOpening = await prisma.packOpening.create({
    data: {
      userId: friend.id,
      setId: starterSet.id,
      openedAt: new Date("2011-09-03T14:00:00.000Z"),
      randomSeed: "seed-friend-001",
      auditHash: "seeded-opening-friend",
    },
  });

  await prisma.packPull.createMany({
    data: [
      {
        openingId: ownerOpening.id,
        cardId: relicChanneler.id,
        setCardId: starterRelic.id,
        slotIndex: 1,
        rarity: "Super Rare",
      },
      {
        openingId: ownerOpening.id,
        cardId: vaultDrake.id,
        setCardId: starterVault.id,
        slotIndex: 2,
        rarity: "Ultra Rare",
      },
      {
        openingId: ownerOpening.id,
        cardId: emberScribe.id,
        setCardId: starterEmber.id,
        slotIndex: 3,
        rarity: "Common",
      },
      {
        openingId: ownerOpening.id,
        cardId: mirrorGarrison.id,
        setCardId: starterMirror.id,
        slotIndex: 4,
        rarity: "Rare",
      },
      {
        openingId: friendOpening.id,
        cardId: graveyardScout.id,
        setCardId: starterScout.id,
        slotIndex: 1,
        rarity: "Common",
      },
      {
        openingId: friendOpening.id,
        cardId: relicChanneler.id,
        setCardId: starterRelic.id,
        slotIndex: 2,
        rarity: "Super Rare",
      },
      {
        openingId: friendOpening.id,
        cardId: tuningGear.id,
        setCardId: starterTuning.id,
        slotIndex: 3,
        rarity: "Common",
      },
    ],
  });

  const ownerEntries = await Promise.all([
    prisma.collectionEntry.create({
      data: {
        userId: owner.id,
        cardId: relicChanneler.id,
        setCardId: starterRelic.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: ownerOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: owner.id,
        cardId: vaultDrake.id,
        setCardId: starterVault.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: ownerOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: owner.id,
        cardId: emberScribe.id,
        setCardId: starterEmber.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: ownerOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: owner.id,
        cardId: mirrorGarrison.id,
        setCardId: starterMirror.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: ownerOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: owner.id,
        cardId: tuningGear.id,
        setCardId: starterTuning.id,
        source: OwnershipSource.MANUAL_GRANT,
        notes: "Decktest-Kopie",
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: owner.id,
        cardId: emberScribe.id,
        setCardId: starterEmber.id,
        source: OwnershipSource.MANUAL_GRANT,
        notes: "Duplikat für Trade-Flows",
      },
    }),
  ]);

  const friendEntries = await Promise.all([
    prisma.collectionEntry.create({
      data: {
        userId: friend.id,
        cardId: graveyardScout.id,
        setCardId: starterScout.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: friendOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: friend.id,
        cardId: relicChanneler.id,
        setCardId: starterRelic.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: friendOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: friend.id,
        cardId: tuningGear.id,
        setCardId: starterTuning.id,
        source: OwnershipSource.PACK_OPENING,
        sourceReferenceId: friendOpening.id,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: friend.id,
        cardId: mirrorGarrison.id,
        setCardId: starterMirror.id,
        source: OwnershipSource.MANUAL_GRANT,
      },
    }),
  ]);

  await Promise.all([
    prisma.collectionEntry.create({
      data: {
        userId: rival.id,
        cardId: relicChanneler.id,
        setCardId: starterRelic.id,
        source: OwnershipSource.MANUAL_GRANT,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: rival.id,
        cardId: graveyardScout.id,
        setCardId: starterScout.id,
        source: OwnershipSource.MANUAL_GRANT,
      },
    }),
    prisma.collectionEntry.create({
      data: {
        userId: rival.id,
        cardId: mirrorGarrison.id,
        setCardId: starterMirror.id,
        source: OwnershipSource.MANUAL_GRANT,
      },
    }),
  ]);

  const ownerDeck = await prisma.deck.create({
    data: {
      userId: owner.id,
      formatProfileId: format.id,
      banlistId: banlist.id,
      name: "Starter Control",
      snapshotDate: new Date("2011-09-10T00:00:00.000Z"),
    },
  });

  const friendDeck = await prisma.deck.create({
    data: {
      userId: friend.id,
      formatProfileId: format.id,
      banlistId: banlist.id,
      name: "Tech Workshop",
      snapshotDate: new Date("2011-09-10T00:00:00.000Z"),
    },
  });

  await prisma.deckCard.createMany({
    data: [
      {
        deckId: ownerDeck.id,
        cardId: relicChanneler.id,
        section: DeckSection.MAIN,
        quantity: 2,
      },
      {
        deckId: ownerDeck.id,
        cardId: vaultDrake.id,
        section: DeckSection.MAIN,
        quantity: 1,
      },
      {
        deckId: ownerDeck.id,
        cardId: emberScribe.id,
        section: DeckSection.MAIN,
        quantity: 2,
      },
      {
        deckId: ownerDeck.id,
        cardId: mirrorGarrison.id,
        section: DeckSection.MAIN,
        quantity: 2,
      },
      {
        deckId: ownerDeck.id,
        cardId: tuningGear.id,
        section: DeckSection.SIDE,
        quantity: 1,
      },
      {
        deckId: friendDeck.id,
        cardId: graveyardScout.id,
        section: DeckSection.MAIN,
        quantity: 2,
      },
      {
        deckId: friendDeck.id,
        cardId: tuningGear.id,
        section: DeckSection.MAIN,
        quantity: 2,
      },
      {
        deckId: friendDeck.id,
        cardId: mirrorGarrison.id,
        section: DeckSection.MAIN,
        quantity: 1,
      },
      {
        deckId: friendDeck.id,
        cardId: relicChanneler.id,
        section: DeckSection.SIDE,
        quantity: 1,
      },
    ],
  });

  const ownerBinder = await prisma.collectionBinder.create({
    data: {
      userId: owner.id,
      name: "Showcase Binder",
      coverKey: "golden-dragon",
      description: "Öffentlicher Binder für Profilbesucher und Trade-Checks.",
      accentColor: "#d04f36",
      isActive: true,
      pages: {
        create: {
          pageIndex: 0,
          slots: {
            create: createEmptyBinderSlots(),
          },
        },
      },
    },
    include: {
      pages: {
        include: {
          slots: true,
        },
      },
    },
  });

  const binderPageId = ownerBinder.pages[0]?.id;
  const binderSlots = ownerBinder.pages[0]?.slots ?? [];

  if (binderPageId) {
    await Promise.all(
      binderSlots.slice(0, 4).map((slot, index) =>
        prisma.collectionBinderSlot.update({
          where: {
            id: slot.id,
          },
          data: {
            collectionEntryId: ownerEntries[index]?.id ?? null,
            entryReferenceId: ownerEntries[index]?.id ?? null,
            snapshotCardId: ownerEntries[index]?.cardId ?? null,
            snapshotCardName:
              index === 0
                ? relicChanneler.name
                : index === 1
                  ? vaultDrake.name
                  : index === 2
                    ? emberScribe.name
                    : mirrorGarrison.name,
            snapshotImageUrl: `https://images.ygoprodeck.com/images/cards/${
              [relicChanneler, vaultDrake, emberScribe, mirrorGarrison][index]?.externalCardId ?? ""
            }.jpg`,
            snapshotPrintingLabel: starterSet.name,
            snapshotSetCode:
              [starterRelic, starterVault, starterEmber, starterMirror][index]?.setCode ?? null,
            snapshotRarity:
              [starterRelic, starterVault, starterEmber, starterMirror][index]?.rarity ?? null,
          },
        }),
      ),
    );
  }

  await prisma.user.update({
    where: {
      id: owner.id,
    },
    data: {
      showcaseBinderId: ownerBinder.id,
    },
  });

  const deckExport = await prisma.deckExport.create({
    data: {
      userId: owner.id,
      deckId: ownerDeck.id,
      fileName: "starter-control.ydk",
      exportPath: "C:\\Users\\Emil\\Documents\\Yu-Gi-Oh\\exports\\starter-control.ydk",
      exportBody: [
        "#created by Duel Hub",
        "#main",
        "10000001",
        "10000001",
        "10000002",
        "10000003",
        "10000003",
        "10000004",
        "10000004",
        "#extra",
        "!side",
        "10000005",
      ].join("\n"),
    },
  });

  const scheduledCup = await prisma.tournament.create({
    data: {
      hostId: owner.id,
      title: "Desktop Progression Cup",
      description:
        "Freundes-Turnier mit Swiss-Pairings, Match-Historie und Deck-Export für EDOPro.",
      formatLabel: "Classic Progression",
      scheduledAt: new Date("2011-09-15T18:30:00.000Z"),
      status: TournamentStatus.ACTIVE,
    },
  });

  await prisma.tournamentParticipant.createMany({
    data: [
      {
        tournamentId: scheduledCup.id,
        userId: owner.id,
        invitedById: owner.id,
        status: TournamentParticipantStatus.ACCEPTED,
        joinedAt: new Date("2011-09-12T08:00:00.000Z"),
        seed: 1,
      },
      {
        tournamentId: scheduledCup.id,
        userId: friend.id,
        invitedById: owner.id,
        status: TournamentParticipantStatus.ACCEPTED,
        joinedAt: new Date("2011-09-12T08:05:00.000Z"),
        seed: 2,
      },
      {
        tournamentId: scheduledCup.id,
        userId: rival.id,
        invitedById: owner.id,
        status: TournamentParticipantStatus.ACCEPTED,
        joinedAt: new Date("2011-09-12T08:10:00.000Z"),
        seed: 3,
      },
    ],
  });

  const roundOne = await prisma.tournamentRound.create({
    data: {
      tournamentId: scheduledCup.id,
      roundNumber: 1,
      status: TournamentRoundStatus.PAIRED,
    },
  });

  const byeMatch = await prisma.tournamentMatch.create({
    data: {
      tournamentId: scheduledCup.id,
      roundId: roundOne.id,
      tableNumber: 1,
      playerOneId: rival.id,
      status: TournamentMatchStatus.BYE,
      winnerId: rival.id,
      playerOneScore: 2,
      playerTwoScore: 0,
      notes: "Automatisches Bye wegen ungerader Teilnehmerzahl.",
    },
  });

  const scheduledMatch = await prisma.tournamentMatch.create({
    data: {
      tournamentId: scheduledCup.id,
      roundId: roundOne.id,
      tableNumber: 2,
      playerOneId: owner.id,
      playerTwoId: friend.id,
      playerOneDeckId: ownerDeck.id,
      playerTwoDeckId: friendDeck.id,
      deckExportId: deckExport.id,
      status: TournamentMatchStatus.SCHEDULED,
      notes: "Match über Desktop-Handoff nach EDOPro geplant.",
    },
  });

  const duelRequest = await prisma.duelRequest.create({
    data: {
      requesterId: owner.id,
      opponentId: friend.id,
      requesterDeckId: ownerDeck.id,
      exportId: deckExport.id,
      tournamentMatchId: scheduledMatch.id,
      status: "SCHEDULED",
      message: "Lass uns heute Abend das Swiss-Match direkt in EDOPro spielen.",
    },
  });

  await prisma.duelAppointment.create({
    data: {
      duelRequestId: duelRequest.id,
      proposedAt: new Date("2011-09-15T19:00:00.000Z"),
      confirmedAt: new Date("2011-09-15T19:30:00.000Z"),
      note: "Deckexport liegt bereit, Roomcode folgt im Chat.",
      platform: "EDOPro",
    },
  });

  const pendingTrade = await prisma.trade.create({
    data: {
      proposerId: owner.id,
      responderId: friend.id,
      status: TradeStatus.PENDING,
      note: "Ember Scribe gegen Graveyard Scout für das nächste Progression-Deck.",
    },
  });

  const pendingTradeVersion = await prisma.tradeVersion.create({
    data: {
      tradeId: pendingTrade.id,
      versionNumber: 1,
      senderId: owner.id,
      recipientId: friend.id,
      note: "Ember Scribe gegen Graveyard Scout für das nächste Progression-Deck.",
    },
  });

  await prisma.tradeVersionItem.createMany({
    data: [
      {
        tradeVersionId: pendingTradeVersion.id,
        collectionEntryId: ownerEntries[5].id,
        fromUserId: owner.id,
        toUserId: friend.id,
      },
      {
        tradeVersionId: pendingTradeVersion.id,
        collectionEntryId: friendEntries[0].id,
        fromUserId: friend.id,
        toUserId: owner.id,
      },
    ],
  });

  await prisma.trade.update({
    where: {
      id: pendingTrade.id,
    },
    data: {
      activeVersionId: pendingTradeVersion.id,
    },
  });

  const acceptedTrade = await prisma.trade.create({
    data: {
      proposerId: friend.id,
      responderId: owner.id,
      status: TradeStatus.ACCEPTED,
      note: "Tuning Gear gegen Mirror Garrison, wartet nur noch auf die zweite Bestätigung.",
      acceptedAt: new Date("2011-09-14T20:10:00.000Z"),
      proposerConfirmedAt: new Date("2011-09-14T20:15:00.000Z"),
    },
  });

  const acceptedTradeVersion = await prisma.tradeVersion.create({
    data: {
      tradeId: acceptedTrade.id,
      versionNumber: 1,
      senderId: friend.id,
      recipientId: owner.id,
      note: "Tuning Gear gegen Mirror Garrison, wartet nur noch auf die zweite Bestätigung.",
    },
  });

  await prisma.tradeVersionItem.createMany({
    data: [
      {
        tradeVersionId: acceptedTradeVersion.id,
        collectionEntryId: friendEntries[3].id,
        fromUserId: friend.id,
        toUserId: owner.id,
      },
      {
        tradeVersionId: acceptedTradeVersion.id,
        collectionEntryId: ownerEntries[4].id,
        fromUserId: owner.id,
        toUserId: friend.id,
      },
    ],
  });

  await prisma.trade.update({
    where: {
      id: acceptedTrade.id,
    },
    data: {
      activeVersionId: acceptedTradeVersion.id,
      acceptedVersionId: acceptedTradeVersion.id,
    },
  });

  await prisma.collectionEntry.updateMany({
    where: {
      id: {
        in: [friendEntries[3].id, ownerEntries[4].id],
      },
    },
    data: {
      lockState: EntryLockState.RESERVED,
    },
  });

  await prisma.session.create({
    data: {
      userId: owner.id,
      tokenHash: "seed-session-preview",
      deviceLabel: "Desktop Preview",
      userAgent: "Seeded Session",
      rememberDevice: true,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });

  console.log("Seed complete.");
  console.log("Debug login: YUGI-001 / Yugi001");
  console.log("Alt login : KAIBA-002 / duelhub123");
  console.log("Rival login: JOEY-003 / duelhub123");
  console.log(`Seeded bye match: ${byeMatch.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
