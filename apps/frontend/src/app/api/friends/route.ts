import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { listFriendRequests } from "@/lib/friend-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/friends");
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
        error: error instanceof Error ? error.message : "Freundesliste konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
