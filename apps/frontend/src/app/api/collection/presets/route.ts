import { NextResponse } from "next/server";
import { createCollectionPresetRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import {
  createCollectionPreset,
  getCollectionShowcaseSnapshot,
} from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/collection/presets");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const snapshot = await getCollectionShowcaseSnapshot(prisma, session.userId);

    return NextResponse.json({
      presets: snapshot.presets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Presets konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/collection/presets");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createCollectionPresetRequestSchema.parse(rawBody);
    const preset = await createCollectionPreset(prisma, session.userId, body);

    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Preset konnte nicht erstellt werden.");
  }
}
