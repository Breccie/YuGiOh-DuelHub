import type {
  CreateDuelRequest,
  DuelActionRequest,
  DuelRequestDto,
} from "@ygo/contracts";
import { apiPatchJson, apiPostJson } from "@/lib/api-client";

type DuelMutationResponse = {
  duel: DuelRequestDto;
};

export const duelClient = {
  create(input: CreateDuelRequest) {
    return apiPostJson<DuelMutationResponse, CreateDuelRequest>("/api/duels", input);
  },

  update(duelRequestId: string, input: DuelActionRequest) {
    return apiPatchJson<DuelMutationResponse, DuelActionRequest>(
      `/api/duels/${duelRequestId}`,
      input,
    );
  },
};
