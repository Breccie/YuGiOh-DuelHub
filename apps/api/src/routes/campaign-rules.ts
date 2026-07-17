import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import {
  campaignRuleVersionSchema,
  createCampaignRuleVersionRequestSchema,
} from "@ygo/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  activateCampaignRuleVersion,
  ensureInitialCampaignRuleVersion,
  listCampaignRuleVersions,
  createCampaignRuleVersion,
} from "@/lib/campaign-rule-service";
import { requireRunMembership } from "@/lib/run-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const runParamsSchema = z.object({ runId: z.string().trim().min(1) });
const versionParamsSchema = runParamsSchema.extend({ versionId: z.string().trim().min(1) });

function sharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
}

const campaignRulesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:runId/rule-versions", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      await requireRunMembership(sharedPrisma(), { runId, userId: session.userId });
      await ensureInitialCampaignRuleVersion(sharedPrisma(), { runId, createdById: session.userId });
      const versions = await listCampaignRuleVersions(sharedPrisma(), session.userId, runId);
      return reply.send(z.array(campaignRuleVersionSchema).parse(versions));
    } catch (error) {
      return sendApiError(reply, error, "Regelversionen konnten nicht geladen werden.");
    }
  });

  app.post("/:runId/rule-versions", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId } = runParamsSchema.parse(request.params);
      const body = createCampaignRuleVersionRequestSchema.parse(request.body ?? {});
      const version = await createCampaignRuleVersion(sharedPrisma(), {
        runId,
        viewerId: session.userId,
        preset: body.preset,
        config: body.config,
        effectiveAt: body.effectiveAt,
        effectiveCheckpointId: body.effectiveCheckpointId,
        activateImmediately: body.activateImmediately,
      });
      return reply.status(201).send(campaignRuleVersionSchema.parse(version));
    } catch (error) {
      return sendApiError(reply, error, "Regelversion konnte nicht erstellt werden.");
    }
  });

  app.post("/:runId/rule-versions/:versionId/activate", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { runId, versionId } = versionParamsSchema.parse(request.params);
      const version = await activateCampaignRuleVersion(sharedPrisma(), {
        runId,
        versionId,
        viewerId: session.userId,
      });
      return reply.status(201).send(campaignRuleVersionSchema.parse(version));
    } catch (error) {
      return sendApiError(reply, error, "Regelversion konnte nicht aktiviert werden.");
    }
  });
};

export default campaignRulesRoutes;
