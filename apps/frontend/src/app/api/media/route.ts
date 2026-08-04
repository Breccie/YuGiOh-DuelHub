import { NextResponse } from "next/server";
import { createMediaUploadIntentRequestSchema, mediaAssetKindSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { createMediaUploadIntent, listMediaAssets } from "@/lib/media-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/media${new URL(request.url).search}`);
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawKind = new URL(request.url).searchParams.get("kind") ?? undefined;
    const kind = rawKind ? mediaAssetKindSchema.parse(rawKind) : undefined;
    return NextResponse.json(await listMediaAssets(prisma, session.userId, kind));
  } catch (error) {
    return toNextErrorResponse(error, "Persönliche Designs konnten nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) return proxyApiRoute(request, "/api/v1/media/upload-intents");
  try {
    requireSameOriginMutation(request, "Uploads müssen aus der App erfolgen.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = createMediaUploadIntentRequestSchema.parse(await request.json());
    return NextResponse.json(await createMediaUploadIntent(prisma, session.userId, body), { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Der Bild-Upload konnte nicht vorbereitet werden.");
  }
}
