import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import { cardCatalogQuerySchema } from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { getCardCatalog } from "@/lib/card-catalog";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const cardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const query = cardCatalogQuerySchema.parse(request.query ?? {});
      const payload = await getCardCatalog(
        getPrisma() as unknown as FrontendPrismaClient,
        session.userId,
        query,
      );
      return reply.send(payload);
    } catch (error) {
      return sendApiError(reply, error, "Kartenkatalog konnte nicht geladen werden.");
    }
  });
};

export default cardRoutes;
