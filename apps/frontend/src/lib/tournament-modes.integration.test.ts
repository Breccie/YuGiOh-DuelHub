import { CardKind, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { buildCampaignRuleConfig } from "@/lib/campaign-rule-service";
import {
  createSwissRound,
  createTournament,
  inviteTournamentParticipant,
  registerTournamentDeck,
} from "@/lib/tournament-service";
import { deleteRunFixture } from "@/test-support/run-fixture-cleanup";

const prisma = new PrismaClient();

describe("tournament modes and start snapshots", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates validated manual BO5 pairings and freezes registered decks at start", async () => {
    const tag = `vitest-tournament-modes-${Date.now()}`;
    const userIds: string[] = [];
    const cardIds: string[] = [];
    let runId: string | undefined;

    try {
      const [owner, player] = await Promise.all([
        prisma.user.create({
          data: {
            duelistId: `${tag}-owner`.toUpperCase(),
            email: `${tag}-owner@example.test`,
            passwordHash: "test-hash",
            displayName: "Tournament Owner",
          },
        }),
        prisma.user.create({
          data: {
            duelistId: `${tag}-player`.toUpperCase(),
            email: `${tag}-player@example.test`,
            passwordHash: "test-hash",
            displayName: "Tournament Player",
          },
        }),
      ]);
      userIds.push(owner.id, player.id);
      const run = await prisma.playGroupRun.create({
        data: {
          ownerId: owner.id,
          name: `${tag} run`,
          memberships: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: player.id, role: "PLAYER" },
            ],
          },
        },
      });
      runId = run.id;
      await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { activeRunId: run.id },
      });

      const ruleConfig = buildCampaignRuleConfig(run);
      ruleConfig.tournaments.allowedPairingModes = [
        "SWISS",
        "ROUND_ROBIN",
        "SINGLE_ELIMINATION",
        "MANUAL",
      ];
      ruleConfig.tournaments.allowedMatchModes = [
        "BEST_OF_ONE",
        "BEST_OF_THREE",
        "BEST_OF_FIVE",
      ];
      ruleConfig.tournaments.requireDeckRegistration = true;
      ruleConfig.decks.minMainDeck = 1;
      ruleConfig.decks.allowProxies = true;
      const ruleVersion = await prisma.campaignRuleVersion.create({
        data: {
          runId: run.id,
          version: 1,
          status: "ACTIVE",
          presetKey: "CUSTOM",
          config: ruleConfig,
          createdById: owner.id,
          activatedAt: new Date(),
        },
      });
      await prisma.playGroupRun.update({
        where: { id: run.id },
        data: { activeRuleVersionId: ruleVersion.id },
      });

      const [ownerCard, playerCard] = await Promise.all([
        prisma.card.create({
          data: {
            slug: `${tag}-owner-card`,
            externalCardId: `${tag}-owner-card`,
            name: `${tag} Owner Card`,
            kind: CardKind.MONSTER,
          },
        }),
        prisma.card.create({
          data: {
            slug: `${tag}-player-card`,
            externalCardId: `${tag}-player-card`,
            name: `${tag} Player Card`,
            kind: CardKind.SPELL,
          },
        }),
      ]);
      cardIds.push(ownerCard.id, playerCard.id);
      const [ownerDeck, playerDeck] = await Promise.all([
        prisma.deck.create({
          data: {
            userId: owner.id,
            runId: run.id,
            name: "Owner Tournament Deck",
            cards: { create: { cardId: ownerCard.id, section: "MAIN", quantity: 1 } },
          },
        }),
        prisma.deck.create({
          data: {
            userId: player.id,
            runId: run.id,
            name: "Player Tournament Deck",
            cards: { create: { cardId: playerCard.id, section: "MAIN", quantity: 2 } },
          },
        }),
      ]);

      const tournament = await createTournament(prisma, owner.id, {
        title: "Manual Snapshot Cup",
        pairingMode: "MANUAL",
        matchMode: "BEST_OF_FIVE",
      });
      const tournamentId = tournament.overview.id;
      await inviteTournamentParticipant(prisma, owner.id, tournamentId, player.duelistId);
      await registerTournamentDeck(prisma, owner.id, tournamentId, ownerDeck.id);
      await registerTournamentDeck(prisma, player.id, tournamentId, playerDeck.id);

      const started = await createSwissRound(prisma, owner.id, tournamentId, [
        { playerOneId: owner.id, playerTwoId: player.id },
      ]);
      expect(started.overview).toMatchObject({
        pairingMode: "MANUAL",
        matchMode: "BEST_OF_FIVE",
        status: "ACTIVE",
      });
      expect(started.rounds[0]?.matches[0]).toMatchObject({
        playerOne: { userId: owner.id },
        playerTwo: { userId: player.id },
      });

      const snapshots = await prisma.tournamentDeckSnapshot.findMany({
        where: { tournamentId },
        orderBy: { userId: "asc" },
      });
      expect(snapshots).toHaveLength(2);
      expect(snapshots.find((snapshot) => snapshot.userId === owner.id)?.cards).toEqual([
        { cardId: ownerCard.id, section: "MAIN", quantity: 1 },
      ]);
      expect(snapshots.find((snapshot) => snapshot.userId === player.id)?.cards).toEqual([
        { cardId: playerCard.id, section: "MAIN", quantity: 2 },
      ]);

      await prisma.deckCard.update({
        where: {
          deckId_cardId_section: {
            deckId: ownerDeck.id,
            cardId: ownerCard.id,
            section: "MAIN",
          },
        },
        data: { quantity: 3 },
      });
      const unchangedSnapshot = await prisma.tournamentDeckSnapshot.findUniqueOrThrow({
        where: { tournamentId_userId: { tournamentId, userId: owner.id } },
      });
      expect(unchangedSnapshot.cards).toEqual([
        { cardId: ownerCard.id, section: "MAIN", quantity: 1 },
      ]);
    } finally {
      if (runId) await deleteRunFixture(prisma, runId);
      if (cardIds.length > 0) await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
      if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });
});
