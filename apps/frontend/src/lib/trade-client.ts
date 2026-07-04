import type {
  CreateTradeRequest,
  CreateTradeVersionRequest,
  TradeDecisionRequest,
} from "@ygo/contracts";
import { apiPostJson } from "@/lib/api-client";

type TradeMutationResponse = {
  trade: {
    id: string;
  };
};

export const tradeClient = {
  create(input: CreateTradeRequest) {
    return apiPostJson<TradeMutationResponse, CreateTradeRequest>("/api/trades", input);
  },

  decide(tradeId: string, input: TradeDecisionRequest) {
    return apiPostJson<TradeMutationResponse, TradeDecisionRequest>(
      `/api/trades/${tradeId}/decision`,
      input,
    );
  },

  createVersion(tradeId: string, input: CreateTradeVersionRequest) {
    return apiPostJson<TradeMutationResponse, CreateTradeVersionRequest>(
      `/api/trades/${tradeId}/versions`,
      input,
    );
  },
};
