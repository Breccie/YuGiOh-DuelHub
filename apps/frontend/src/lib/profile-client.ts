import type { UpdateProfileRequest, UpdateProfileResponse } from "@ygo/contracts";
import { apiPatchJson } from "@/lib/api-client";

export const profileClient = {
  update(input: UpdateProfileRequest) {
    return apiPatchJson<UpdateProfileResponse, UpdateProfileRequest>(
      "/api/profiles/me",
      input,
    );
  },
};
