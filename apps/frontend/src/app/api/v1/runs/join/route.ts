import { NextResponse } from "next/server";
import type { ActiveRunResponse } from "@ygo/contracts";
import { joinRunRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  getOrCreateWallet,
  joinRunByInviteCode,
  serializeRun,
  serializeWallet,
} from "@/lib/run-service";

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/runs/join");
  }

  try {
    requireSameOriginMutation(request, "Kampagnenbeitritt muss aus der App erfolgen.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = joinRunRequestSchema.parse(await request.json());
    const run = await joinRunByInviteCode(prisma, session.userId, body.inviteCode);
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
    return toNextErrorResponse(error, "Kampagne konnte nicht beigetreten werden.");
  }
}
