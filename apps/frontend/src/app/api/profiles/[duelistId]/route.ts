import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getPublicProfileByDuelistId } from "@/lib/profile-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ duelistId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { duelistId } = await context.params;
    return proxyApiRoute(request, `/api/v1/profiles/${encodeURIComponent(duelistId)}`);
  }

  try {
    const prisma = getPrisma();
    const session = await getViewerSession(prisma);
    const { duelistId } = await context.params;
    const profile = await getPublicProfileByDuelistId(
      prisma,
      duelistId,
      session?.userId ?? null,
    );

    return NextResponse.json({
      profile,
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message.includes("nicht")
        ? 404
        : error instanceof Error && error.message.includes("nicht öffentlich")
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Profil konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
