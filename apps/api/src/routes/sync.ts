import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import { syncBootstrapResponseSchema, syncChangesResponseSchema } from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { buildSyncBootstrapPayload, buildSyncChangesPayload } from "@/lib/sync-data";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const changesQuerySchema = z.object({
  cursor: z.string().trim().min(1).nullable().optional(),
});

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const syncRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bootstrap", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const payload = await buildSyncBootstrapPayload(getSharedPrisma(), session.userId);

      return reply.send(syncBootstrapResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Sync-Bootstrap konnte nicht geladen werden.");
    }
  });

  app.get("/changes", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const query = changesQuerySchema.parse(request.query ?? {});
      const payload = await buildSyncChangesPayload(
        getSharedPrisma(),
        session.userId,
        query.cursor,
      );

      return reply.send(syncChangesResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Sync-Delta konnte nicht geladen werden.");
    }
  });
};

export default syncRoutes;
