import { NextResponse } from "next/server";
import { openPackRequestSchema } from "@ygo/contracts";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { openPack, getPackDashboardSnapshot } from "@/lib/pack-openings";
import { getPrisma } from "@/lib/prisma";
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

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/packs/openings");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const snapshot = await getPackDashboardSnapshot(
      prisma,
      session.userId,
      activeRun.id,
    );

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load pack opening snapshot.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/packs/openings");
  }

  try {
    if (!isSameOriginMutation(request)) {
      return NextResponse.json(
        { error: "Pack openings must be requested from the app origin." },
        { status: 403 },
      );
    }

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = openPackRequestSchema.parse(rawBody);
    const activeRun = await getActiveRun(prisma, session.userId);
    const opening = await openPack(prisma, {
      viewerId: session.userId,
      runId: activeRun.id,
      setId: body.setId,
    });

    return NextResponse.json({ opening }, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Pack konnte nicht geöffnet werden.");
  }
}
