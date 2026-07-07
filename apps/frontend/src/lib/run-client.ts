import type {
  ActiveRunResponse,
  CreateRunRequest,
  RunListResponse,
  UpdateActiveRunRequest,
  UpdateRunSettingsRequest,
} from "@ygo/contracts";
import {
  apiGetJson,
  apiPatchJson,
  apiPostJson,
  apiPutJson,
} from "@/lib/api-client";

export const runClient = {
  list() {
    return apiGetJson<RunListResponse>("/api/v1/runs");
  },
  create(input: CreateRunRequest) {
    return apiPostJson<ActiveRunResponse, CreateRunRequest>(
      "/api/v1/runs",
      input,
    );
  },
  setActive(runId: string) {
    return apiPutJson<ActiveRunResponse, UpdateActiveRunRequest>(
      "/api/v1/runs/active",
      { runId },
    );
  },
  updateSettings(runId: string, input: UpdateRunSettingsRequest) {
    return apiPatchJson<ActiveRunResponse["run"], UpdateRunSettingsRequest>(
      `/api/v1/runs/${runId}/settings`,
      input,
    );
  },
};
