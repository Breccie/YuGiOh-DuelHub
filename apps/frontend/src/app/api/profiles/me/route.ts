import { NextResponse } from "next/server";
import { updateProfileRequestSchema } from "@ygo/contracts";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { getPrisma } from "@/lib/prisma";

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

    const updated = await prisma.user.update({
      where: {
        id: session.userId,
      },
      data: {
        displayName: body.displayName,
        bio: body.bio === undefined ? undefined : body.bio?.trim() || null,
        favoriteEra:
          body.favoriteEra === undefined ? undefined : body.favoriteEra?.trim() || null,
        avatarKey: body.avatarKey,
        isPublic: body.isPublic,
        showcaseBinderId:
          body.showcaseBinderId === undefined
            ? undefined
            : body.showcaseBinderId?.trim() || null,
      },
      select: {
        id: true,
        duelistId: true,
        displayName: true,
        bio: true,
        favoriteEra: true,
        avatarKey: true,
        isPublic: true,
        showcaseBinderId: true,
      },
    });

    return NextResponse.json({
      profile: updated,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Profil konnte nicht aktualisiert werden.");
  }
}
