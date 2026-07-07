import { NextResponse } from "next/server";
import type { ActiveRunResponse } from "@ygo/contracts";
import { updateActiveRunRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  getActiveRun,
  getOrCreateWallet,
  serializeRun,
  serializeWallet,
  setActiveRun,
} from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/runs/active");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const run = await getActiveRun(prisma, session.userId);
    const wallet = await getOrCreateWallet(prisma, {
      runId: run.id,
      userId: session.userId,
    });

    return NextResponse.json({
      run: serializeRun(run, session.userId),
      wallet: serializeWallet(wallet),
    } satisfies ActiveRunResponse);
  } catch (error) {
    return toNextErrorResponse(error, "Aktive Kampagne konnte nicht geladen werden.");
  }
}

export async function PUT(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/runs/active");
  }

  try {
    requireSameOriginMutation(
      request,
      "Aktive Kampagne muss aus der App heraus gesetzt werden.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = updateActiveRunRequestSchema.parse(await request.json());
    const run = await setActiveRun(prisma, {
      runId: body.runId,
      userId: session.userId,
    });
    const wallet = await getOrCreateWallet(prisma, {
      runId: run.id,
      userId: session.userId,
    });

    return NextResponse.json({
      run: serializeRun(run, session.userId),
      wallet: serializeWallet(wallet),
    } satisfies ActiveRunResponse);
  } catch (error) {
    return toNextErrorResponse(error, "Aktive Kampagne konnte nicht gesetzt werden.");
  }
}
