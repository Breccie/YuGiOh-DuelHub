import { NextResponse } from "next/server";
import { getViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (shouldProxyToApiService()) {
      return proxyApiRoute(request, "/api/v1/auth/session");
    }

    const session = await getViewerSession(getPrisma());

    return NextResponse.json({
      session,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Session konnte nicht geladen werden.");
  }
}
