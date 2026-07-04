import { NextResponse } from "next/server";
import type { ActiveRunResponse, RunPromosResponse } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import {
  fetchApiService,
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRunPromos } from "@/lib/progression-service";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    try {
      const activeRun = await fetchApiServiceJson<ActiveRunResponse>(
        "/api/v1/runs/active",
        {
          cookieHeader: request.headers.get("cookie"),
          userAgent: request.headers.get("user-agent"),
        },
      );
      const response = await fetchApiService(
        `/api/v1/runs/${activeRun.run.id}/promos`,
        {
          cookieHeader: request.headers.get("cookie"),
          userAgent: request.headers.get("user-agent"),
        },
      );

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      return toNextErrorResponse(error, "Promo-Karten konnten nicht geladen werden.");
    }
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const payload: RunPromosResponse = await getRunPromos(
      prisma,
      session.userId,
      activeRun.id,
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Promo-Karten konnten nicht geladen werden.");
  }
}
