import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import { upsertWishlistItemRequestSchema } from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import {
  listWishlistItems,
  removeWishlistItem,
  upsertWishlistItem,
} from "@/lib/wishlist-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function sharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const wishlistRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      return reply.send({ items: await listWishlistItems(sharedPrisma(), session.userId) });
    } catch (error) {
      return sendApiError(reply, error, "Wunschliste konnte nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = upsertWishlistItemRequestSchema.parse(request.body ?? {});
      return reply.send({ items: await upsertWishlistItem(sharedPrisma(), session.userId, body) });
    } catch (error) {
      return sendApiError(reply, error, "Wunschliste konnte nicht gespeichert werden.");
    }
  });

  app.delete("/:itemId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { itemId } = request.params as { itemId: string };
      await removeWishlistItem(sharedPrisma(), session.userId, itemId);
      return reply.send({ ok: true });
    } catch (error) {
      return sendApiError(reply, error, "Wunschlisteneintrag konnte nicht entfernt werden.");
    }
  });
};

export default wishlistRoutes;
