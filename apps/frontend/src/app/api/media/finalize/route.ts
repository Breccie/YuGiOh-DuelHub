import { NextResponse } from "next/server";
import { finalizeMediaUploadRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { finalizeMediaUpload } from "@/lib/media-service";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (shouldProxyToApiService()) return proxyApiRoute(request, "/api/v1/media/finalize");
  try {
    requireSameOriginMutation(request, "Uploads müssen aus der App erfolgen.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = finalizeMediaUploadRequestSchema.parse(await request.json());
    return NextResponse.json(await finalizeMediaUpload(prisma, session.userId, body.uploadToken), { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Das Bild konnte nicht verarbeitet werden.");
  }
}
