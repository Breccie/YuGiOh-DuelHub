import { NextResponse } from "next/server";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { requireViewerSession } from "@/lib/auth";
import { createCustomPackTemplate } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

const bodySchema = z.object({ name: z.string().trim().min(1).max(120).optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId: definitionId } = await params;
  const runId = new URL(request.url).searchParams.get("runId") ?? "";
  if (shouldProxyToApiService()) {
    return proxyApiRoute(
      request,
      `/api/v1/runs/${encodeURIComponent(runId)}/custom-packs/${encodeURIComponent(definitionId)}/template`,
    );
  }
  try {
    requireSameOriginMutation(request, "Packvorlagen müssen aus der App erstellt werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(
      await createCustomPackTemplate(
        prisma,
        session.userId,
        runId,
        definitionId,
        body.name,
      ),
      { status: 201 },
    );
  } catch (error) {
    return toNextErrorResponse(
      error,
      "Private Packvorlage konnte nicht erstellt werden.",
    );
  }
}
