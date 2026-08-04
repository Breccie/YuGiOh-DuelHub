import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { createNextCustomPackDraft } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const runId = new URL(request.url).searchParams.get("runId")?.trim() ?? "";
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${encodeURIComponent(runId)}/custom-packs/versions/${encodeURIComponent(versionId)}/next-draft`);
  }
  try {
    requireSameOriginMutation(request, "Neue Packversionen müssen aus der App erstellt werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(
      await createNextCustomPackDraft(prisma, session.userId, runId, versionId),
      { status: 201 },
    );
  } catch (error) {
    return toNextErrorResponse(error, "Neue Packversion konnte nicht erstellt werden.");
  }
}
