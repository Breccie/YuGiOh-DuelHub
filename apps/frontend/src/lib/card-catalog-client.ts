import type { CardCatalogQuery, CardCatalogResponse } from "@ygo/contracts";
import { apiGetJson } from "@/lib/api-client";

export const cardCatalogClient = {
  search(query: Partial<CardCatalogQuery>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    return apiGetJson<CardCatalogResponse>(`/api/cards?${params.toString()}`, {
      cache: "no-store",
    });
  },
};
