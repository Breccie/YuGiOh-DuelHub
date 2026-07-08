import { NextResponse } from "next/server";
import { loginRequestSchema } from "@ygo/contracts";
import {
  applySessionCookie,
  authenticateUser,
  createSessionForUser,
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
    const body = loginRequestSchema.parse(rawBody);

    if (shouldProxyToApiService()) {
      const serviceResponse = await fetchApiRoute(
        new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(body),
        }),
        "/api/v1/auth/login",
      );

      return toProxiedNextResponse(serviceResponse);
    }

    const prisma = getPrisma();
    const user = await authenticateUser(prisma, body.duelistId, body.password);
    const createdSession = await createSessionForUser(prisma, user.id, {
      rememberDevice: body.rememberDevice ?? false,
      deviceLabel: body.deviceLabel ?? "Desktop App",
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json(
      {
        session: createdSession.viewerSession,
      },
      { status: 200 },
    );

    applySessionCookie(response, createdSession.sessionToken, createdSession.expiresAt);

    return response;
  } catch (error) {
    return toNextErrorResponse(error, "Login fehlgeschlagen.");
  }
}
