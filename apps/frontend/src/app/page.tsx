import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { HomeDashboardResponse } from "@ygo/contracts";
import { HomeConsole } from "@/components/home-console";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildHomeDashboardPayload } from "@/lib/home-dashboard-data";
import { getPrisma } from "@/lib/prisma";
import Loading from "./loading";

async function getOnlineDashboardPayload() {
  try {
    return await fetchApiServiceJson<HomeDashboardResponse>("/api/v1/dashboard");
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      redirect("/login");
    }

    throw error;
  }
}

async function HomeContent() {
  if (shouldProxyToApiService()) {
    return <HomeConsole {...(await getOnlineDashboardPayload())} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  return <HomeConsole {...(await buildHomeDashboardPayload(prisma, session.userId))} />;
}

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeContent />
    </Suspense>
  );
}
