import type { FastifyPluginAsync } from "fastify";
import {
  loginRequestSchema,
  registerRequestSchema,
} from "../../../../packages/contracts/src";
import {
  applySessionCookie,
  authenticateUser,
  clearSessionCookie,
  createSessionForUser,
  destroyAllSessionsForUser,
  destroyCurrentSession,
  getViewerSession,
  registerUser,
} from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/session", async (request, reply) => {
    try {
      const session = await getViewerSession(request, getPrisma());
      return reply.send({ session });
    } catch (error) {
      return sendApiError(reply, error, "Session konnte nicht geladen werden.");
    }
  });

  app.post("/login", async (request, reply) => {
    try {
      const prisma = getPrisma();
      const body = loginRequestSchema.parse(request.body ?? {});
      const user = await authenticateUser(prisma, body.duelistId, body.password);
      const session = await createSessionForUser(prisma, user.id, {
        rememberDevice: body.rememberDevice,
        deviceLabel: body.deviceLabel ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });

      applySessionCookie(reply, session.sessionToken, session.expiresAt);
      return reply.send({ session: session.viewerSession });
    } catch (error) {
      return sendApiError(reply, error, "Login fehlgeschlagen.");
    }
  });

  app.post("/register", async (request, reply) => {
    try {
      const prisma = getPrisma();
      const body = registerRequestSchema.parse(request.body ?? {});
      const user = await registerUser(prisma, body);
      const session = await createSessionForUser(prisma, user.id, {
        rememberDevice: true,
        userAgent: request.headers["user-agent"] ?? null,
      });

      applySessionCookie(reply, session.sessionToken, session.expiresAt);
      return reply.status(201).send({ session: session.viewerSession });
    } catch (error) {
      return sendApiError(reply, error, "Registrierung fehlgeschlagen.");
    }
  });

  app.post("/logout", async (request, reply) => {
    try {
      await destroyCurrentSession(request, getPrisma());
      clearSessionCookie(reply);
      return reply.send({ ok: true });
    } catch (error) {
      return sendApiError(reply, error, "Logout fehlgeschlagen.");
    }
  });

  app.post("/logout-all", async (request, reply) => {
    try {
      const session = await getViewerSession(request, getPrisma());

      if (session) {
        await destroyAllSessionsForUser(session.userId, getPrisma());
      }

      clearSessionCookie(reply);
      return reply.send({ ok: true });
    } catch (error) {
      return sendApiError(reply, error, "Session-Reset fehlgeschlagen.");
    }
  });
};

export default authRoutes;
