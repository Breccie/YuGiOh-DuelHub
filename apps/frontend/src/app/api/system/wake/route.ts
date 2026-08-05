import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-service-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const WAKE_TIMEOUT_MS = 55_000;

export async function GET() {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return NextResponse.json(
      { ready: true, mode: "desktop", retryAfterSeconds: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(new URL("ready", apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          ready: false,
          mode: "online",
          retryAfterSeconds: 3,
          detail: "Der API-Service startet noch.",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "3" },
        },
      );
    }

    return NextResponse.json(
      { ready: true, mode: "online", retryAfterSeconds: 0, api: payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        mode: "online",
        retryAfterSeconds: 3,
        detail:
          error instanceof Error
            ? error.message
            : "Der API-Service konnte noch nicht gestartet werden.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "3" },
      },
    );
  }
}
