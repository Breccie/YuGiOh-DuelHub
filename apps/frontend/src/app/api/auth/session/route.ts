import { NextResponse } from "next/server";
import type { ViewerSession } from "@/lib/app-dtos";
import {
  ensureMirroredUser,
  getSessionTokenFromCookieHeader,
  getViewerSession,
  syncSessionTokenForUser,
} from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import {
  fetchApiRoute,
  shouldProxyToApiService,
  toProxiedNextResponse,
} from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const prisma = getPrisma();

    if (shouldProxyToApiService()) {
      const localSession = await getViewerSession(prisma);

      if (localSession) {
        return NextResponse.json({
          session: localSession,
        });
      }

      const serviceResponse = await fetchApiRoute(request, "/api/v1/auth/session");

      if (!serviceResponse.ok) {
        return toProxiedNextResponse(serviceResponse);
      }

      const payload = (await serviceResponse.json()) as { session: ViewerSession | null };

      if (!payload.session) {
        return NextResponse.json({
          session: null,
        });
      }

      const sessionToken = getSessionTokenFromCookieHeader(request.headers.get("cookie"));

      if (!sessionToken) {
        return NextResponse.json({
          session: null,
        });
      }

      const localUser = await ensureMirroredUser(prisma, payload.session);
      const mirroredSession = await syncSessionTokenForUser(
        prisma,
        localUser.id,
        sessionToken,
        {
          expiresAt: new Date(payload.session.expiresAt),
          rememberDevice: payload.session.rememberDevice,
          deviceLabel: payload.session.deviceLabel,
          userAgent: request.headers.get("user-agent"),
        },
      );

      return NextResponse.json({
        session: mirroredSession.viewerSession,
      });
    }

    const session = await getViewerSession(prisma);

    return NextResponse.json({
      session,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Session konnte nicht geladen werden.");
  }
}
