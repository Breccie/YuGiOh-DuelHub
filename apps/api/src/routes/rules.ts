import {
  ruleTopicResponseSchema,
  rulesOverviewResponseSchema,
} from "@ygo/contracts";
import { DomainError, getRuleTopic, getRulesOverview } from "@ygo/domain";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors";

const ruleParamsSchema = z.object({
  slug: z.string().trim().min(1),
});

const rulesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    try {
      return reply.send(rulesOverviewResponseSchema.parse(getRulesOverview()));
    } catch (error) {
      return sendApiError(reply, error, "Regelwerk konnte nicht geladen werden.");
    }
  });

  app.get("/:slug", async (request, reply) => {
    try {
      const { slug } = ruleParamsSchema.parse(request.params);
      const topic = getRuleTopic(slug);

      if (!topic) {
        throw new DomainError({
          code: "not_found",
          message: "Dieser Regelbereich existiert nicht.",
          status: 404,
        });
      }

      return reply.send(ruleTopicResponseSchema.parse({ topic }));
    } catch (error) {
      return sendApiError(reply, error, "Regelbereich konnte nicht geladen werden.");
    }
  });
};

export default rulesRoutes;
