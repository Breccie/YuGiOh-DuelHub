function isLocalAssetUrl(value: string) {
  return (
    value.startsWith("/") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  );
}

export function getCardAssetUrl(externalCardId: string | null) {
  if (!externalCardId) {
    return null;
  }

  const normalized = externalCardId.trim();

  if (!normalized) {
    return null;
  }

  return `/api/assets/cards/${encodeURIComponent(normalized)}`;
}

export function getDisplayAssetUrl(code: string | null, name: string | null) {
  if (!code) {
    return null;
  }

  const normalizedCode = code.trim();

  if (!normalizedCode) {
    return null;
  }

  const params = new URLSearchParams();
  const normalizedName = name?.trim();

  params.set("v", "official-pack-v8");

  if (normalizedName) {
    params.set("name", normalizedName);
  }

  const query = params.toString();

  return `/api/assets/displays/${encodeURIComponent(normalizedCode)}${
    query ? `?${query}` : ""
  }`;
}

export function getPackAssetUrl(code: string | null, name: string | null) {
  if (!code) {
    return null;
  }

  const normalizedCode = code.trim();

  if (!normalizedCode) {
    return null;
  }

  const params = new URLSearchParams();
  const normalizedName = name?.trim();

  if (normalizedName) {
    params.set("name", normalizedName);
  }

  const query = params.toString();

  return `/api/assets/packs/${encodeURIComponent(normalizedCode)}${
    query ? `?${query}` : ""
  }`;
}

export function getCachedRemoteAssetUrl(imageUrl: string | null) {
  if (!imageUrl) {
    return null;
  }

  const normalized = imageUrl.trim();

  if (!normalized) {
    return null;
  }

  if (isLocalAssetUrl(normalized) || normalized.startsWith("/api/assets/")) {
    return normalized;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return `/api/assets/remote?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return normalized;
  }
}

export function resolveAppImageUrl(imageUrl: string | null) {
  return getCachedRemoteAssetUrl(imageUrl);
}
