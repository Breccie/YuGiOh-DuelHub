import type {
  CreateDeckRequest,
  DeckExportRequest,
  DeckExportResult,
  RemoveDeckCardRequest,
  UpsertDeckCardRequest,
  UpdateDeckRequest,
} from "@ygo/contracts";
import {
  apiDeleteJson,
  apiPatchJson,
  apiPostJson,
} from "@/lib/api-client";

type DeckMutationResponse = {
  deck: {
    id: string;
    name: string;
  };
};

type DeckDeleteResponse = {
  ok: boolean;
};

type DeckCardMutationResponse = {
  deckCard: {
    id: string;
  };
};

type DeckExportResponse = {
  export: DeckExportResult;
};

export const deckClient = {
  create(input: CreateDeckRequest) {
    return apiPostJson<DeckMutationResponse, CreateDeckRequest>("/api/decks", input);
  },

  update(deckId: string, input: UpdateDeckRequest) {
    return apiPatchJson<DeckMutationResponse, UpdateDeckRequest>(
      `/api/decks/${deckId}`,
      input,
    );
  },

  remove(deckId: string) {
    return apiDeleteJson<DeckDeleteResponse>(`/api/decks/${deckId}`);
  },

  upsertCard(deckId: string, input: UpsertDeckCardRequest) {
    return apiPostJson<DeckCardMutationResponse, UpsertDeckCardRequest>(
      `/api/decks/${deckId}/cards`,
      input,
    );
  },

  removeCard(deckId: string, input: RemoveDeckCardRequest) {
    return apiDeleteJson<DeckDeleteResponse, RemoveDeckCardRequest>(
      `/api/decks/${deckId}/cards`,
      input,
    );
  },

  exportDeck(deckId: string, input: DeckExportRequest) {
    return apiPostJson<DeckExportResponse, DeckExportRequest>(
      `/api/decks/${deckId}/export`,
      input,
    );
  },
};
