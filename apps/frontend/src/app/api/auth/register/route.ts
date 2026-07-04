import { NextResponse } from "next/server";
import { registerRequestSchema } from "@ygo/contracts";
import {
  applySessionCookie,
  createSessionForUser,
  ensureMirroredUser,
  getSessionTokenFromSetCookieHeader,
  registerUser,
  syncSessionTokenForUser,
} from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import type { ViewerSession } from "@/lib/app-dtos";
import {
  fetchApiRoute,
  shouldProxyToApiService,
  toProxiedNextResponse,
} from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = registerRequestSchema.parse(rawBody);

    if (shouldProxyToApiService()) {
      const serviceResponse = await fetchApiRoute(
        new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(body),
        }),
        "/api/v1/auth/register",
      );

      if (!serviceResponse.ok) {
        return toProxiedNextResponse(serviceResponse);
      }

      const payload = (await serviceResponse.json()) as { session: ViewerSession };
      const sessionToken = getSessionTokenFromSetCookieHeader(
        serviceResponse.headers.get("set-cookie"),
      );

      if (!payload.session || !sessionToken) {
        throw new Error("API-Registrierung hat keine nutzbare Session zurückgegeben.");
      }

      const prisma = getPrisma();
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
      const response = NextResponse.json(
        {
          session: mirroredSession.viewerSession,
        },
        { status: serviceResponse.status },
      );

      applySessionCookie(response, sessionToken, mirroredSession.expiresAt);

      return response;
    }

    const prisma = getPrisma();
    const user = await registerUser(prisma, body);
    const createdSession = await createSessionForUser(prisma, user.id, {
      rememberDevice: true,
      deviceLabel: "Desktop App",
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json(
      {
        session: createdSession.viewerSession,
      },
      { status: 201 },
    );

    applySessionCookie(response, createdSession.sessionToken, createdSession.expiresAt);

    return response;
  } catch (error) {
    return toNextErrorResponse(error, "Registrierung fehlgeschlagen.");
  }
}
