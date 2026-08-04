import { notFound, redirect } from "next/navigation";
import type { ActiveRunResponse, PackDashboardSnapshotDto } from "@ygo/contracts";
import { ConsoleGlobalStatusBar } from "@/components/console-shell-primitives";
import { PackOpeningStation } from "@/components/pack-opening-station";
import { SiteFrame } from "@/components/site-frame";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireActiveCampaign } from "@/lib/active-campaign";
import { getViewerSession } from "@/lib/auth";
import { listCustomPacks } from "@/lib/custom-pack-service";
import type { CustomPackRecord } from "@/lib/custom-pack-client";
import { getPackDashboardSnapshot } from "@/lib/pack-openings";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function asOpeningSnapshot(base: PackDashboardSnapshotDto, runId: string, versionId: string, packs: CustomPackRecord[]) {
  const pack = packs.find((candidate) => candidate.versions.some((version) => version.id === versionId));
  const version = pack?.versions.find((candidate) => candidate.id === versionId);
  const access = version?.accesses?.find((candidate) => candidate.runId === runId);
  const now = Date.now();
  const isAvailable = access?.availabilityStatus === "AVAILABLE"
    && (!access.availableFrom || new Date(access.availableFrom).getTime() <= now)
    && (!access.availableUntil || new Date(access.availableUntil).getTime() > now);
  if (!pack || !version || version.status !== "PUBLISHED" || !isAvailable || access.rewardOnly) return null;
  const imageUrl = version.packImageAssetId ? `/api/assets/media/${encodeURIComponent(version.packImageAssetId)}` : null;
  return {
    ...base,
    selectedSetId: version.id,
    sets: [{
      id: version.id,
      code: pack.code,
      name: pack.name,
      releaseDate: version.publishedAt ?? new Date().toISOString(),
      productType: "CUSTOM",
      packSize: version.packSize,
      cardPoolSize: version.poolEntries.length,
      imageUrl,
      totalOpened: 0,
      lastOpenedAt: null,
      isUnlocked: true,
      rewardOnly: false,
      packPrice: access?.price ?? version.price,
      displaySize: null,
      displayCost: null,
      canBuy: true,
    }],
    recentOpenings: [],
  } satisfies PackDashboardSnapshotDto;
}

export default async function CustomPackOpeningPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  let runId: string;
  let snapshot: PackDashboardSnapshotDto | null;
  let duelistId: string | null = null;

  if (shouldProxyToApiService()) {
    const [active, base] = await Promise.all([
      fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active").catch(() => null),
      fetchApiServiceJson<PackDashboardSnapshotDto>("/api/v1/packs/openings").catch(() => null),
    ]);
    if (!active || !base) redirect("/campaigns");
    runId = active.run.id;
    const packs = await fetchApiServiceJson<CustomPackRecord[]>(`/api/v1/custom-packs?runId=${encodeURIComponent(runId)}`);
    snapshot = asOpeningSnapshot(base, runId, versionId, packs);
  } else {
    const prisma = getPrisma();
    const session = await getViewerSession(prisma);
    if (!session) redirect("/login");
    duelistId = session.duelistId;
    const run = await requireActiveCampaign(prisma, session.userId);
    runId = run.id;
    const [base, rawPacks] = await Promise.all([
      getPackDashboardSnapshot(prisma, session.userId, runId),
      listCustomPacks(prisma, session.userId, runId),
    ]);
    snapshot = asOpeningSnapshot(base, runId, versionId, JSON.parse(JSON.stringify(rawPacks)) as CustomPackRecord[]);
  }
  if (!snapshot) notFound();
  return (
    <SiteFrame headerVariant="none" topbarContent={<ConsoleGlobalStatusBar viewer={{ displayName: snapshot.viewer.displayName, duelistId }} />}>
      <PackOpeningStation initialSnapshot={snapshot} setId={versionId} customPack={{ runId, versionId }} />
    </SiteFrame>
  );
}
