import { NextResponse } from "next/server";
import { updateCollectionBinderRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { binderCoverCatalog } from "@/lib/collection-showcase-config";
import { getPrisma } from "@/lib/prisma";
import { deleteEmptyCollectionBinder, updateCollectionBinder } from "@/lib/collection-showcase";

function parseBinderCoverKey(coverKey: string) {
  const match = binderCoverCatalog.find((cover) => cover.key === coverKey);

  if (!match) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        message: "Ungültiges Binder-Cover.",
        path: ["coverKey"],
      },
    ]);
  }

  return match.key;
}

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ binderId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { binderId } = await context.params;

    return proxyApiRoute(request, `/api/v1/collection/binders/${binderId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { binderId } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const body = updateCollectionBinderRequestSchema.parse(rawBody);
    const binder = await updateCollectionBinder(prisma, session.userId, binderId, {
      ...body,
      coverKey: body.coverKey ? parseBinderCoverKey(body.coverKey) : undefined,
    });

    return NextResponse.json({ binder });
  } catch (error) {
    return toNextErrorResponse(error, "Binder konnte nicht aktualisiert werden.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ binderId: string }> },
) {
  const { binderId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/collection/binders/${binderId}`);
  }

  try {
    requireSameOriginMutation(request, "Binder müssen aus der App heraus gelöscht werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(
      await deleteEmptyCollectionBinder(prisma, session.userId, binderId),
    );
  } catch (error) {
    return toNextErrorResponse(error, "Binder konnte nicht gelöscht werden.");
  }
}
