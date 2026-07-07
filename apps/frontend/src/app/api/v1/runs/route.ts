import { NextResponse } from "next/server";
import type { ActiveRunResponse, RunListResponse } from "@ygo/contracts";
import { createRunRequestSchema, runListResponseSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  createRun,
  getOrCreateWallet,
  listRuns,
  serializeRun,
  serializeWallet,
} from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/runs");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload = await listRuns(prisma, session.userId);

    return NextResponse.json(runListResponseSchema.parse(payload) satisfies RunListResponse);
  } catch (error) {
    return toNextErrorResponse(error, "Kampagnen konnten nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/runs");
  }

  try {
    requireSameOriginMutation(
      request,
      "Kampagnen muessen aus der App heraus erstellt werden.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = createRunRequestSchema.parse(await request.json());
    const run = await createRun(prisma, session.userId, body);
    const wallet = await getOrCreateWallet(prisma, {
      runId: run.id,
      userId: session.userId,
    });

    return NextResponse.json(
      {
        run: serializeRun(run, session.userId),
        wallet: serializeWallet(wallet),
      } satisfies ActiveRunResponse,
      { status: 201 },
    );
  } catch (error) {
    return toNextErrorResponse(error, "Kampagne konnte nicht erstellt werden.");
  }
}
