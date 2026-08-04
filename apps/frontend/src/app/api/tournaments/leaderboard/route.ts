import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getCampaignLeaderboard } from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/tournaments/leaderboard");
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await getCampaignLeaderboard(prisma, session.userId));
  } catch (error) {
    return toNextErrorResponse(error, "Kampagnen-Rangliste konnte nicht geladen werden.");
  }
}
