import type {
  CreateCustomPackRequest,
  OpenCustomPackRequest,
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
    rewardOnly?: boolean;
    artworkAssetId: string | null;
    packImageAssetId: string | null;
    publishedAt?: string | null;
    accesses?: Array<{
      runId: string;
      price: number | null;
      rewardOnly: boolean;
      availabilityStatus: "AVAILABLE" | "LOCKED" | "SCHEDULED";
      isAvailableNow: boolean;
      availableFrom: string | null;
      availableUntil: string | null;
    }>;
    poolEntries: Array<{
      cardId: string;
      setCardId: string | null;
      rarity: string;
      weight: number;
      card?: { name: string; externalCardId?: string | null };
    }>;
    slots: Array<{
      slotIndex: number;
      count: number;
      allowedRarities: string[];
      weight: number;
      rarityWeights?: Array<{ rarity: string; weight: number }> | null;
    }>;
  }>;
};

export type CustomPackTemplateRecord = {
  id: string;
  name: string;
  era: string;
  sourceDefinitionId: string | null;
  createdAt: string;
  updatedAt: string;
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
      cardDistribution: Array<{ cardId: string; name: string; count: number; probability: number }>;
    }, SimulateCustomPackRequest>(`/api/custom-packs/${versionId}/simulate?${runQuery(runId)}`, input);
  },
  publish(runId: string, versionId: string) {
    return apiPostJson<CustomPackRecord["versions"][number], Record<string, never>>(
      `/api/custom-packs/${versionId}/publish?${runQuery(runId)}`,
      {},
    );
  },
  nextDraft(runId: string, versionId: string) {
    return apiPostJson<CustomPackRecord["versions"][number], Record<string, never>>(
      `/api/custom-packs/${versionId}/next-draft?${runQuery(runId)}`,
      {},
    );
  },
  open(runId: string, versionId: string, input: OpenCustomPackRequest) {
    return apiPostJson<{
      id: string;
      versionId: string;
      seed: string;
      auditHash: string;
      price: number;
      pulls: Array<{
        id: string;
        cardId: string;
        cardName: string;
        cardImageUrl: string | null;
        setCardId: string;
        setCode: string | null;
        rarity: string;
        slotIndex: number;
      }>;
    }, OpenCustomPackRequest>(
      `/api/custom-packs/${versionId}/open?${runQuery(runId)}`,
      input,
    );
  },
  listTemplates() {
    return apiGetJson<CustomPackTemplateRecord[]>("/api/custom-pack-templates", {
      cache: "no-store",
    });
  },
  createTemplate(runId: string, definitionId: string, name?: string) {
    return apiPostJson<CustomPackTemplateRecord, { name?: string }>(
      `/api/custom-packs/${definitionId}/template?${runQuery(runId)}`,
      name ? { name } : {},
    );
  },
  copyTemplate(runId: string, templateId: string) {
    return apiPostJson<CustomPackRecord, Record<string, never>>(
      `/api/custom-pack-templates/${templateId}/copy?${runQuery(runId)}`,
      {},
    );
  },
};
