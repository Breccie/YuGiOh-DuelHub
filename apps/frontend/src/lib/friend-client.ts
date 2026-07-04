import type {
  CreateFriendRequest,
  FriendRequestDecisionRequest,
  FriendRequestMutationResponse,
} from "@ygo/contracts";
import { apiPatchJson, apiPostJson } from "@/lib/api-client";

export const friendClient = {
  create(input: CreateFriendRequest) {
    return apiPostJson<FriendRequestMutationResponse, CreateFriendRequest>(
      "/api/friends/requests",
      input,
    );
  },

  decide(requestId: string, input: FriendRequestDecisionRequest) {
    return apiPatchJson<FriendRequestMutationResponse, FriendRequestDecisionRequest>(
      `/api/friends/requests/${requestId}`,
      input,
    );
  },
};
