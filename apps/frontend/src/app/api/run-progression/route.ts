import { NextResponse } from "next/server";
import type { ActiveRunResponse, RunProgressionResponse } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import {
  fetchApiService,
  fetchApiServiceJson,
  shouldProxyToApiService,
  toProxiedNextResponse,
} from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRunProgression } from "@/lib/progression-service";
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
        `/api/v1/runs/${activeRun.run.id}/progression`,
        {
          cookieHeader: request.headers.get("cookie"),
          userAgent: request.headers.get("user-agent"),
        },
      );

      return toProxiedNextResponse(response);
    } catch (error) {
      return toNextErrorResponse(error, "Run-Fortschritt konnte nicht geladen werden.");
    }
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const payload: RunProgressionResponse = await getRunProgression(
      prisma,
      session.userId,
      activeRun.id,
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Run-Fortschritt konnte nicht geladen werden.");
  }
}
