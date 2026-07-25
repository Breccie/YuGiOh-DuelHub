import type { UpsertWishlistItemRequest, WishlistItem } from "@ygo/contracts";
import { apiDeleteJson, apiGetJson, apiPostJson } from "@/lib/api-client";

type WishlistResponse = { items: WishlistItem[] };

export const wishlistClient = {
  list() {
    return apiGetJson<WishlistResponse>("/api/wishlist", { cache: "no-store" });
  },
  upsert(input: UpsertWishlistItemRequest) {
    return apiPostJson<WishlistResponse, UpsertWishlistItemRequest>("/api/wishlist", input);
  },
  remove(itemId: string) {
    return apiDeleteJson<{ ok: boolean }>(`/api/wishlist/${itemId}`);
  },
};
