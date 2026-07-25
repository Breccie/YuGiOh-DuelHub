import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  publicProfileResponseSchema,
  updateProfileRequestSchema,
  updateProfileResponseSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPublicProfileByDuelistId } from "@/lib/profile-service";
import { updateViewerProfile } from "@/lib/profile-settings-service";
import { getViewerSession, requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const profileParamsSchema = z.object({
  duelistId: z.string().trim().min(1),
});

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const profileRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/me", async (request, reply) => {
    try {
      const prisma = getPrisma();
      const session = await requireViewerSession(request, prisma);
      const body = updateProfileRequestSchema.parse(request.body ?? {});
      const updated = await updateViewerProfile(
        prisma as unknown as FrontendPrismaClient,
        session.userId,
        body,
      );

      return reply.send(updateProfileResponseSchema.parse({ profile: updated }));
    } catch (error) {
      return sendApiError(reply, error, "Profil konnte nicht aktualisiert werden.");
    }
  });

  app.get("/:duelistId", async (request, reply) => {
    try {
      const prisma = getSharedPrisma();
      const session = await getViewerSession(request, getPrisma());
      const { duelistId } = profileParamsSchema.parse(request.params);
      const profile = await getPublicProfileByDuelistId(
        prisma,
        duelistId,
        session?.userId ?? null,
      );

      return reply.send(publicProfileResponseSchema.parse({ profile }));
    } catch (error) {
      return sendApiError(reply, error, "Profil konnte nicht geladen werden.");
    }
  });
};

export default profileRoutes;
