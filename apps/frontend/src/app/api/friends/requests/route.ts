import { NextResponse } from "next/server";
import { createFriendRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { createFriendRequest, listFriendRequests } from "@/lib/friend-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/friends/requests");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const requests = await listFriendRequests(prisma, session.userId);

    return NextResponse.json({
      requests,
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Freundschaftsanfragen konnten nicht geladen werden.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/friends/requests");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createFriendRequestSchema.parse(rawBody);
    const friendRequest = await createFriendRequest(prisma, session.userId, body.duelistId);

    return NextResponse.json(
      {
        request: friendRequest,
      },
      { status: 201 },
    );
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
            : "Freundschaftsanfrage konnte nicht erstellt werden.",
      },
      { status },
    );
  }
}
