import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  openPackRequestSchema,
  openPackResponseSchema,
  openDisplayRequestSchema,
  openDisplayResponseSchema,
  packDashboardSnapshotSchema,
  packDetailResponseSchema,
  packSelectionResponseSchema,
} from "@ygo/contracts";
import { DomainError } from "@ygo/domain";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPackDashboardSnapshot, openDisplay, openPack } from "@/lib/pack-openings";
import { buildPackDetailPayload, buildPackSelectionPayload } from "@/lib/packs-data";
import { getActiveRun } from "@/lib/run-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const packParamsSchema = z.object({
  setId: z.string().trim().min(1),
});

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const packsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const activeRun = await getActiveRun(getSharedPrisma(), session.userId);
      const payload = await buildPackSelectionPayload(
        getSharedPrisma(),
        session.userId,
        activeRun.id,
      );

      return reply.send(packSelectionResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Pack-Auswahl konnte nicht geladen werden.");
    }
  });

  app.get("/openings", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const activeRun = await getActiveRun(getSharedPrisma(), session.userId);
      const snapshot = await getPackDashboardSnapshot(
        getSharedPrisma(),
        session.userId,
        activeRun.id,
      );

      return reply.send(packDashboardSnapshotSchema.parse(snapshot));
    } catch (error) {
      return sendApiError(reply, error, "Pack-Snapshot konnte nicht geladen werden.");
    }
  });

  app.post("/openings", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = openPackRequestSchema.parse(request.body ?? {});
      const activeRun = await getActiveRun(getSharedPrisma(), session.userId);
      const opening = await openPack(getSharedPrisma(), {
        viewerId: session.userId,
        runId: activeRun.id,
        setId: body.setId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send(openPackResponseSchema.parse({ opening }));
    } catch (error) {
      return sendApiError(reply, error, "Pack konnte nicht geöffnet werden.");
    }
  });

  app.post("/displays", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = openDisplayRequestSchema.parse(request.body ?? {});
      const activeRun = await getActiveRun(getSharedPrisma(), session.userId);
      const payload = await openDisplay(getSharedPrisma(), {
        viewerId: session.userId,
        runId: activeRun.id,
        setId: body.setId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send(openDisplayResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Display konnte nicht geöffnet werden.");
    }
  });

  app.get("/:setId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { setId } = packParamsSchema.parse(request.params);
      const activeRun = await getActiveRun(getSharedPrisma(), session.userId);
      const payload = await buildPackDetailPayload(
        getSharedPrisma(),
        session.userId,
        setId,
        activeRun.id,
      );

      if (!payload) {
        throw new DomainError({
          code: "not_found",
          message: "Dieses Pack existiert nicht.",
          status: 404,
        });
      }

      return reply.send(packDetailResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Pack-Detail konnte nicht geladen werden.");
    }
  });
};

export default packsRoutes;
