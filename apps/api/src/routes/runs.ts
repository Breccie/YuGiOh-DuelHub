import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  activeRunResponseSchema,
  addRunMemberRequestSchema,
  applyRunProgressionResponseSchema,
  claimRewardResponseSchema,
  claimPromoRequestSchema,
  claimPromoResponseSchema,
  createHistoryEventRequestSchema,
  createRewardGrantRequestSchema,
  createRunRequestSchema,
  historyEventSchema,
  openDisplayRequestSchema,
  openDisplayResponseSchema,
  openPackResponseSchema,
  openRunPackRequestSchema,
  packSelectionResponseSchema,
  rewardGrantSchema,
  runRewardsResponseSchema,
  runProgressionResponseSchema,
  runPromosResponseSchema,
  runMemberSchema,
  runListResponseSchema,
  updateActiveRunRequestSchema,
  walletResponseSchema,
} from "@ygo/contracts";
import { DomainError, normalizeDuelistId } from "@ygo/domain";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  claimRewardPack,
  listRunRewardGrants,
  openDisplay,
  openPack,
} from "@/lib/pack-openings";
import { buildPackSelectionPayload } from "@/lib/packs-data";
import {
  applyProgressionCheckpoint,
  claimPromoCard,
  getRunProgression,
  getRunPromos,
} from "@/lib/progression-service";
import {
  createRun,
  creditWallet,
  getActiveRun,
  getOrCreateWallet,
  listRuns,
  requireRunMembership,
  serializeLedgerEntry,
  serializeRun,
  serializeWallet,
  setActiveRun,
} from "@/lib/run-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const runParamsSchema = z.object({
  runId: z.string().trim().min(1),
});

const checkpointParamsSchema = runParamsSchema.extend({
  checkpointId: z.string().trim().min(1),
});

const promoParamsSchema = runParamsSchema.extend({
  sourceId: z.string().trim().min(1),
});

const rewardGrantParamsSchema = runParamsSchema.extend({
  rewardGrantId: z.string().trim().min(1),
});

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

function serializeEvent(event: {
  id: string;
  runId: string;
  title: string;
  description: string | null;
  type: "WORLD_CHAMPIONSHIP" | "NATIONALS" | "TOURNAMENT_PACK_PERIOD" | "SET_RELEASE" | "CUSTOM";
  eventDate: Date | null;
  isUnlocked: boolean;
  rewardConfig: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: event.id,
    runId: event.runId,
    title: event.title,
    description: event.description,
    type: event.type,
    eventDate: event.eventDate?.toISOString() ?? null,
    isUnlocked: event.isUnlocked,
    rewardConfig: event.rewardConfig ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function serializeRewardGrant(grant: {
  id: string;
  runId: string;
  recipientId: string;
  grantedById: string | null;
  amountCredits: number;
  packSetId: string | null;
  packQuantity: number;
  reason: string | null;
  status: "PENDING" | "CLAIMED" | "CANCELLED";
  createdAt: Date;
  claimedAt: Date | null;
}) {
  return {
    id: grant.id,
    runId: grant.runId,
    recipientId: grant.recipientId,
    grantedById: grant.grantedById,
    amountCredits: grant.amountCredits,
    packSetId: grant.packSetId,
    packQuantity: grant.packQuantity,
    reason: grant.reason,
    status: grant.status,
    createdAt: grant.createdAt.toISOString(),
    claimedAt: grant.claimedAt?.toISOString() ?? null,
  };
}

const runsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const payload = await listRuns(getSharedPrisma(), session.userId);

      return reply.send(runListResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Runden konnten nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createRunRequestSchema.parse(request.body ?? {});
      const run = await createRun(getSharedPrisma(), session.userId, body);
      const wallet = await getOrCreateWallet(getSharedPrisma(), {
        runId: run.id,
        userId: session.userId,
      });

      return reply.status(201).send(
        activeRunResponseSchema.parse({
          run: serializeRun(run, session.userId),
          wallet: serializeWallet(wallet),
        }),
      );
    } catch (error) {
      return sendApiError(reply, error, "Runde konnte nicht erstellt werden.");
    }
  });

  app.get("/active", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const run = await getActiveRun(getSharedPrisma(), session.userId);
      const wallet = await getOrCreateWallet(getSharedPrisma(), {
        runId: run.id,
        userId: session.userId,
      });

      return reply.send(
        activeRunResponseSchema.parse({
          run: serializeRun(run, session.userId),
          wallet: serializeWallet(wallet),
        }),
      );
    } catch (error) {
      return sendApiError(reply, error, "Aktive Runde konnte nicht geladen werden.");
    }
  });

  app.put("/active", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = updateActiveRunRequestSchema.parse(request.body ?? {});
      const run = await setActiveRun(getSharedPrisma(), {
        runId: body.runId,
        userId: session.userId,
      });
      const wallet = await getOrCreateWallet(getSharedPrisma(), {
        runId: run.id,
        userId: session.userId,
      });

      return reply.send(
        activeRunResponseSchema.parse({
          run: serializeRun(run, session.userId),
          wallet: serializeWallet(wallet),
        }),
      );
    } catch (error) {
      return sendApiError(reply, error, "Aktive Runde konnte nicht gesetzt werden.");
    }
  });

  app.get("/:runId/wallet", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
      });

      const [wallet, recentEntries] = await Promise.all([
        getOrCreateWallet(getSharedPrisma(), {
          runId,
          userId: session.userId,
        }),
        getSharedPrisma().creditLedgerEntry.findMany({
          where: {
            runId,
            userId: session.userId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        }),
      ]);

      return reply.send(
        walletResponseSchema.parse({
          wallet: serializeWallet(wallet),
          recentEntries: recentEntries.map(serializeLedgerEntry),
        }),
      );
    } catch (error) {
      return sendApiError(reply, error, "Wallet konnte nicht geladen werden.");
    }
  });

  app.get("/:runId/members", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
      });
      const members = await getSharedPrisma().runMembership.findMany({
        where: {
          runId,
        },
        orderBy: {
          joinedAt: "asc",
        },
        include: {
          user: {
            select: {
              duelistId: true,
              displayName: true,
            },
          },
        },
      });

      return reply.send(
        z.array(runMemberSchema).parse(
          members.map((member) => ({
            id: member.id,
            runId: member.runId,
            userId: member.userId,
            duelistId: member.user.duelistId,
            displayName: member.user.displayName,
            role: member.role,
            joinedAt: member.joinedAt.toISOString(),
          })),
        ),
      );
    } catch (error) {
      return sendApiError(reply, error, "Run-Mitglieder konnten nicht geladen werden.");
    }
  });

  app.post("/:runId/members", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = addRunMemberRequestSchema.parse(request.body ?? {});
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
        organizerOnly: true,
      });

      const user = await getSharedPrisma().user.findUnique({
        where: {
          duelistId: normalizeDuelistId(body.duelistId),
        },
        select: {
          id: true,
          duelistId: true,
          displayName: true,
        },
      });

      if (!user) {
        throw new DomainError({
          code: "member_not_found",
          message: "Dieser Duelist wurde nicht gefunden.",
          status: 404,
        });
      }

      const member = await getSharedPrisma().runMembership.upsert({
        where: {
          runId_userId: {
            runId,
            userId: user.id,
          },
        },
        create: {
          runId,
          userId: user.id,
          role: body.role ?? "PLAYER",
        },
        update: {
          role: body.role ?? "PLAYER",
        },
      });
      await getOrCreateWallet(getSharedPrisma(), {
        runId,
        userId: user.id,
      });

      return reply.status(201).send(
        runMemberSchema.parse({
          id: member.id,
          runId: member.runId,
          userId: member.userId,
          duelistId: user.duelistId,
          displayName: user.displayName,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        }),
      );
    } catch (error) {
      return sendApiError(reply, error, "Run-Mitglied konnte nicht hinzugefügt werden.");
    }
  });

  app.get("/:runId/packs", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
      });
      const payload = await buildPackSelectionPayload(
        getSharedPrisma(),
        session.userId,
        runId,
      );

      return reply.send(packSelectionResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Run-Pack-Auswahl konnte nicht geladen werden.");
    }
  });

  app.post("/:runId/packs/openings", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = openRunPackRequestSchema.parse(request.body ?? {});
      const opening = await openPack(getSharedPrisma(), {
        viewerId: session.userId,
        runId,
        setId: body.setId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send(openPackResponseSchema.parse({ opening }));
    } catch (error) {
      return sendApiError(reply, error, "Run-Pack konnte nicht geöffnet werden.");
    }
  });

  app.post("/:runId/packs/displays", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = openDisplayRequestSchema.parse(request.body ?? {});
      const payload = await openDisplay(getSharedPrisma(), {
        viewerId: session.userId,
        runId,
        setId: body.setId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send(openDisplayResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Display konnte nicht geöffnet werden.");
    }
  });

  app.get("/:runId/progression", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const payload = await getRunProgression(
        getSharedPrisma(),
        session.userId,
        runId,
      );

      return reply.send(runProgressionResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Run-Fortschritt konnte nicht geladen werden.");
    }
  });

  app.post("/:runId/progression/:checkpointId/apply", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, checkpointId } = checkpointParamsSchema.parse(request.params);
      const payload = await applyProgressionCheckpoint(
        getSharedPrisma(),
        session.userId,
        runId,
        checkpointId,
      );

      return reply.send(applyRunProgressionResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Run-Fortschritt konnte nicht angewendet werden.");
    }
  });

  app.get("/:runId/promos", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const payload = await getRunPromos(getSharedPrisma(), session.userId, runId);

      return reply.send(runPromosResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Promo-Karten konnten nicht geladen werden.");
    }
  });

  app.post("/:runId/promos/:sourceId/claim", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, sourceId } = promoParamsSchema.parse(request.params);
      const body = claimPromoRequestSchema.parse(request.body ?? {});
      const payload = await claimPromoCard(
        getSharedPrisma(),
        session.userId,
        runId,
        sourceId,
        body.setCardId,
      );

      return reply.status(201).send(claimPromoResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Promo-Karte konnte nicht geclaimt werden.");
    }
  });

  app.get("/:runId/rewards", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const payload = await listRunRewardGrants(
        getSharedPrisma(),
        session.userId,
        runId,
      );

      return reply.send(runRewardsResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Rewards konnten nicht geladen werden.");
    }
  });

  app.post("/:runId/rewards/:rewardGrantId/claim", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, rewardGrantId } = rewardGrantParamsSchema.parse(request.params);
      const payload = await claimRewardPack(getSharedPrisma(), {
        viewerId: session.userId,
        runId,
        rewardGrantId,
      });

      return reply.status(201).send(claimRewardResponseSchema.parse(payload));
    } catch (error) {
      return sendApiError(reply, error, "Reward konnte nicht geclaimt werden.");
    }
  });

  app.get("/:runId/events", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
      });
      const events = await getSharedPrisma().historyEvent.findMany({
        where: {
          runId,
        },
        orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
      });

      return reply.send(z.array(historyEventSchema).parse(events.map(serializeEvent)));
    } catch (error) {
      return sendApiError(reply, error, "History-Events konnten nicht geladen werden.");
    }
  });

  app.post("/:runId/events", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = createHistoryEventRequestSchema.parse(request.body ?? {});
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
        organizerOnly: true,
      });
      const event = await getSharedPrisma().historyEvent.create({
        data: {
          runId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          type: body.type ?? "CUSTOM",
          eventDate: body.eventDate ? new Date(body.eventDate) : null,
          isUnlocked: body.isUnlocked ?? false,
          rewardConfig: body.rewardConfig ?? undefined,
        },
      });

      return reply.status(201).send(historyEventSchema.parse(serializeEvent(event)));
    } catch (error) {
      return sendApiError(reply, error, "History-Event konnte nicht erstellt werden.");
    }
  });

  app.post("/:runId/rewards", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = createRewardGrantRequestSchema.parse(request.body ?? {});
      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: session.userId,
        organizerOnly: true,
      });

      const recipient = await getSharedPrisma().user.findUnique({
        where: {
          duelistId: normalizeDuelistId(body.recipientDuelistId),
        },
      });

      if (!recipient) {
        throw new DomainError({
          code: "recipient_not_found",
          message: "Dieser Duelist wurde nicht gefunden.",
          status: 404,
        });
      }

      await requireRunMembership(getSharedPrisma(), {
        runId,
        userId: recipient.id,
      });

      const grant = await getSharedPrisma().$transaction(async (tx) => {
        const createdGrant = await tx.rewardGrant.create({
          data: {
            runId,
            recipientId: recipient.id,
            grantedById: session.userId,
            amountCredits: body.amountCredits ?? 0,
            packSetId: body.packSetId ?? null,
            packQuantity: body.packQuantity ?? 0,
            reason: body.reason?.trim() || null,
            status: body.amountCredits ? "CLAIMED" : "PENDING",
            claimedAt: body.amountCredits ? new Date() : null,
          },
        });

        if (createdGrant.amountCredits > 0) {
          await creditWallet(tx, {
            runId,
            userId: recipient.id,
            amount: createdGrant.amountCredits,
            source: "MANUAL_GRANT",
            referenceType: "RewardGrant",
            referenceId: createdGrant.id,
            note: createdGrant.reason,
          });
        }

        return createdGrant;
      });

      return reply.status(201).send(rewardGrantSchema.parse(serializeRewardGrant(grant)));
    } catch (error) {
      return sendApiError(reply, error, "Reward konnte nicht vergeben werden.");
    }
  });
};

export default runsRoutes;
