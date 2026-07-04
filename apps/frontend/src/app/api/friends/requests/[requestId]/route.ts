import { NextResponse } from "next/server";
import { friendRequestDecisionSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { respondToFriendRequest } from "@/lib/friend-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { requestId } = await context.params;
    return proxyApiRoute(request, `/api/v1/friends/requests/${requestId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { requestId } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const body = friendRequestDecisionSchema.parse(rawBody);
    const result = await respondToFriendRequest(
      prisma,
      session.userId,
      requestId,
      body.action,
    );

    return NextResponse.json({
      request: result,
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
          error instanceof Error
            ? error.message
            : "Freundschaftsanfrage konnte nicht aktualisiert werden.",
      },
      { status },
    );
  }
}
