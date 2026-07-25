import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { listCustomPackTemplates } from "@/lib/custom-pack-service";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/runs/custom-pack-templates");
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await listCustomPackTemplates(prisma, session.userId));
  } catch (error) {
    return toNextErrorResponse(error, "Private Packvorlagen konnten nicht geladen werden.");
  }
}
