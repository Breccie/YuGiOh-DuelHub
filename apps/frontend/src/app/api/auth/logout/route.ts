import { NextResponse } from "next/server";
import { clearSessionCookie, destroyCurrentSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import {
  fetchApiRoute,
  shouldProxyToApiService,
  toProxiedNextResponse,
} from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (shouldProxyToApiService()) {
      const serviceResponse = await fetchApiRoute(request, "/api/v1/auth/logout");

      if (!serviceResponse.ok) {
        return toProxiedNextResponse(serviceResponse);
      }
    }

    await destroyCurrentSession(getPrisma());
    const response = NextResponse.json({ ok: true });

    clearSessionCookie(response);

    return response;
  } catch (error) {
    return toNextErrorResponse(error, "Logout fehlgeschlagen.");
  }
}
