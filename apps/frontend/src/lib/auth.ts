import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  hashPassword,
  hashSessionToken,
  normalizeDuelistId,
  verifyPassword,
} from "@ygo/domain";
import type { ViewerSession } from "@/lib/app-dtos";
import { getPrisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "duelhub_session";
const SHORT_SESSION_MS = 1000 * 60 * 60 * 12;
const REMEMBERED_SESSION_MS = 1000 * 60 * 60 * 24 * 30;

type SessionRecord = Prisma.SessionGetPayload<{
  include: {
    user: true;
  };
}>;

export class AuthError extends Error {
  status: number;

  constructor(message = "Bitte zuerst mit deiner Duelist-ID anmelden.", status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

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

async function getSessionTokenFromCookieStore() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function getSessionTokenFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return null;
  }

  return sessionCookie.slice(SESSION_COOKIE_NAME.length + 1) || null;
}

export function getSessionTokenFromSetCookieHeader(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return null;
  }

  const match = setCookieHeader.match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
  );

  return match?.[1] ?? null;
}

export async function getViewerSession(prisma: PrismaClient = getPrisma()) {
  const sessionToken = await getSessionTokenFromCookieStore();

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

  return toViewerSession(session);
}

export async function requireViewerSession(prisma: PrismaClient = getPrisma()) {
  const session = await getViewerSession(prisma);

  if (!session) {
    throw new AuthError();
  }

  return session;
}

export async function requireViewerUser(prisma: PrismaClient = getPrisma()) {
  const session = await requireViewerSession(prisma);
  const user = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
  });

  if (!user) {
    throw new AuthError();
  }

  return user;
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
    throw new AuthError("Duelist-ID oder Passwort ist nicht korrekt.", 401);
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
    throw new AuthError("Bitte eine Duelist-ID angeben.", 400);
  }

  if (!displayName) {
    throw new AuthError("Bitte einen Anzeigenamen angeben.", 400);
  }

  if (input.password.trim().length < 6) {
    throw new AuthError("Das Passwort muss mindestens 6 Zeichen haben.", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      duelistId: normalizedDuelistId,
    },
  });

  if (existingUser) {
    throw new AuthError("Diese Duelist-ID ist bereits vergeben.", 409);
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

export async function ensureMirroredUser(
  prisma: PrismaClient,
  input: {
    duelistId: string;
    displayName: string;
    favoriteEra?: string | null;
    avatarKey?: string | null;
    isPublic?: boolean;
    showcaseBinderId?: string | null;
  },
) {
  const duelistId = normalizeDuelistId(input.duelistId);

  return prisma.user.upsert({
    where: {
      duelistId,
    },
    update: {
      displayName: input.displayName.trim() || duelistId,
      favoriteEra: input.favoriteEra?.trim() || null,
      avatarKey: input.avatarKey?.trim() || "apprentice-sigil",
      isPublic: input.isPublic ?? true,
      showcaseBinderId: input.showcaseBinderId ?? null,
    },
    create: {
      duelistId,
      passwordHash: hashPassword(crypto.randomUUID()),
      displayName: input.displayName.trim() || duelistId,
      favoriteEra: input.favoriteEra?.trim() || null,
      avatarKey: input.avatarKey?.trim() || "apprentice-sigil",
      bio: null,
      isPublic: input.isPublic ?? true,
      showcaseBinderId: input.showcaseBinderId ?? null,
    },
  });
}

export async function syncSessionTokenForUser(
  prisma: PrismaClient,
  userId: string,
  sessionToken: string,
  options: {
    expiresAt: Date;
    rememberDevice?: boolean;
    deviceLabel?: string | null;
    userAgent?: string | null;
  },
) {
  const session = await prisma.session.upsert({
    where: {
      tokenHash: hashSessionToken(sessionToken),
    },
    update: {
      userId,
      deviceLabel: options.deviceLabel?.trim() || null,
      userAgent: options.userAgent?.trim() || null,
      rememberDevice: options.rememberDevice ?? false,
      expiresAt: options.expiresAt,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      tokenHash: hashSessionToken(sessionToken),
      deviceLabel: options.deviceLabel?.trim() || null,
      userAgent: options.userAgent?.trim() || null,
      rememberDevice: options.rememberDevice ?? false,
      expiresAt: options.expiresAt,
      lastSeenAt: new Date(),
    },
    include: {
      user: true,
    },
  });

  return {
    viewerSession: toViewerSession(session),
    expiresAt: session.expiresAt,
  };
}

export async function destroyCurrentSession(prisma: PrismaClient = getPrisma()) {
  const sessionToken = await getSessionTokenFromCookieStore();

  if (!sessionToken) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: hashSessionToken(sessionToken),
    },
  });
}

export function applySessionCookie(
  response: NextResponse,
  sessionToken: string,
  expiresAt: Date,
) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export async function listRecentAccounts(prisma: PrismaClient = getPrisma()) {
  return prisma.user.findMany({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      duelistId: true,
      displayName: true,
      favoriteEra: true,
    },
    take: 6,
  });
}
