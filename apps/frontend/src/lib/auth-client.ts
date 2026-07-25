import type { ViewerSession } from "@ygo/contracts";
import { apiGetJson, apiPost } from "@/lib/api-client";
import { clearAccountCaches } from "@/lib/account-cache";

type LogoutResponse = {
  ok: boolean;
};

export const authClient = {
  getSession() {
    return apiGetJson<{ session: ViewerSession | null }>("/api/auth/session", {
      cache: "no-store",
    });
  },

  async logout() {
    const response = await apiPost<LogoutResponse>("/api/auth/logout");
    clearAccountCaches();
    return response;
  },
};
