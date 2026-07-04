import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import { homeDashboardResponseSchema } from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { buildHomeDashboardPayload } from "@/lib/home-dashboard-data";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const payload = await buildHomeDashboardPayload(getSharedPrisma(), session.userId);

      return reply.send(homeDashboardResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Dashboard konnte nicht geladen werden.");
    }
  });
};

export default dashboardRoutes;
