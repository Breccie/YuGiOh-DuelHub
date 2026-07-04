import { NextResponse } from "next/server";
import type { ActiveRunResponse, ClaimPromoResponse } from "@ygo/contracts";
import { claimPromoRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import {
  fetchApiService,
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { claimPromoCard } from "@/lib/progression-service";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;

  if (shouldProxyToApiService()) {
    try {
      const activeRun = await fetchApiServiceJson<ActiveRunResponse>(
        "/api/v1/runs/active",
        {
          cookieHeader: request.headers.get("cookie"),
          userAgent: request.headers.get("user-agent"),
        },
      );
      const response = await fetchApiService(
        `/api/v1/runs/${activeRun.run.id}/promos/${sourceId}/claim`,
        {
          method: "POST",
          headers: {
            "content-type": request.headers.get("content-type") ?? "application/json",
          },
          body: await request.text(),
          cookieHeader: request.headers.get("cookie"),
          userAgent: request.headers.get("user-agent"),
        },
      );

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      return toNextErrorResponse(error, "Promo-Karte konnte nicht geclaimt werden.");
    }
  }

  try {
    if (!isSameOriginMutation(request)) {
      return NextResponse.json(
        { error: "Promo-Claims muessen aus der App heraus kommen." },
        { status: 403 },
      );
    }

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const body = claimPromoRequestSchema.parse(await request.json().catch(() => ({})));
    const payload: ClaimPromoResponse = await claimPromoCard(
      prisma,
      session.userId,
      activeRun.id,
      sourceId,
      body.setCardId,
    );

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Promo-Karte konnte nicht geclaimt werden.");
  }
}
