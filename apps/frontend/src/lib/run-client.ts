import type {
  ActiveRunResponse,
  AddRunMemberRequest,
  ApplyRunProgressionRequest,
  ApplyRunProgressionResponse,
  CampaignPackAccessResponse,
  CreateRunRequest,
  GenerateRunProgressionRequest,
  GenerateRunProgressionResponse,
  JoinRunRequest,
  JoinRunResponse,
  DecideRunJoinRequest,
  ChooseStartingPackRequest,
  RunJoinRequestDto,
  RunMemberDto,
  RunListResponse,
  RunProgressionResponse,
  StartingPackChoiceResponse,
  UpdateActiveRunRequest,
  UpdateCampaignPackAccessRequest,
  UpdateRunSettingsRequest,
} from "@ygo/contracts";
import {
  apiGetJson,
  apiPatchJson,
  apiPostJson,
  apiPutJson,
} from "@/lib/api-client";
import { clearAccountCaches } from "@/lib/account-cache";
import { refreshLocalSyncCacheSoon } from "@/lib/sync-cache-refresh";

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
    return apiPostJson<JoinRunResponse, JoinRunRequest>(
      "/api/v1/runs/join",
      input,
    );
  },
  async setActive(runId: string) {
    const payload = await apiPutJson<ActiveRunResponse, UpdateActiveRunRequest>(
      "/api/v1/runs/active",
      { runId },
    );
    clearAccountCaches();
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return payload;
  },
  updateSettings(runId: string, input: UpdateRunSettingsRequest) {
    return apiPatchJson<ActiveRunResponse["run"], UpdateRunSettingsRequest>(
      `/api/v1/runs/${runId}/settings`,
      input,
    );
  },
  listJoinRequests(runId: string) {
    return apiGetJson<RunJoinRequestDto[]>(`/api/v1/runs/${runId}/join-requests`, {
      cache: "no-store",
    });
  },
  decideJoinRequest(runId: string, requestId: string, input: DecideRunJoinRequest) {
    return apiPostJson<RunJoinRequestDto, DecideRunJoinRequest>(
      `/api/v1/runs/${runId}/join-requests/${requestId}/decision`,
      input,
    );
  },
  getStartingPackChoice(runId: string) {
    return apiGetJson<StartingPackChoiceResponse>(
      `/api/v1/runs/${runId}/starting-pack-choice`,
      { cache: "no-store" },
    );
  },
  chooseStartingPack(runId: string, input: ChooseStartingPackRequest) {
    return apiPostJson<StartingPackChoiceResponse, ChooseStartingPackRequest>(
      `/api/v1/runs/${runId}/starting-pack-choice`,
      input,
    );
  },
  listPackAccess(runId: string) {
    return apiGetJson<CampaignPackAccessResponse>(
      `/api/v1/runs/${runId}/pack-access`,
      { cache: "no-store" },
    );
  },
  updatePackAccess(runId: string, input: UpdateCampaignPackAccessRequest) {
    return apiPatchJson<CampaignPackAccessResponse, UpdateCampaignPackAccessRequest>(
      `/api/v1/runs/${runId}/pack-access`,
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
