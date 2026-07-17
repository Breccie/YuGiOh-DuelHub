import type {
  CampaignRuleVersionDto,
  CreateCampaignRuleVersionRequest,
} from "@ygo/contracts";
import { apiGetJson, apiPostJson } from "@/lib/api-client";

export const campaignRuleClient = {
  list(runId: string) {
    return apiGetJson<CampaignRuleVersionDto[]>(
      `/api/v1/runs/${runId}/rule-versions`,
      { cache: "no-store" },
    );
  },
  create(runId: string, input: CreateCampaignRuleVersionRequest) {
    return apiPostJson<CampaignRuleVersionDto, CreateCampaignRuleVersionRequest>(
      `/api/v1/runs/${runId}/rule-versions`,
      input,
    );
  },
  activate(runId: string, versionId: string) {
    return apiPostJson<CampaignRuleVersionDto, Record<string, never>>(
      `/api/v1/runs/${runId}/rule-versions/${versionId}/activate`,
      {},
    );
  },
};
