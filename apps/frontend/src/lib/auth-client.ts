import { apiPost } from "@/lib/api-client";

type LogoutResponse = {
  ok: boolean;
};

export const authClient = {
  logout() {
    return apiPost<LogoutResponse>("/api/auth/logout");
  },
};
