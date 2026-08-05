import { NextResponse } from "next/server";
import {
  chooseStartingPackRequestSchema,
  startingPackChoiceResponseSchema,
} from "@ygo/contracts";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  chooseCampaignStartingPack,
  getCampaignStartingPackChoice,
} from "@/lib/run-service";

const paramsSchema = z.object({ runId: z.string().trim().min(1) });

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = paramsSchema.parse(await context.params);
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/starting-pack-choice`);
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const result = await getCampaignStartingPackChoice(prisma, {
      runId,
      userId: session.userId,
    });
    return NextResponse.json(startingPackChoiceResponseSchema.parse(result));
  } catch (error) {
    return toNextErrorResponse(error, "Startpack-Auswahl konnte nicht geladen werden.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = paramsSchema.parse(await context.params);
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/starting-pack-choice`);
  }
  try {
    requireSameOriginMutation(request, "Startpacks müssen aus der App ausgewählt werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = chooseStartingPackRequestSchema.parse(await request.json());
    const result = await chooseCampaignStartingPack(prisma, {
      runId,
      userId: session.userId,
      setId: body.setId,
    });
    return NextResponse.json(startingPackChoiceResponseSchema.parse(result));
  } catch (error) {
    return toNextErrorResponse(error, "Startpack konnte nicht ausgewählt werden.");
  }
}
