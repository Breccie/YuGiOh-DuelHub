import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HomeConsole } from "@/components/home-console";
import { HomeConsoleLoader } from "@/components/home-console-loader";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildHomeDashboardPayload } from "@/lib/home-dashboard-data";
import { getPrisma } from "@/lib/prisma";
import Loading from "./loading";

async function HomeContent() {
  if (shouldProxyToApiService()) {
    return <HomeConsoleLoader />;
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
