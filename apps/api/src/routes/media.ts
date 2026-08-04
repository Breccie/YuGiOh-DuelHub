import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  createMediaUploadIntentRequestSchema,
  finalizeMediaUploadRequestSchema,
  mediaAssetKindSchema,
  updateMediaAssetRequestSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createMediaUploadIntent,
  deleteMediaAsset,
  finalizeMediaUpload,
  listMediaAssets,
  readMediaAsset,
  renameMediaAsset,
} from "@/lib/media-service";
import { getViewerSession, requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const assetParamsSchema = z.object({ assetId: z.string().trim().min(1) });
const listQuerySchema = z.object({ kind: mediaAssetKindSchema.optional() });

function prisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const query = listQuerySchema.parse(request.query ?? {});
      return reply.send(await listMediaAssets(prisma(), session.userId, query.kind));
    } catch (error) {
      return sendApiError(reply, error, "Persönliche Designs konnten nicht geladen werden.");
    }
  });

  app.post("/upload-intents", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createMediaUploadIntentRequestSchema.parse(request.body ?? {});
      return reply.status(201).send(await createMediaUploadIntent(prisma(), session.userId, body));
    } catch (error) {
      return sendApiError(reply, error, "Der Bild-Upload konnte nicht vorbereitet werden.");
    }
  });

  app.post("/finalize", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = finalizeMediaUploadRequestSchema.parse(request.body ?? {});
      return reply.status(201).send(await finalizeMediaUpload(prisma(), session.userId, body.uploadToken));
    } catch (error) {
      return sendApiError(reply, error, "Das Bild konnte nicht verarbeitet werden.");
    }
  });

  app.patch("/:assetId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { assetId } = assetParamsSchema.parse(request.params);
      const body = updateMediaAssetRequestSchema.parse(request.body ?? {});
      return reply.send(await renameMediaAsset(prisma(), session.userId, assetId, body.name));
    } catch (error) {
      return sendApiError(reply, error, "Das Design konnte nicht umbenannt werden.");
    }
  });

  app.delete("/:assetId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { assetId } = assetParamsSchema.parse(request.params);
      return reply.send(await deleteMediaAsset(prisma(), session.userId, assetId));
    } catch (error) {
      return sendApiError(reply, error, "Das Design konnte nicht gelöscht werden.");
    }
  });

  app.get("/:assetId/content", async (request, reply) => {
    try {
      const { assetId } = assetParamsSchema.parse(request.params);
      const viewer = await getViewerSession(request, getPrisma());
      const asset = await readMediaAsset(prisma(), assetId, viewer?.userId);
      if (asset.redirectUrl) return reply.redirect(asset.redirectUrl);
      return reply.header("content-type", asset.mimeType).header("cache-control", "public, max-age=31536000, immutable").send(asset.bytes);
    } catch (error) {
      return sendApiError(reply, error, "Das Bild konnte nicht geladen werden.");
    }
  });
};

export default mediaRoutes;
