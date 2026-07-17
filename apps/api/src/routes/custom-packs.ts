import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  createCustomPackRequestSchema,
  simulateCustomPackRequestSchema,
  updateCustomPackDraftRequestSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createCustomPack,
  createCustomPackTemplate,
  createNextCustomPackDraft,
  copyCustomPackTemplateToRun,
  listCustomPacks,
  listCustomPackTemplates,
  openCustomPackVersion,
  publishCustomPackVersion,
  simulateCustomPackVersion,
  updateCustomPackDraft,
} from "@/lib/custom-pack-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const runParamsSchema = z.object({ runId: z.string().trim().min(1) });
const versionParamsSchema = runParamsSchema.extend({ versionId: z.string().trim().min(1) });
const definitionParamsSchema = runParamsSchema.extend({ definitionId: z.string().trim().min(1) });
const templateParamsSchema = runParamsSchema.extend({ templateId: z.string().trim().min(1) });
const templateNameSchema = z.object({ name: z.string().trim().min(1).max(120).optional() });
const templateCopySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(2).max(24).optional(),
});
const openPackSchema = z.object({ seed: z.string().trim().min(1).max(200).optional() });

function sharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const customPacksRoutes: FastifyPluginAsync = async (app) => {
  app.get("/custom-pack-templates", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      return reply.send(await listCustomPackTemplates(sharedPrisma(), session.userId));
    } catch (error) {
      return sendApiError(reply, error, "Private Packvorlagen konnten nicht geladen werden.");
    }
  });

  app.get("/:runId/custom-packs", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      return reply.send(await listCustomPacks(sharedPrisma(), session.userId, runId));
    } catch (error) {
      return sendApiError(reply, error, "Custom Packs konnten nicht geladen werden.");
    }
  });

  app.post("/:runId/custom-packs", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = createCustomPackRequestSchema.parse(request.body ?? {});
      return reply.status(201).send(await createCustomPack(sharedPrisma(), session.userId, runId, body));
    } catch (error) {
      return sendApiError(reply, error, "Custom Pack konnte nicht erstellt werden.");
    }
  });

  app.put("/:runId/custom-packs/versions/:versionId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, versionId } = versionParamsSchema.parse(request.params);
      const body = updateCustomPackDraftRequestSchema.parse(request.body ?? {});
      return reply.send(await updateCustomPackDraft(sharedPrisma(), session.userId, runId, versionId, body));
    } catch (error) {
      return sendApiError(reply, error, "Custom-Pack-Entwurf konnte nicht gespeichert werden.");
    }
  });

  app.post("/:runId/custom-packs/versions/:versionId/simulate", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, versionId } = versionParamsSchema.parse(request.params);
      const body = simulateCustomPackRequestSchema.parse(request.body ?? {});
      return reply.send(await simulateCustomPackVersion(sharedPrisma(), session.userId, runId, versionId, body));
    } catch (error) {
      return sendApiError(reply, error, "Custom Pack konnte nicht simuliert werden.");
    }
  });

  app.post("/:runId/custom-packs/versions/:versionId/publish", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, versionId } = versionParamsSchema.parse(request.params);
      return reply.send(await publishCustomPackVersion(sharedPrisma(), session.userId, runId, versionId));
    } catch (error) {
      return sendApiError(reply, error, "Custom Pack konnte nicht veröffentlicht werden.");
    }
  });

  app.post("/:runId/custom-packs/versions/:versionId/open", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, versionId } = versionParamsSchema.parse(request.params);
      const body = openPackSchema.parse(request.body ?? {});
      return reply.status(201).send(await openCustomPackVersion(sharedPrisma(), session.userId, runId, versionId, body.seed));
    } catch (error) {
      return sendApiError(reply, error, "Custom Pack konnte nicht geöffnet werden.");
    }
  });

  app.post("/:runId/custom-packs/versions/:versionId/next-draft", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, versionId } = versionParamsSchema.parse(request.params);
      return reply.status(201).send(await createNextCustomPackDraft(sharedPrisma(), session.userId, runId, versionId));
    } catch (error) {
      return sendApiError(reply, error, "Neue Packversion konnte nicht erstellt werden.");
    }
  });

  app.post("/:runId/custom-packs/:definitionId/template", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, definitionId } = definitionParamsSchema.parse(request.params);
      const body = templateNameSchema.parse(request.body ?? {});
      return reply.status(201).send(await createCustomPackTemplate(
        sharedPrisma(),
        session.userId,
        runId,
        definitionId,
        body.name,
      ));
    } catch (error) {
      return sendApiError(reply, error, "Private Packvorlage konnte nicht erstellt werden.");
    }
  });

  app.post("/:runId/custom-pack-templates/:templateId/copy", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, templateId } = templateParamsSchema.parse(request.params);
      const body = templateCopySchema.parse(request.body ?? {});
      return reply.status(201).send(await copyCustomPackTemplateToRun(
        sharedPrisma(),
        session.userId,
        runId,
        templateId,
        body,
      ));
    } catch (error) {
      return sendApiError(reply, error, "Packvorlage konnte nicht in die Kampagne kopiert werden.");
    }
  });
};

export default customPacksRoutes;
