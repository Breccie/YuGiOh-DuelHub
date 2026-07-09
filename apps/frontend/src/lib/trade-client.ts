import type {
  CreateTradeRequest,
  CreateTradeVersionRequest,
  TradeDecisionRequest,
} from "@ygo/contracts";
import { apiPostJson } from "@/lib/api-client";
import { refreshLocalSyncCacheSoon } from "@/lib/sync-cache-refresh";

type TradeMutationResponse = {
  trade: {
    id: string;
  };
};

export const tradeClient = {
  async create(input: CreateTradeRequest) {
    const response = await apiPostJson<TradeMutationResponse, CreateTradeRequest>(
      "/api/trades",
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async decide(tradeId: string, input: TradeDecisionRequest) {
    const response = await apiPostJson<TradeMutationResponse, TradeDecisionRequest>(
      `/api/trades/${tradeId}/decision`,
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },

  async createVersion(tradeId: string, input: CreateTradeVersionRequest) {
    const response = await apiPostJson<TradeMutationResponse, CreateTradeVersionRequest>(
      `/api/trades/${tradeId}/versions`,
      input,
    );
    refreshLocalSyncCacheSoon({ forceFullDelta: true });
    return response;
  },
};
