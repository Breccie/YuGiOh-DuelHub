import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { requireViewerSession } from "@/lib/auth";
import { copyCustomPackTemplateToRun } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  const runId = new URL(request.url).searchParams.get("runId") ?? "";
  if (shouldProxyToApiService()) {
    return proxyApiRoute(
      request,
      `/api/v1/runs/${encodeURIComponent(runId)}/custom-pack-templates/${encodeURIComponent(templateId)}/copy`,
    );
  }
  try {
    requireSameOriginMutation(request, "Packvorlagen müssen aus der App kopiert werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(
      await copyCustomPackTemplateToRun(prisma, session.userId, runId, templateId),
      { status: 201 },
    );
  } catch (error) {
    return toNextErrorResponse(error, "Packvorlage konnte nicht kopiert werden.");
  }
}
