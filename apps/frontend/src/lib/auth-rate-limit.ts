import "server-only";

import { DomainError } from "@ygo/domain";

type AuthAction = "login" | "register";

type AttemptWindow = {
  count: number;
  resetAt: number;
};

const LIMITS: Record<AuthAction, { max: number; windowMs: number }> = {
  login: { max: 10, windowMs: 60_000 },
  register: { max: 5, windowMs: 60 * 60_000 },
};
const MAX_TRACKED_CLIENTS = 10_000;

const globalRateLimitState = globalThis as typeof globalThis & {
  __duelHubAuthAttempts?: Map<string, AttemptWindow>;
};

const attempts =
  globalRateLimitState.__duelHubAuthAttempts ??
  new Map<string, AttemptWindow>();

globalRateLimitState.__duelHubAuthAttempts = attempts;

function getClientAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function pruneExpiredWindows(now: number) {
  if (attempts.size < MAX_TRACKED_CLIENTS) {
    return;
  }

  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) {
      attempts.delete(key);
    }
  }
}

export function requireAuthRateLimit(request: Request, action: AuthAction) {
  const now = Date.now();
  const limit = LIMITS[action];
  const key = `${action}:${getClientAddress(request)}`;
  const current = attempts.get(key);

  pruneExpiredWindows(now);

  if (!current || current.resetAt <= now) {
    attempts.set(key, {
      count: 1,
      resetAt: now + limit.windowMs,
    });
    return;
  }

  if (current.count >= limit.max) {
    throw new DomainError({
      code: "rate_limit_exceeded",
      message: "Zu viele Versuche. Bitte später erneut probieren.",
      status: 429,
      details: {
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      },
    });
  }

  current.count += 1;
}

export function resetAuthRateLimitsForTests() {
  attempts.clear();
}
