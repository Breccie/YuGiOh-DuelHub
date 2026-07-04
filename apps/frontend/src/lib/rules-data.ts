import "server-only";

import type { RuleTopicDto, RulesOverviewResponse } from "@ygo/contracts";
import { getRuleTopic, getRulesOverview } from "@ygo/domain";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";

export async function getRulesOverviewData(): Promise<RulesOverviewResponse> {
  if (shouldProxyToApiService()) {
    return fetchApiServiceJson<RulesOverviewResponse>("/api/v1/rules");
  }

  return getRulesOverview();
}

export async function getRuleTopicData(slug: string): Promise<RuleTopicDto | null> {
  if (shouldProxyToApiService()) {
    const payload = await fetchApiServiceJson<{ topic: RuleTopicDto }>(
      `/api/v1/rules/${encodeURIComponent(slug)}`,
    ).catch((error) => {
      if ((error as Error & { status?: number }).status === 404) {
        return null;
      }

      throw error;
    });

    return payload?.topic ?? null;
  }

  return getRuleTopic(slug);
}
