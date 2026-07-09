import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma, PrismaClient } from "../../generated/prisma";
import type { ViewerSession } from "../../../../packages/contracts/src";
import {
  DomainError,
  hashPassword,
  hashSessionToken,
  normalizeDuelistId,
  verifyPassword,
} from "../../../../packages/domain/src";
import { getPrisma } from "./prisma";

const SESSION_COOKIE_NAME = "duelhub_session";
const SHORT_SESSION_MS = 1000 * 60 * 60 * 12;
const REMEMBERED_SESSION_MS = 1000 * 60 * 60 * 24 * 30;

type SessionRecord = Prisma.SessionGetPayload<{
  include: {
    user: true;
  };
}>;

function toViewerSession(record: SessionRecord): ViewerSession {
  return {
    sessionId: record.id,
    userId: record.userId,
    duelistId: record.user.duelistId,
    displayName: record.user.displayName,
    avatarKey: record.user.avatarKey,
    favoriteEra: record.user.favoriteEra ?? null,
    isPublic: record.user.isPublic,
    showcaseBinderId: record.user.showcaseBinderId ?? null,
    expiresAt: record.expiresAt.toISOString(),
    rememberDevice: record.rememberDevice,
    deviceLabel: record.deviceLabel ?? null,
  };
}

export async function getViewerSession(
  request: FastifyRequest,
  prisma: PrismaClient = getPrisma(),
) {
  const sessionToken = request.cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(sessionToken),
    },
    include: {
      user: true,
    },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const now = Date.now();
  const lastSeenAt = session.lastSeenAt?.getTime() ?? 0;

  if (now - lastSeenAt > 1000 * 60 * 5) {
    await prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        lastSeenAt: new Date(now),
      },
    });
  }

  return toViewerSession(session);
}

export async function requireViewerSession(
  request: FastifyRequest,
  prisma: PrismaClient = getPrisma(),
) {
  const session = await getViewerSession(request, prisma);

  if (!session) {
    throw new DomainError({
      code: "unauthorized",
      message: "Bitte zuerst mit deiner Duelist-ID anmelden.",
      status: 401,
    });
  }

  return session;
}

export async function authenticateUser(
  prisma: PrismaClient,
  duelistId: string,
  password: string,
) {
  const user = await prisma.user.findUnique({
    where: {
      duelistId: normalizeDuelistId(duelistId),
    },
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new DomainError({
      code: "invalid_credentials",
      message: "Duelist-ID oder Passwort ist nicht korrekt.",
      status: 401,
    });
  }

  return user;
}

export async function registerUser(
  prisma: PrismaClient,
  input: {
    duelistId: string;
    password: string;
    displayName: string;
    favoriteEra?: string | null;
  },
) {
  const normalizedDuelistId = normalizeDuelistId(input.duelistId);
  const displayName = input.displayName.trim();

  if (!normalizedDuelistId) {
    throw new DomainError({
      code: "invalid_duelist_id",
      message: "Bitte eine Duelist-ID angeben.",
      status: 400,
    });
  }

  if (!displayName) {
    throw new DomainError({
      code: "invalid_display_name",
      message: "Bitte einen Anzeigenamen angeben.",
      status: 400,
    });
  }

  if (input.password.trim().length < 6) {
    throw new DomainError({
      code: "invalid_password",
      message: "Das Passwort muss mindestens 6 Zeichen haben.",
      status: 400,
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      duelistId: normalizedDuelistId,
    },
  });

  if (existingUser) {
    throw new DomainError({
      code: "duelist_id_taken",
      message: "Diese Duelist-ID ist bereits vergeben.",
      status: 409,
    });
  }

  return prisma.user.create({
    data: {
      duelistId: normalizedDuelistId,
      passwordHash: hashPassword(input.password),
      displayName,
      favoriteEra: input.favoriteEra?.trim() || null,
      bio: null,
      isPublic: true,
    },
  });
}

export async function createSessionForUser(
  prisma: PrismaClient,
  userId: string,
  options?: {
    rememberDevice?: boolean;
    deviceLabel?: string | null;
    userAgent?: string | null;
  },
) {
  const rememberDevice = options?.rememberDevice ?? false;
  const sessionToken = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + (rememberDevice ? REMEMBERED_SESSION_MS : SHORT_SESSION_MS),
  );

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(sessionToken),
      deviceLabel: options?.deviceLabel?.trim() || null,
      userAgent: options?.userAgent?.trim() || null,
      rememberDevice,
      expiresAt,
      lastSeenAt: new Date(),
    },
    include: {
      user: true,
    },
  });

  return {
    sessionToken,
    viewerSession: toViewerSession(session),
    expiresAt,
  };
}

export async function destroyCurrentSession(
  request: FastifyRequest,
  prisma: PrismaClient = getPrisma(),
) {
  const sessionToken = request.cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: hashSessionToken(sessionToken),
    },
  });
}

export async function destroyAllSessionsForUser(
  userId: string,
  prisma: PrismaClient = getPrisma(),
) {
  await prisma.session.deleteMany({
    where: {
      userId,
    },
  });
}

export function applySessionCookie(
  reply: FastifyReply,
  sessionToken: string,
  expiresAt: Date,
) {
  reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
