import { NextResponse } from "next/server";
import { createCustomPackRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { createCustomPack, listCustomPacks } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function requireRunId(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId")?.trim();
  if (!runId) throw new Error("Kampagne fehlt.");
  return runId;
}

export async function GET(request: Request) {
  const runId = requireRunId(request);
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/custom-packs`);
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await listCustomPacks(prisma, session.userId, runId));
  } catch (error) {
    return toNextErrorResponse(error, "Custom Packs konnten nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  const runId = requireRunId(request);
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/custom-packs`);
  try {
    requireSameOriginMutation(request, "Custom Packs müssen aus der App erstellt werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = createCustomPackRequestSchema.parse(await request.json());
    return NextResponse.json(await createCustomPack(prisma, session.userId, runId, body), { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Custom Pack konnte nicht erstellt werden.");
  }
}
