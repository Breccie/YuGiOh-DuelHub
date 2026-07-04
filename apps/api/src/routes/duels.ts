import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  createDuelRequestSchema,
  duelActionRequestSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import {
  createDuelRequest,
  listDuelRequests,
  respondToDuelRequest,
  scheduleDuelRequest,
} from "@/lib/duel-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const duelRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const prisma = getPrisma();
      const session = await requireViewerSession(request, prisma);
      const [duels, decks] = await Promise.all([
        listDuelRequests(getSharedPrisma(), session.userId),
        prisma.deck.findMany({
          where: {
            userId: session.userId,
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            id: true,
            name: true,
          },
        }),
      ]);

      return reply.send({
        duels,
        decks,
      });
    } catch (error) {
      return sendApiError(reply, error, "Duellanfragen konnten nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createDuelRequestSchema.parse(request.body ?? {});
      const duel = await createDuelRequest(getSharedPrisma(), session.userId, body);

      return reply.status(201).send({
        duel,
      });
    } catch (error) {
      return sendApiError(reply, error, "Duellanfrage konnte nicht erstellt werden.");
    }
  });

  app.patch("/:duelRequestId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { duelRequestId } = request.params as { duelRequestId: string };
      const body = duelActionRequestSchema.parse(request.body ?? {});
      const duel =
        body.action === "schedule"
          ? await scheduleDuelRequest(
              getSharedPrisma(),
              session.userId,
              duelRequestId,
              body,
            )
          : await respondToDuelRequest(
              getSharedPrisma(),
              session.userId,
              duelRequestId,
              body.action,
            );

      return reply.send({
        duel,
      });
    } catch (error) {
      return sendApiError(reply, error, "Duellanfrage konnte nicht aktualisiert werden.");
    }
  });
};

export default duelRoutes;
