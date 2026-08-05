const appModes = ["desktop-demo", "online-dev", "production"] as const;
type AppMode = (typeof appModes)[number];

export const DATABASE_SCHEMA_VERSION = "20260804210000_personal_media_assets";

export type ApiBuildMetadata = {
  buildSha: string;
  buildTime: string;
  schemaVersion: string;
  region: string;
};

export function getApiBuildMetadata(env: NodeJS.ProcessEnv = process.env): ApiBuildMetadata {
  return {
    buildSha: env.BUILD_SHA?.trim()
      || env.RENDER_GIT_COMMIT?.trim()
      || env.VERCEL_GIT_COMMIT_SHA?.trim()
      || "development",
    buildTime: env.BUILD_TIME?.trim() || "unknown",
    schemaVersion: env.SCHEMA_VERSION?.trim() || DATABASE_SCHEMA_VERSION,
    region: env.RENDER_REGION?.trim() || env.REGION?.trim() || "local",
  };
}

function isAppMode(value: string): value is AppMode {
  return appModes.includes(value as AppMode);
}

export function getApiAppMode(env: NodeJS.ProcessEnv = process.env): AppMode {
  const rawMode = env.APP_MODE?.trim();

  if (rawMode && isAppMode(rawMode)) {
    return rawMode;
  }

  return "online-dev";
}

export function getCookieSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.COOKIE_SECRET?.trim() || "duelhub-dev-cookie-secret";

  if (getApiAppMode(env) === "production" && secret.length < 32) {
    throw new Error("COOKIE_SECRET muss in production mindestens 32 Zeichen lang sein.");
  }

  return secret;
}

export function getAllowedCorsOrigins(env: NodeJS.ProcessEnv = process.env) {
  const rawOrigins = env.CORS_ORIGIN?.trim();

  if (!rawOrigins) {
    if (getApiAppMode(env) === "production") {
      throw new Error("CORS_ORIGIN muss in production explizit gesetzt sein.");
    }

    return ["http://127.0.0.1:3000", "http://localhost:3000"];
  }

  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (getApiAppMode(env) === "production" && origins.includes("*")) {
    throw new Error("CORS_ORIGIN darf in production kein Wildcard-Origin sein.");
  }

  return Array.from(new Set(origins));
}
