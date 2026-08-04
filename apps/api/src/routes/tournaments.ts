import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import {
  createTournamentRequestSchema,
  inviteTournamentParticipantRequestSchema,
  recordTournamentMatchResultRequestSchema,
  updateTournamentMvpCardsRequestSchema,
} from "@ygo/contracts";
import {
  createSwissRound,
  createTournament,
  completeTournament,
  getTournamentDetail,
  getCampaignLeaderboard,
  inviteTournamentParticipant,
  listTournamentOverviews,
  recordTournamentMatchResult,
  updateTournamentMvpCards,
} from "@/lib/tournament-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const tournamentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const tournaments = await listTournamentOverviews(getSharedPrisma(), session.userId);

      return reply.send({ tournaments });
    } catch (error) {
      return sendApiError(reply, error, "Turniere konnten nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createTournamentRequestSchema.parse(request.body ?? {});
      const tournament = await createTournament(getSharedPrisma(), session.userId, body);

      return reply.status(201).send({ tournament });
    } catch (error) {
      return sendApiError(reply, error, "Turnier konnte nicht erstellt werden.");
    }
  });

  app.get("/leaderboard", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      return reply.send(await getCampaignLeaderboard(getSharedPrisma(), session.userId));
    } catch (error) {
      return sendApiError(reply, error, "Kampagnen-Rangliste konnte nicht geladen werden.");
    }
  });

  app.get("/:id", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { id } = request.params as { id: string };
      const tournament = await getTournamentDetail(getSharedPrisma(), session.userId, id);

      return reply.send({ tournament });
    } catch (error) {
      return sendApiError(reply, error, "Turnier konnte nicht geladen werden.");
    }
  });

  app.post("/:id/participants", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { id } = request.params as { id: string };
      const body = inviteTournamentParticipantRequestSchema.parse(request.body ?? {});
      const tournament = await inviteTournamentParticipant(
        getSharedPrisma(),
        session.userId,
        id,
        body.duelistId,
      );

      return reply.send({ tournament });
    } catch (error) {
      return sendApiError(reply, error, "Teilnehmer konnte nicht eingeladen werden.");
    }
  });

  app.post("/:id/rounds", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { id } = request.params as { id: string };
      const tournament = await createSwissRound(getSharedPrisma(), session.userId, id);

      return reply.send({ tournament });
    } catch (error) {
      return sendApiError(reply, error, "Swiss-Runde konnte nicht erzeugt werden.");
    }
  });

  app.post("/:id/complete", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { id } = request.params as { id: string };
      const tournament = await completeTournament(
        getSharedPrisma(),
        session.userId,
        id,
      );

      return reply.send({ tournament });
    } catch (error) {
      return sendApiError(reply, error, "Turnier konnte nicht abgeschlossen werden.");
    }
  });

  app.patch("/:id/mvp-cards", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { id } = request.params as { id: string };
      const input = updateTournamentMvpCardsRequestSchema.parse(request.body ?? {});
      return reply.send(await updateTournamentMvpCards(getSharedPrisma(), {
        viewerId: session.userId,
        tournamentId: id,
        input,
      }));
    } catch (error) {
      return sendApiError(reply, error, "MVP-Karten konnten nicht gespeichert werden.");
    }
  });

  app.patch("/matches/:matchId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { matchId } = request.params as { matchId: string };
      const body = recordTournamentMatchResultRequestSchema.parse(request.body ?? {});
      const tournament = await recordTournamentMatchResult(
        getSharedPrisma(),
        session.userId,
        matchId,
        body,
      );

      return reply.send({ tournament });
    } catch (error) {
      return sendApiError(reply, error, "Matchergebnis konnte nicht gespeichert werden.");
    }
  });
};

export default tournamentRoutes;
