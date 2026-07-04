import { NextResponse } from "next/server";
import { saveCollectionBinderPageRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { saveCollectionBinderPage } from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ binderId: string; pageId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { binderId, pageId } = await context.params;

    return proxyApiRoute(
      request,
      `/api/v1/collection/binders/${binderId}/pages/${pageId}`,
    );
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { binderId, pageId } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const body = saveCollectionBinderPageRequestSchema.parse(rawBody);
    const page = await saveCollectionBinderPage(
      prisma,
      session.userId,
      binderId,
      pageId,
      body.slots,
    );

    return NextResponse.json({ page });
  } catch (error) {
    return toNextErrorResponse(error, "Binder-Seite konnte nicht gespeichert werden.");
  }
}
