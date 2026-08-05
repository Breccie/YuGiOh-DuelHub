import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import {
  auctionDecisionRequestSchema,
  createAuctionRequestSchema,
  placeAuctionBidRequestSchema,
} from "@ygo/contracts";
import {
  cancelAuction,
  createAuction,
  getAuctionOverview,
  placeAuctionBid,
  settleAuction,
} from "@/lib/auction-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const auctionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      return reply.send(await getAuctionOverview(getSharedPrisma(), session.userId));
    } catch (error) {
      return sendApiError(reply, error, "Auktionen konnten nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createAuctionRequestSchema.parse(request.body ?? {});
      const auction = await createAuction(getSharedPrisma(), session.userId, {
        ...body,
        endsAt: new Date(body.endsAt),
      });
      return reply.status(201).send({ auction });
    } catch (error) {
      return sendApiError(reply, error, "Auktion konnte nicht erstellt werden.");
    }
  });

  app.post<{ Params: { auctionId: string } }>(
    "/:auctionId/bids",
    async (request, reply) => {
      try {
        const session = await requireViewerSession(request, getPrisma());
        const body = placeAuctionBidRequestSchema.parse(request.body ?? {});
        const auction = await placeAuctionBid(
          getSharedPrisma(),
          session.userId,
          request.params.auctionId,
          body.amount,
        );
        return reply.send({ auction });
      } catch (error) {
        return sendApiError(reply, error, "Gebot konnte nicht abgegeben werden.");
      }
    },
  );

  app.post<{ Params: { auctionId: string } }>(
    "/:auctionId/decision",
    async (request, reply) => {
      try {
        const session = await requireViewerSession(request, getPrisma());
        const body = auctionDecisionRequestSchema.parse(request.body ?? {});
        if (body.action === "cancel") {
          await cancelAuction(
            getSharedPrisma(),
            session.userId,
            request.params.auctionId,
          );
        } else {
          await settleAuction(
            getSharedPrisma(),
            session.userId,
            request.params.auctionId,
          );
        }
        return reply.send({ ok: true });
      } catch (error) {
        return sendApiError(reply, error, "Auktion konnte nicht aktualisiert werden.");
      }
    },
  );
};

export default auctionRoutes;
