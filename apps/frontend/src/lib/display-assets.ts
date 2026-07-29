import "server-only";

type TcgCsvGroup = {
  groupId: number;
  name: string;
  abbreviation: string | null;
  publishedOn: string | null;
};

type TcgCsvProduct = {
  productId: number;
  name: string;
  imageUrl: string | null;
  url: string | null;
};

type TcgCsvResponse<T> = {
  success: boolean;
  results: T[];
};

export type DisplayAssetMatch = {
  productId: number;
  productName: string;
  productUrl: string | null;
  groupId: number;
  groupName: string;
  imageUrl: string;
};

const TCGCSV_YUGIOH_CATEGORY_ID = 2;
const TCGCSV_BASE_URL = "https://tcgcsv.com/tcgplayer";
const DISPLAY_ASSET_USER_AGENT = "Yu-Gi-Oh Duel Hub/1.0 display-assets";
const MIN_DISPLAY_PRODUCT_SCORE = 80;

let groupsPromise: Promise<TcgCsvGroup[]> | null = null;
const productsByGroupId = new Map<number, Promise<TcgCsvProduct[]>>();
const matchesByLookupKey = new Map<string, Promise<DisplayAssetMatch | null>>();

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/yu-gi-oh!|yugioh/g, " ")
    .replace(/25th anniversary edition/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function getLookupKey(code: string, name: string | null) {
  return `${normalizeCode(code)}:${normalizeSearchText(name ?? "")}`;
}

async function fetchTcgCsv<T>(path: string): Promise<T[]> {
  const response = await fetch(`${TCGCSV_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": DISPLAY_ASSET_USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `TCGCSV konnte nicht geladen werden (${response.status} ${response.statusText}).`,
    );
  }

  const payload = (await response.json()) as TcgCsvResponse<T>;

  if (!payload.success || !Array.isArray(payload.results)) {
    throw new Error("TCGCSV hat keine nutzbaren Display-Daten geliefert.");
  }

  return payload.results;
}

function getGroups() {
  groupsPromise ??= fetchTcgCsv<TcgCsvGroup>(
    `/${TCGCSV_YUGIOH_CATEGORY_ID}/groups`,
  );

  return groupsPromise;
}

function getProducts(groupId: number) {
  let productsPromise = productsByGroupId.get(groupId);

  if (!productsPromise) {
    productsPromise = fetchTcgCsv<TcgCsvProduct>(
      `/${TCGCSV_YUGIOH_CATEGORY_ID}/${groupId}/products`,
    );
    productsByGroupId.set(groupId, productsPromise);
  }

  return productsPromise;
}

function scoreGroup(group: TcgCsvGroup, code: string, setName: string | null) {
  const normalizedCode = normalizeCode(code);
  const groupCode = normalizeCode(group.abbreviation ?? "");
  const normalizedSetName = normalizeSearchText(setName ?? "");
  const normalizedGroupName = normalizeSearchText(group.name);
  let score = 0;

  if (groupCode === normalizedCode) {
    score += 90;
  }

  if (normalizedCode === "SRL" && groupCode === "MRL") {
    score += 82;
  }

  if (groupCode.startsWith(`${normalizedCode}-`)) {
    score += 70;
  }

  if (normalizedSetName && normalizedGroupName === normalizedSetName) {
    score += 55;
  } else if (
    normalizedSetName &&
    (normalizedGroupName.includes(normalizedSetName) ||
      normalizedSetName.includes(normalizedGroupName))
  ) {
    score += 35;
  }

  return score;
}

function scoreProduct(product: TcgCsvProduct, setName: string | null) {
  const productName = product.name.toLowerCase();
  const normalizedProductName = normalizeSearchText(product.name);
  const normalizedSetName = normalizeSearchText(setName ?? "");
  let score = 0;

  if (productName.includes("booster box")) {
    score += 125;
  }

  if (productName.includes("deck display")) {
    score += 112;
  } else if (/\bdisplay\b/.test(productName)) {
    score += 108;
  }

  if (productName.includes("mini box")) {
    score -= 35;
  }

  if (productName.includes("booster pack")) {
    score -= 55;
  }

  if (productName.includes("sleeved booster")) {
    score -= 65;
  }

  if (productName.includes("case")) {
    score -= 90;
  }

  if (productName.includes("1st edition")) {
    score += 6;
  }

  if (productName.includes("unlimited edition")) {
    score += 3;
  }

  if (
    normalizedSetName &&
    (normalizedProductName.includes(normalizedSetName) ||
      normalizedSetName.includes(normalizedProductName))
  ) {
    score += 8;
  }

  return score;
}

function getPreferredProductImageUrl(imageUrl: string | null) {
  if (!imageUrl) {
    return null;
  }

  return imageUrl.replace(/_(?:200w|400w)\.(jpg|png|webp)$/i, "_400w.$1");
}

function getCandidateGroups(
  groups: TcgCsvGroup[],
  code: string,
  setName: string | null,
) {
  return groups
    .map((group) => ({
      group,
      score: scoreGroup(group, code, setName),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry) => entry.group);
}

async function resolveDisplayAssetInternal(
  code: string,
  setName: string | null,
): Promise<DisplayAssetMatch | null> {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    return null;
  }

  const groups = await getGroups();
  const candidateGroups = getCandidateGroups(groups, normalizedCode, setName);
  let bestMatch:
    | {
        group: TcgCsvGroup;
        product: TcgCsvProduct;
        imageUrl: string;
        score: number;
      }
    | null = null;

  for (const group of candidateGroups) {
    const products = await getProducts(group.groupId);

    for (const product of products) {
      const imageUrl = getPreferredProductImageUrl(product.imageUrl);

      if (!imageUrl) {
        continue;
      }

      const score = scoreProduct(product, setName);

      if (score < MIN_DISPLAY_PRODUCT_SCORE) {
        continue;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          group,
          product,
          imageUrl,
          score,
        };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    productId: bestMatch.product.productId,
    productName: bestMatch.product.name,
    productUrl: bestMatch.product.url,
    groupId: bestMatch.group.groupId,
    groupName: bestMatch.group.name,
    imageUrl: bestMatch.imageUrl,
  };
}

export function resolveDisplayAsset(code: string, setName: string | null) {
  const lookupKey = getLookupKey(code, setName);
  let matchPromise = matchesByLookupKey.get(lookupKey);

  if (!matchPromise) {
    matchPromise = resolveDisplayAssetInternal(code, setName).catch(() => null);
    matchesByLookupKey.set(lookupKey, matchPromise);
  }

  return matchPromise;
}
