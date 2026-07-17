import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { getPrisma } from "./lib/prisma";
import { getAllowedCorsOrigins, getCookieSecret } from "./lib/runtime-config";
import authRoutes from "./routes/auth";
import cardRoutes from "./routes/cards";
import campaignRulesRoutes from "./routes/campaign-rules";
import collectionRoutes from "./routes/collection";
import customPacksRoutes from "./routes/custom-packs";
import dashboardRoutes from "./routes/dashboard";
import deckRoutes from "./routes/decks";
import duelRoutes from "./routes/duels";
import friendsRoutes from "./routes/friends";
import packsRoutes from "./routes/packs";
import profileRoutes from "./routes/profiles";
import rulesRoutes from "./routes/rules";
import runsRoutes from "./routes/runs";
import syncRoutes from "./routes/sync";
import tournamentRoutes from "./routes/tournaments";
import tradeRoutes from "./routes/trades";
import wishlistRoutes from "./routes/wishlist";

export function createServer() {
  const allowedOrigins = getAllowedCorsOrigins();
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.register(cookie, {
    secret: getCookieSecret(),
  });
  app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
  });

  app.get("/health", async () => {
    return {
      ok: true,
      service: "ygo-api",
    };
  });

  app.get("/ready", async (request, reply) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;

      return {
        ok: true,
        service: "ygo-api",
        database: "reachable",
      };
    } catch (error) {
      request.log.warn({ error }, "API readiness check failed.");

      return reply.status(503).send({
        ok: false,
        service: "ygo-api",
        database: "unreachable",
      });
    }
  });

  app.register(authRoutes, { prefix: "/api/v1/auth" });
  app.register(cardRoutes, { prefix: "/api/v1/cards" });
  app.register(campaignRulesRoutes, { prefix: "/api/v1/runs" });
  app.register(collectionRoutes, { prefix: "/api/v1/collection" });
  app.register(customPacksRoutes, { prefix: "/api/v1/runs" });
  app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  app.register(deckRoutes, { prefix: "/api/v1/decks" });
  app.register(duelRoutes, { prefix: "/api/v1/duels" });
  app.register(friendsRoutes, { prefix: "/api/v1/friends" });
  app.register(packsRoutes, { prefix: "/api/v1/packs" });
  app.register(profileRoutes, { prefix: "/api/v1/profiles" });
  app.register(rulesRoutes, { prefix: "/api/v1/rules" });
  app.register(runsRoutes, { prefix: "/api/v1/runs" });
  app.register(syncRoutes, { prefix: "/api/v1/sync" });
  app.register(tournamentRoutes, { prefix: "/api/v1/tournaments" });
  app.register(tradeRoutes, { prefix: "/api/v1/trades" });
  app.register(wishlistRoutes, { prefix: "/api/v1/wishlist" });

  return app;
}

const app = createServer();

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.API_PORT ?? 3233);
  const host = process.env.API_HOST ?? "127.0.0.1";

  app
    .listen({ host, port })
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
}

export default app;
