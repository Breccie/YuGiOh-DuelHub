import { notFound, redirect } from "next/navigation";
import type { PackDetailResponse } from "@ygo/contracts";
import { ConsoleGlobalStatusBar } from "@/components/console-shell-primitives";
import { PackOpeningStation } from "@/components/pack-opening-station";
import { SiteFrame } from "@/components/site-frame";
import { requireActiveCampaign } from "@/lib/active-campaign";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildPackDetailPayload } from "@/lib/packs-data";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PackDetailPageProps = {
  params: Promise<{
    setId: string;
  }>;
};

async function getOnlinePackDetailPayload(setId: string) {
  try {
    return await fetchApiServiceJson<PackDetailResponse>(
      `/api/v1/packs/${encodeURIComponent(setId)}`,
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;

    if (status === 401) {
      redirect("/login");
    }

    if (status === 409) {
      redirect("/campaigns");
    }

    if (status === 404) {
      notFound();
    }

    throw error;
  }
}

export default async function PackDetailPage({ params }: PackDetailPageProps) {
  const { setId } = await params;
  const payload = shouldProxyToApiService()
    ? await getOnlinePackDetailPayload(setId)
    : await getLocalPackDetailPayload(setId);

  return (
    <SiteFrame
      headerVariant="none"
      topbarContent={
        <ConsoleGlobalStatusBar
          viewer={{
            displayName: payload.viewer.displayName,
            duelistId: payload.viewer.duelistId,
          }}
          fallback={{
            collectionValue: payload.metrics.collection,
          }}
        />
      }
    >
      <PackOpeningStation initialSnapshot={payload.snapshot} setId={payload.setId} />
    </SiteFrame>
  );
}

async function getLocalPackDetailPayload(setId: string) {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const activeRun = await requireActiveCampaign(prisma, session.userId);
  const payload = await buildPackDetailPayload(
    prisma,
    session.userId,
    setId,
    activeRun.id,
  );

  if (!payload) {
    notFound();
  }

  return payload;
}
