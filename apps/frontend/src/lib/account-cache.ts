import { clearCachedDashboardSummary } from "@/lib/dashboard-cache";
import { clearLocalSyncCache } from "@/lib/sync-cache";

export function clearAccountCaches() {
  clearLocalSyncCache();
  clearCachedDashboardSummary();
}
