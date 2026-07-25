export function assertDestructiveBaseSeedAllowed(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.APP_MODE?.trim() === "production" || env.NODE_ENV === "production") {
    throw new Error(
      "Der destruktive Base-Seed darf niemals in Produktion ausgeführt werden.",
    );
  }

  if (env.ALLOW_DESTRUCTIVE_BASE_SEED !== "1") {
    throw new Error(
      "Der Base-Seed löscht Anwendungsdaten. Setze ALLOW_DESTRUCTIVE_BASE_SEED=1 nur für eine entbehrliche lokale Datenbank.",
    );
  }
}
