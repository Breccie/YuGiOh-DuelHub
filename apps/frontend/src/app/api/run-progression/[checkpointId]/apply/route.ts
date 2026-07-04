import { NextResponse } from "next/server";
import type {
  ActiveRunResponse,
  ApplyRunProgressionResponse,
} from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import {
  fetchApiService,
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { applyProgressionCheckpoint } from "@/lib/progression-service";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ checkpointId: string }> },
) {
  const { checkpointId } = await params;

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
        `/api/v1/runs/${activeRun.run.id}/progression/${checkpointId}/apply`,
        {
          method: "POST",
          cookieHeader: request.headers.get("cookie"),
          userAgent: request.headers.get("user-agent"),
        },
      );

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      return toNextErrorResponse(error, "Run-Fortschritt konnte nicht angewendet werden.");
    }
  }

  try {
    if (!isSameOriginMutation(request)) {
      return NextResponse.json(
        { error: "Progression-Mutationen muessen aus der App heraus kommen." },
        { status: 403 },
      );
    }

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const payload: ApplyRunProgressionResponse = await applyProgressionCheckpoint(
      prisma,
      session.userId,
      activeRun.id,
      checkpointId,
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Run-Fortschritt konnte nicht angewendet werden.");
  }
}
