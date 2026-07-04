import { NextResponse } from "next/server";
import { duelActionRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import {
  respondToDuelRequest,
  scheduleDuelRequest,
} from "@/lib/duel-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ duelRequestId: string }> },
) {
  const { duelRequestId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/duels/${duelRequestId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = duelActionRequestSchema.parse(rawBody);

    const duel =
      body.action === "schedule"
        ? await scheduleDuelRequest(prisma, session.userId, duelRequestId, body)
        : await respondToDuelRequest(prisma, session.userId, duelRequestId, body.action);

    return NextResponse.json({
      duel,
    });
  } catch (error) {
    const status =
      error instanceof z.ZodError
        ? 400
        : error instanceof Error && "status" in error
          ? Number((error as { status: number }).status)
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Duellanfrage konnte nicht aktualisiert werden.",
      },
      { status },
    );
  }
}
