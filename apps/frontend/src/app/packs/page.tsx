import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PackSelectionConsole } from "@/components/pack-selection-console";
import { PackSelectionLoader } from "@/components/pack-selection-loader";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildPackSelectionPayload } from "@/lib/packs-data";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";
import Loading from "../loading";

async function PacksPageContent() {
  if (shouldProxyToApiService()) {
    return <PackSelectionLoader />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const activeRun = await getActiveRun(prisma, session.userId);

  return (
    <PackSelectionConsole
      {...(await buildPackSelectionPayload(prisma, session.userId, activeRun.id))}
    />
  );
}

export default function PacksPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PacksPageContent />
    </Suspense>
  );
}
