import "server-only";

import { redirect } from "next/navigation";
import type { ViewerSession } from "@ygo/contracts";
import { fetchApiServiceJson } from "@/lib/api-service-proxy";

export async function getOnlineViewerSession() {
  const payload = await fetchApiServiceJson<{ session: ViewerSession | null }>(
    "/api/v1/auth/session",
  );

  if (!payload.session) {
    redirect("/login");
  }

  return payload.session;
}
