import "server-only";

export const appModes = ["desktop-demo", "online-dev", "production"] as const;
export type AppMode = (typeof appModes)[number];

function isAppMode(value: string): value is AppMode {
  return appModes.includes(value as AppMode);
}

export function getAppMode(env: NodeJS.ProcessEnv = process.env): AppMode {
  const rawMode = env.APP_MODE?.trim();

  if (rawMode && isAppMode(rawMode)) {
    return rawMode;
  }

  if (env.VERCEL || env.NODE_ENV === "production") {
    return "production";
  }

  return "desktop-demo";
}

export function isOnlineAppMode(mode: AppMode = getAppMode()) {
  return mode === "online-dev" || mode === "production";
}

export function getConfiguredApiBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const rawUrl = env.API_BASE_URL?.trim();

  if (!rawUrl && (env.VERCEL || env.NODE_ENV === "production")) {
    return "https://yugioh-duel-hub-api.onrender.com/";
  }

  if (!rawUrl) {
    return null;
  }

  return rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`;
}

export function getFrontendRuntimeStatus(env: NodeJS.ProcessEnv = process.env) {
  const mode = getAppMode(env);
  const apiBaseUrl = getConfiguredApiBaseUrl(env);
  const issues: string[] = [];

  if (isOnlineAppMode(mode) && !apiBaseUrl) {
    issues.push("API_BASE_URL ist im Online-Modus erforderlich.");
  }

  return {
    mode,
    apiBaseUrl,
    onlineMode: isOnlineAppMode(mode),
    ready: issues.length === 0,
    issues,
  };
}
