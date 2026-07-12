import type {
  ActiveRunResponse,
  AddRunMemberRequest,
  ApplyRunProgressionRequest,
  ApplyRunProgressionResponse,
  CreateRunRequest,
  GenerateRunProgressionRequest,
  GenerateRunProgressionResponse,
  JoinRunRequest,
  RunMemberDto,
  RunListResponse,
  RunProgressionResponse,
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
  join(input: JoinRunRequest) {
    return apiPostJson<ActiveRunResponse, JoinRunRequest>(
      "/api/v1/runs/join",
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
  listMembers(runId: string) {
    return apiGetJson<RunMemberDto[]>(`/api/v1/runs/${runId}/members`, {
      cache: "no-store",
    });
  },
  addMember(runId: string, input: AddRunMemberRequest) {
    return apiPostJson<RunMemberDto, AddRunMemberRequest>(
      `/api/v1/runs/${runId}/members`,
      input,
    );
  },
  getProgression(runId: string) {
    return apiGetJson<RunProgressionResponse>(
      `/api/v1/runs/${runId}/progression`,
      {
        cache: "no-store",
      },
    );
  },
  generateProgression(runId: string, input: GenerateRunProgressionRequest) {
    return apiPostJson<
      GenerateRunProgressionResponse,
      GenerateRunProgressionRequest
    >(`/api/v1/runs/${runId}/progression/generate`, input);
  },
  applyProgression(
    runId: string,
    checkpointId: string,
    input: ApplyRunProgressionRequest = {},
  ) {
    return apiPostJson<
      ApplyRunProgressionResponse,
      ApplyRunProgressionRequest
    >(`/api/v1/runs/${runId}/progression/${checkpointId}/apply`, input);
  },
};
