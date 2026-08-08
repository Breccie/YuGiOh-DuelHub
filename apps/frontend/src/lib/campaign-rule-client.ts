import type {
  CampaignRuleVersionDto,
  CreateCampaignRuleVersionRequest,
} from "@ygo/contracts";
import { apiGetJson, apiPostJson } from "@/lib/api-client";
import { clearAccountCaches } from "@/lib/account-cache";
import { refreshLocalSyncCacheSoon } from "@/lib/sync-cache-refresh";

export const campaignRuleClient = {
  list(runId: string) {
    return apiGetJson<CampaignRuleVersionDto[]>(
      `/api/v1/runs/${runId}/rule-versions`,
      { cache: "no-store" },
    );
  },
  async create(runId: string, input: CreateCampaignRuleVersionRequest) {
    const version = await apiPostJson<CampaignRuleVersionDto, CreateCampaignRuleVersionRequest>(
      `/api/v1/runs/${runId}/rule-versions`,
      input,
    );
    clearAccountCaches();
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return version;
  },
  async activate(runId: string, versionId: string) {
    const version = await apiPostJson<CampaignRuleVersionDto, Record<string, never>>(
      `/api/v1/runs/${runId}/rule-versions/${versionId}/activate`,
      {},
    );
    clearAccountCaches();
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return version;
  },
};
