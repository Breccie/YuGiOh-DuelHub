import type {
  CreateTournamentRequest,
  InviteTournamentParticipantRequest,
  RecordTournamentMatchResultRequest,
} from "@ygo/contracts";
import { apiPatchJson, apiPost, apiPostJson } from "@/lib/api-client";
import { refreshLocalSyncCacheSoon } from "@/lib/sync-cache-refresh";
import type { TournamentDetail } from "@/lib/tournament-service";

type TournamentMutationResponse = {
  tournament: TournamentDetail;
};

export const tournamentClient = {
  async create(input: CreateTournamentRequest) {
    const response = await apiPostJson<
      TournamentMutationResponse,
      CreateTournamentRequest
    >(
      "/api/tournaments",
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async inviteParticipant(
    tournamentId: string,
    input: InviteTournamentParticipantRequest,
  ) {
    const response = await apiPostJson<
      TournamentMutationResponse,
      InviteTournamentParticipantRequest
    >(`/api/tournaments/${tournamentId}/participants`, input);
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async createRound(tournamentId: string) {
    const response = await apiPost<TournamentMutationResponse>(
      `/api/tournaments/${tournamentId}/rounds`,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async recordMatchResult(
    matchId: string,
    input: RecordTournamentMatchResultRequest,
  ) {
    const response = await apiPatchJson<
      TournamentMutationResponse,
      RecordTournamentMatchResultRequest
    >(`/api/tournaments/matches/${matchId}`, input);
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async complete(tournamentId: string) {
    const response = await apiPost<TournamentMutationResponse>(
      `/api/tournaments/${tournamentId}/complete`,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },
};
