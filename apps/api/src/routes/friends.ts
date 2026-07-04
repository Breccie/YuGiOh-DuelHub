import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  createFriendRequestSchema,
  friendRequestDecisionSchema,
  friendRequestMutationResponseSchema,
  friendRequestsResponseSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createFriendRequest,
  listFriendRequests,
  respondToFriendRequest,
} from "@/lib/friend-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const requestParamsSchema = z.object({
  requestId: z.string().trim().min(1),
});

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const friendsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const requests = await listFriendRequests(getSharedPrisma(), session.userId);

      return reply.send(friendRequestsResponseSchema.parse({ requests }));
    } catch (error) {
      return sendApiError(reply, error, "Freundesliste konnte nicht geladen werden.");
    }
  });

  app.get("/requests", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const requests = await listFriendRequests(getSharedPrisma(), session.userId);

      return reply.send(friendRequestsResponseSchema.parse({ requests }));
    } catch (error) {
      return sendApiError(
        reply,
        error,
        "Freundschaftsanfragen konnten nicht geladen werden.",
      );
    }
  });

  app.post("/requests", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createFriendRequestSchema.parse(request.body ?? {});
      const friendRequest = await createFriendRequest(
        getSharedPrisma(),
        session.userId,
        body.duelistId,
      );

      return reply
        .status(201)
        .send(friendRequestMutationResponseSchema.parse({ request: friendRequest }));
    } catch (error) {
      return sendApiError(
        reply,
        error,
        "Freundschaftsanfrage konnte nicht erstellt werden.",
      );
    }
  });

  app.patch("/requests/:requestId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { requestId } = requestParamsSchema.parse(request.params);
      const body = friendRequestDecisionSchema.parse(request.body ?? {});
      const result = await respondToFriendRequest(
        getSharedPrisma(),
        session.userId,
        requestId,
        body.action,
      );

      return reply.send(friendRequestMutationResponseSchema.parse({ request: result }));
    } catch (error) {
      return sendApiError(
        reply,
        error,
        "Freundschaftsanfrage konnte nicht aktualisiert werden.",
      );
    }
  });
};

export default friendsRoutes;
