import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const buildSha = process.env.DUEL_HUB_BUILD_SHA?.trim() || "development";
  const buildTime = process.env.DUEL_HUB_BUILD_TIME?.trim() || "unknown";

  return NextResponse.json(
    { buildSha, buildTime, service: "ygo-frontend" },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Duel-Hub-Frontend-Build": buildSha,
      },
    },
  );
}
