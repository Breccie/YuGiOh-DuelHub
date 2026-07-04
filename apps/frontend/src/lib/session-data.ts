import "server-only";

import type { ViewerSession } from "@ygo/contracts";
import { fetchApiServiceJson } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function getOnlineViewerSession() {
  const payload = await fetchApiServiceJson<{
    session: ViewerSession | null;
  }>("/api/v1/auth/session");

  return payload.session;
}

export async function getLocalViewerSession() {
  return getViewerSession(getPrisma());
}
