const frontendUrl = process.env.FRONTEND_URL?.trim()?.replace(/\/$/, "");
const apiUrl = process.env.API_URL?.trim()?.replace(/\/$/, "");
const expectedSha = process.env.EXPECTED_SHA?.trim();

if (!frontendUrl || !apiUrl || !expectedSha) {
  throw new Error("FRONTEND_URL, API_URL und EXPECTED_SHA sind erforderlich.");
}

async function readJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error(`${url} antwortete mit HTTP ${response.status}.`);
  }

  return { response, payload };
}

const [frontend, api] = await Promise.all([
  readJson(`${frontendUrl}/api/system/build`),
  readJson(`${apiUrl}/ready`),
]);

const failures = [];
const frontendHeader = frontend.response.headers.get("x-duel-hub-frontend-build");
const apiHeader = api.response.headers.get("x-duel-hub-build");

if (frontend.payload.buildSha !== expectedSha || frontendHeader !== expectedSha) {
  failures.push(`Frontend-SHA ist ${frontend.payload.buildSha}/${frontendHeader}.`);
}
if (api.payload.buildSha !== expectedSha || apiHeader !== expectedSha) {
  failures.push(`API-SHA ist ${api.payload.buildSha}/${apiHeader}.`);
}
if (api.payload.region !== "frankfurt") {
  failures.push(`API-Region ist ${api.payload.region}.`);
}
if (api.payload.buildTime === "unknown" || frontend.payload.buildTime === "unknown") {
  failures.push("Mindestens eine Buildzeit ist unbekannt.");
}
if (api.payload.database !== "reachable") {
  failures.push(`Datenbankstatus ist ${api.payload.database}.`);
}

if (failures.length > 0) {
  throw new Error(`Release-Verifikation fehlgeschlagen:\n- ${failures.join("\n- ")}`);
}

console.log(JSON.stringify({
  ok: true,
  expectedSha,
  frontend: frontend.payload,
  api: api.payload,
}, null, 2));
