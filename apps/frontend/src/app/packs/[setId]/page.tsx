import { notFound, redirect } from "next/navigation";
import type { PackDetailResponse } from "@ygo/contracts";
import { AssetIcon } from "@/components/asset-icon";
import { ConsoleProfileMenuChip } from "@/components/console-shell-primitives";
import { PackOpeningStation } from "@/components/pack-opening-station";
import { SiteFrame } from "@/components/site-frame";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildPackDetailPayload } from "@/lib/packs-data";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

function TopbarMetric({
  iconName,
  label,
  value,
}: {
  iconName: "book" | "scale" | "hourglass";
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,13,18,0.62)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
      <AssetIcon name={iconName} className="h-6 w-6 text-[#d0b38c]" />
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[#9f8c77]">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#efdfcb]">{value}</p>
      </div>
    </div>
  );
}

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
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <TopbarMetric
            iconName="book"
            label="Sammlung"
            value={payload.metrics.collection}
          />
          <TopbarMetric
            iconName="scale"
            label="Banlist"
            value={payload.metrics.latestBanlistName}
          />
          <TopbarMetric
            iconName="hourglass"
            label="Aktive Ära"
            value={payload.metrics.activeEra}
          />
          <ConsoleProfileMenuChip
            viewer={{
              displayName: payload.viewer.displayName,
              duelistId: payload.viewer.duelistId,
            }}
          />
        </div>
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

  const activeRun = await getActiveRun(prisma, session.userId);
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
