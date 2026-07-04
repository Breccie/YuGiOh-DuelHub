import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import {
  createTournamentRequestSchema,
  inviteTournamentParticipantRequestSchema,
  recordTournamentMatchResultRequestSchema,
} from "@ygo/contracts";
import {
  createSwissRound,
  createTournament,
  completeTournament,
  getTournamentDetail,
  inviteTournamentParticipant,
  listTournamentOverviews,
  recordTournamentMatchResult,
} from "@/lib/tournament-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const tournamentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    try {
      const tournaments = await listTournamentOverviews(getSharedPrisma());

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

  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const tournament = await getTournamentDetail(getSharedPrisma(), id);

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
