import { NextResponse } from "next/server";
import { updateProfileRequestSchema } from "@ygo/contracts";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { getPrisma } from "@/lib/prisma";
import { updateViewerProfile } from "@/lib/profile-settings-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/profiles/me");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = updateProfileRequestSchema.parse(rawBody);

    const updated = await updateViewerProfile(prisma, session.userId, body);

    return NextResponse.json({
      profile: updated,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Profil konnte nicht aktualisiert werden.");
  }
}
