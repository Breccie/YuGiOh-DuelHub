import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getCollectionBinderEditorSnapshot } from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ binderId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { binderId } = await context.params;

    return proxyApiRoute(request, `/api/v1/collection/binders/${binderId}/editor`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { binderId } = await context.params;
    const snapshot = await getCollectionBinderEditorSnapshot(
      prisma,
      session.userId,
      binderId,
    );

    return NextResponse.json(snapshot);
  } catch (error) {
    const status =
      error instanceof Error && error.message.includes("nicht gefunden")
        ? 404
        : error instanceof Error && "status" in error
          ? Number((error as { status: number }).status)
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Binder-Editor konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
