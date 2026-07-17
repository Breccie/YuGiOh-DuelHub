import { NextResponse } from "next/server";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { openCustomPackVersion } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

const bodySchema = z.object({ seed: z.string().trim().min(1).max(200).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const runId = new URL(request.url).searchParams.get("runId")?.trim() ?? "";
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/custom-packs/versions/${versionId}/open`);
  try {
    requireSameOriginMutation(request, "Custom Packs müssen aus der App geöffnet werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await openCustomPackVersion(prisma, session.userId, runId, versionId, body.seed), { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Custom Pack konnte nicht geöffnet werden.");
  }
}
