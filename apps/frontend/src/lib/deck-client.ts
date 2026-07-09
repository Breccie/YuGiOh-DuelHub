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
import { refreshLocalSyncCacheSoon } from "@/lib/sync-cache-refresh";

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
  async create(input: CreateDeckRequest) {
    const response = await apiPostJson<DeckMutationResponse, CreateDeckRequest>(
      "/api/decks",
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async update(deckId: string, input: UpdateDeckRequest) {
    const response = await apiPatchJson<DeckMutationResponse, UpdateDeckRequest>(
      `/api/decks/${deckId}`,
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async remove(deckId: string) {
    const response = await apiDeleteJson<DeckDeleteResponse>(`/api/decks/${deckId}`);
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async upsertCard(deckId: string, input: UpsertDeckCardRequest) {
    const response = await apiPostJson<DeckCardMutationResponse, UpsertDeckCardRequest>(
      `/api/decks/${deckId}/cards`,
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async removeCard(deckId: string, input: RemoveDeckCardRequest) {
    const response = await apiDeleteJson<DeckDeleteResponse, RemoveDeckCardRequest>(
      `/api/decks/${deckId}/cards`,
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  exportDeck(deckId: string, input: DeckExportRequest) {
    return apiPostJson<DeckExportResponse, DeckExportRequest>(
      `/api/decks/${deckId}/export`,
      input,
    );
  },
};
