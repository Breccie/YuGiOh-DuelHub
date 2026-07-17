import type {
  CreateCustomPackRequest,
  SimulateCustomPackRequest,
  UpdateCustomPackDraftRequest,
} from "@ygo/contracts";
import { apiGetJson, apiPostJson, apiPutJson } from "@/lib/api-client";

export type CustomPackRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  era: string;
  status: string;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    packSize: number;
    displaySize: number;
    price: number;
    poolEntries: Array<{ cardId: string; setCardId: string | null; rarity: string; weight: number }>;
    slots: Array<{ slotIndex: number; count: number; allowedRarities: string[]; weight: number }>;
  }>;
};

function runQuery(runId: string) {
  return `runId=${encodeURIComponent(runId)}`;
}

export const customPackClient = {
  list(runId: string) {
    return apiGetJson<CustomPackRecord[]>(`/api/custom-packs?${runQuery(runId)}`, { cache: "no-store" });
  },
  create(runId: string, input: CreateCustomPackRequest) {
    return apiPostJson<CustomPackRecord, CreateCustomPackRequest>(`/api/custom-packs?${runQuery(runId)}`, input);
  },
  update(runId: string, versionId: string, input: UpdateCustomPackDraftRequest) {
    return apiPutJson<CustomPackRecord["versions"][number], UpdateCustomPackDraftRequest>(
      `/api/custom-packs/${versionId}?${runQuery(runId)}`,
      input,
    );
  },
  simulate(runId: string, versionId: string, input: SimulateCustomPackRequest) {
    return apiPostJson<{
      iterations: number;
      seed: string;
      rarityDistribution: Array<{ rarity: string; count: number; probability: number }>;
    }, SimulateCustomPackRequest>(`/api/custom-packs/${versionId}/simulate?${runQuery(runId)}`, input);
  },
  publish(runId: string, versionId: string) {
    return apiPostJson<CustomPackRecord["versions"][number], Record<string, never>>(
      `/api/custom-packs/${versionId}/publish?${runQuery(runId)}`,
      {},
    );
  },
  open(runId: string, versionId: string, seed?: string) {
    return apiPostJson<{ id: string; versionId: string; seed: string; price: number; pulls: unknown[] }, { seed?: string }>(
      `/api/custom-packs/${versionId}/open?${runQuery(runId)}`,
      seed ? { seed } : {},
    );
  },
};
