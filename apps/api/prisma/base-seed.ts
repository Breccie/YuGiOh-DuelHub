import { PrismaClient, FormatType, Region, ErrataPolicy } from "../generated/prisma";
import { hashPassword } from "../../../packages/domain/src";

const prisma = new PrismaClient();

async function main() {
  await prisma.session.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.tournamentParticipant.deleteMany();
  await prisma.tournamentRound.deleteMany();
  await prisma.tournamentMatch.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.banlistEntry.deleteMany();
  await prisma.banlist.deleteMany();
  await prisma.formatProfile.deleteMany();
  await prisma.user.deleteMany();

  const debugPasswordHash = hashPassword("Yugi001");
  const passwordHash = hashPassword("duelhub123");

  const [owner, friend, rival] = await Promise.all([
    prisma.user.create({
      data: {
        duelistId: "YUGI-001",
        email: "demo.duelist@example.com",
        passwordHash: debugPasswordHash,
        displayName: "Yugi Moto",
        avatarKey: "apprentice-sigil",
        favoriteEra: "5D's",
        isPublic: true,
      },
    }),
    prisma.user.create({
      data: {
        duelistId: "KAIBA-002",
        email: "trade.partner@example.com",
        passwordHash,
        displayName: "Trade Partner",
        avatarKey: "white-dragon",
        favoriteEra: "GX",
        isPublic: true,
      },
    }),
    prisma.user.create({
      data: {
        duelistId: "JOEY-003",
        email: "weekend.rival@example.com",
        passwordHash,
        displayName: "Weekend Rival",
        avatarKey: "flame-scar",
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
        requesterId: owner.id,
        addresseeId: rival.id,
        status: "ACCEPTED",
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
      description: "Basisformat für den frühen Online-Mehrnutzerbetrieb.",
    },
  });

  await prisma.banlist.create({
    data: {
      formatProfileId: format.id,
      name: "Classic Progression - Base Seed",
      effectiveFrom: new Date("2011-09-01T00:00:00.000Z"),
      errataPolicy: ErrataPolicy.BAN_ON_ERRATA,
      notes: "Start-Banlist für lokale Online-Entwicklung.",
    },
  });

  const tournament = await prisma.tournament.create({
    data: {
      hostId: owner.id,
      title: "Online Dev Cup",
      description: "Basis-Turnier für API- und UI-Integration.",
      formatLabel: "Classic Progression",
      scheduledAt: new Date("2011-09-15T18:30:00.000Z"),
      status: "DRAFT",
    },
  });

  await prisma.tournamentParticipant.createMany({
    data: [
      {
        tournamentId: tournament.id,
        userId: owner.id,
        invitedById: owner.id,
        status: "ACCEPTED",
        joinedAt: new Date("2011-09-12T08:00:00.000Z"),
        seed: 1,
      },
      {
        tournamentId: tournament.id,
        userId: friend.id,
        invitedById: owner.id,
        status: "ACCEPTED",
        joinedAt: new Date("2011-09-12T08:05:00.000Z"),
        seed: 2,
      },
    ],
  });

  console.log("Base seed complete.");
  console.log("Debug login: YUGI-001 / Yugi001");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
