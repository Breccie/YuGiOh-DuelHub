import type { ViewerSession } from "@ygo/contracts";
import { apiGetJson, apiPost } from "@/lib/api-client";

type LogoutResponse = {
  ok: boolean;
};

export const authClient = {
  getSession() {
    return apiGetJson<{ session: ViewerSession | null }>("/api/auth/session", {
      cache: "no-store",
    });
  },

  logout() {
    return apiPost<LogoutResponse>("/api/auth/logout");
  },
};
