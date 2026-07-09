import type {
  CreateFriendRequest,
  FriendRequestDecisionRequest,
  FriendRequestMutationResponse,
  FriendRequestsResponse,
} from "@ygo/contracts";
import { apiGetJson, apiPatchJson, apiPostJson } from "@/lib/api-client";

export const friendClient = {
  list() {
    return apiGetJson<FriendRequestsResponse>("/api/friends", {
      cache: "no-store",
    });
  },

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
