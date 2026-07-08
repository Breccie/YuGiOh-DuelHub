import { NextResponse } from "next/server";
import { registerRequestSchema } from "@ygo/contracts";
import {
  applySessionCookie,
  createSessionForUser,
  registerUser,
} from "@/lib/auth";
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

      return toProxiedNextResponse(serviceResponse);
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
