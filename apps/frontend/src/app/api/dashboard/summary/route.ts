import { NextResponse } from "next/server";
import { dashboardSummaryResponseSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { buildDashboardSummaryPayload } from "@/lib/home-dashboard-data";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/dashboard/summary");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload = await buildDashboardSummaryPayload(prisma, session.userId);

    return NextResponse.json(dashboardSummaryResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Dashboard-Summary konnte nicht geladen werden.");
  }
}
