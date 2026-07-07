import type { PlayGroupRunDto, UpdateRunSettingsRequest } from "@ygo/contracts";
import { apiPatchJson } from "@/lib/api-client";

export const runClient = {
  updateSettings(runId: string, input: UpdateRunSettingsRequest) {
    return apiPatchJson<PlayGroupRunDto, UpdateRunSettingsRequest>(
      `/api/v1/runs/${runId}/settings`,
      input,
    );
  },
};
