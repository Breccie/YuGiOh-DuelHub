import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import {
  createCollectionBinderRequestSchema,
  createCollectionPresetRequestSchema,
  saveCollectionBinderPageRequestSchema,
  updateCollectionBinderRequestSchema,
  updateCollectionPresetRequestSchema,
} from "@ygo/contracts";
import { z } from "zod";
import { getCollectionSnapshot } from "@/lib/collection-ledger";
import {
  binderCoverCatalog,
  type BinderCoverKey,
} from "@/lib/collection-showcase-config";
import {
  createCollectionBinder,
  createCollectionBinderPage,
  createCollectionPreset,
  getCollectionBinderEditorSnapshot,
  getCollectionShowcaseSnapshot,
  saveCollectionBinderPage,
  updateCollectionBinder,
  updateCollectionPreset,
} from "@/lib/collection-showcase";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const kindFilterSchema = z.enum(["ALL", "MONSTER", "SPELL", "TRAP", "TOKEN"]);

const collectionQuerySchema = z.object({
  query: z.string().optional(),
  kind: kindFilterSchema.optional(),
  duplicatesOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        return value === "true";
      }

      return false;
    }),
});

function parseBinderCoverKey(coverKey: string): BinderCoverKey {
  const match = binderCoverCatalog.find((cover) => cover.key === coverKey);

  if (!match) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Ungültiges Binder-Cover.",
        path: ["coverKey"],
      },
    ]);
  }

  return match.key;
}

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const collectionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const sharedPrisma = getSharedPrisma();
      const session = await requireViewerSession(request, getPrisma());
      const query = collectionQuerySchema.parse(request.query ?? {});

      const [showcase, collection, totalCards] = await Promise.all([
        getCollectionShowcaseSnapshot(sharedPrisma, session.userId),
        getCollectionSnapshot(
          {
            viewerId: session.userId,
            query: query.query,
            kind: query.kind,
            duplicatesOnly: query.duplicatesOnly,
          },
          sharedPrisma,
        ),
        getPrisma().card.count(),
      ]);

      return reply.send({
        viewer: collection.viewer,
        binders: showcase.binders,
        presets: showcase.presets,
        totals: collection.totals,
        cards: collection.cards,
        recentEntries: collection.recentEntries,
        totalCards,
      });
    } catch (error) {
      return sendApiError(reply, error, "Sammlung konnte nicht geladen werden.");
    }
  });

  app.get("/binders", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const snapshot = await getCollectionShowcaseSnapshot(
        getSharedPrisma(),
        session.userId,
      );

      return reply.send({
        binders: snapshot.binders,
      });
    } catch (error) {
      return sendApiError(reply, error, "Binder konnten nicht geladen werden.");
    }
  });

  app.post("/binders", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createCollectionBinderRequestSchema.parse(request.body ?? {});
      const binder = await createCollectionBinder(
        getSharedPrisma(),
        session.userId,
        {
          ...body,
          coverKey: parseBinderCoverKey(body.coverKey),
        },
      );

      return reply.status(201).send({ binder });
    } catch (error) {
      return sendApiError(reply, error, "Binder konnte nicht erstellt werden.");
    }
  });

  app.patch("/binders/:binderId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { binderId } = request.params as { binderId: string };
      const body = updateCollectionBinderRequestSchema.parse(request.body ?? {});
      const binder = await updateCollectionBinder(
        getSharedPrisma(),
        session.userId,
        binderId,
        {
          ...body,
          coverKey: body.coverKey ? parseBinderCoverKey(body.coverKey) : undefined,
        },
      );

      return reply.send({ binder });
    } catch (error) {
      return sendApiError(reply, error, "Binder konnte nicht aktualisiert werden.");
    }
  });

  app.get("/binders/:binderId/editor", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { binderId } = request.params as { binderId: string };
      const snapshot = await getCollectionBinderEditorSnapshot(
        getSharedPrisma(),
        session.userId,
        binderId,
      );

      return reply.send(snapshot);
    } catch (error) {
      return sendApiError(reply, error, "Binder-Editor konnte nicht geladen werden.");
    }
  });

  app.post("/binders/:binderId/pages", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { binderId } = request.params as { binderId: string };
      const page = await createCollectionBinderPage(
        getSharedPrisma(),
        session.userId,
        binderId,
      );

      return reply.status(201).send({ page });
    } catch (error) {
      return sendApiError(reply, error, "Binder-Seite konnte nicht erstellt werden.");
    }
  });

  app.put("/binders/:binderId/pages/:pageId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { binderId, pageId } = request.params as {
        binderId: string;
        pageId: string;
      };
      const body = saveCollectionBinderPageRequestSchema.parse(request.body ?? {});
      const page = await saveCollectionBinderPage(
        getSharedPrisma(),
        session.userId,
        binderId,
        pageId,
        body.slots,
      );

      return reply.send({ page });
    } catch (error) {
      return sendApiError(reply, error, "Binder-Seite konnte nicht gespeichert werden.");
    }
  });

  app.get("/presets", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const snapshot = await getCollectionShowcaseSnapshot(
        getSharedPrisma(),
        session.userId,
      );

      return reply.send({
        presets: snapshot.presets,
      });
    } catch (error) {
      return sendApiError(reply, error, "Presets konnten nicht geladen werden.");
    }
  });

  app.post("/presets", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createCollectionPresetRequestSchema.parse(request.body ?? {});
      const preset = await createCollectionPreset(
        getSharedPrisma(),
        session.userId,
        body,
      );

      return reply.status(201).send({ preset });
    } catch (error) {
      return sendApiError(reply, error, "Preset konnte nicht erstellt werden.");
    }
  });

  app.patch("/presets/:presetId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { presetId } = request.params as { presetId: string };
      const body = updateCollectionPresetRequestSchema.parse(request.body ?? {});
      const preset = await updateCollectionPreset(
        getSharedPrisma(),
        session.userId,
        presetId,
        body,
      );

      return reply.send({ preset });
    } catch (error) {
      return sendApiError(reply, error, "Preset konnte nicht aktualisiert werden.");
    }
  });
};

export default collectionRoutes;
