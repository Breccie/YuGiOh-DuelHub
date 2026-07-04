import { NextResponse } from "next/server";
import {
  createCollectionBinderRequestSchema,
} from "@ygo/contracts";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { binderCoverCatalog } from "@/lib/collection-showcase-config";
import {
  createCollectionBinder,
  getCollectionShowcaseSnapshot,
} from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";

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

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/collection/binders");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const snapshot = await getCollectionShowcaseSnapshot(prisma, session.userId);

    return NextResponse.json({
      binders: snapshot.binders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Binder konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/collection/binders");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createCollectionBinderRequestSchema.parse(rawBody);
    const binder = await createCollectionBinder(prisma, session.userId, {
      ...body,
      coverKey: parseBinderCoverKey(body.coverKey),
    });

    return NextResponse.json({ binder }, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Binder konnte nicht erstellt werden.");
  }
}
