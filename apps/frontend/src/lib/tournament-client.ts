import type {
  CreateTournamentRequest,
  InviteTournamentParticipantRequest,
  RecordTournamentMatchResultRequest,
} from "@ygo/contracts";
import { apiPatchJson, apiPost, apiPostJson } from "@/lib/api-client";
import type { TournamentDetail } from "@/lib/tournament-service";

type TournamentMutationResponse = {
  tournament: TournamentDetail;
};

export const tournamentClient = {
  create(input: CreateTournamentRequest) {
    return apiPostJson<TournamentMutationResponse, CreateTournamentRequest>(
      "/api/tournaments",
      input,
    );
  },

  inviteParticipant(
    tournamentId: string,
    input: InviteTournamentParticipantRequest,
  ) {
    return apiPostJson<
      TournamentMutationResponse,
      InviteTournamentParticipantRequest
    >(`/api/tournaments/${tournamentId}/participants`, input);
  },

  createRound(tournamentId: string) {
    return apiPost<TournamentMutationResponse>(
      `/api/tournaments/${tournamentId}/rounds`,
    );
  },

  recordMatchResult(
    matchId: string,
    input: RecordTournamentMatchResultRequest,
  ) {
    return apiPatchJson<
      TournamentMutationResponse,
      RecordTournamentMatchResultRequest
    >(`/api/tournaments/matches/${matchId}`, input);
  },

  complete(tournamentId: string) {
    return apiPost<TournamentMutationResponse>(
      `/api/tournaments/${tournamentId}/complete`,
    );
  },
};
