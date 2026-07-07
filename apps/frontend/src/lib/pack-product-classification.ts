type PackProductInput = {
  code: string;
  name: string;
  productType: string;
  isOpenable?: boolean;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function isTournamentRewardPack(set: Pick<PackProductInput, "code" | "name">) {
  const code = normalizeCode(set.code);
  const name = normalize(set.name);

  return (
    /^TP\d/.test(code) ||
    /^TU\d/.test(code) ||
    /^CP\d/.test(code) ||
    /^AP\d/.test(code) ||
    /^OP\d/.test(code) ||
    /^STP\d/.test(code) ||
    name.includes("tournament pack") ||
    name.includes("champion pack") ||
    name.includes("turbo pack") ||
    name.includes("astral pack") ||
    name.includes("ots tournament pack") ||
    name.includes("speed duel tournament pack")
  );
}

export function isPromoOrSpecialPack(set: Pick<PackProductInput, "code" | "name">) {
  const code = normalizeCode(set.code);
  const name = normalize(set.name);

  return (
    /^DP/.test(code) ||
    /^DR\d/.test(code) ||
    /^DR0\d/.test(code) ||
    /^DB\d/.test(code) ||
    /^PP\d/.test(code) ||
    /^RP\d/.test(code) ||
    /^SP\d/.test(code) ||
    /^BP\d/.test(code) ||
    /^DTP\d/.test(code) ||
    /^MVP\d/.test(code) ||
    /^YMP\d/.test(code) ||
    /^YAP\d/.test(code) ||
    /^WCPP/.test(code) ||
    /^WP\d/.test(code) ||
    /^DEM\d/.test(code) ||
    /^RYMP/.test(code) ||
    /^PGL/.test(code) ||
    /^MP\d/.test(code) ||
    /^NKRT/.test(code) ||
    /^DUSA/.test(code) ||
    /^LED\d?/.test(code) ||
    /^LDS\d/.test(code) ||
    /^LD\d+/.test(code) ||
    /^TBC\d/.test(code) ||
    /^KC\d/.test(code) ||
    /^25LP/.test(code) ||
    /^SB/.test(code) ||
    /^SGX/.test(code) ||
    name.includes("anniversary") ||
    name.includes("duelist pack") ||
    name.includes("dark beginning") ||
    name.includes("dark revelation") ||
    name.includes("premium pack") ||
    name.includes("premium gold") ||
    name.includes("retro pack") ||
    name.includes("star pack") ||
    name.includes("battle pack") ||
    name.includes("mega pack") ||
    name.includes("movie pack") ||
    name.includes("exclusive pack") ||
    name.includes("speed duel") ||
    name.includes("duel terminal") ||
    name.includes("world championship") ||
    name.includes("demo pack") ||
    name.includes("rarity collection") ||
    name.includes("pot collection") ||
    name.includes("kaiba set") ||
    name.includes("box set") ||
    name.includes("master collection") ||
    name.includes("legendary duelists") ||
    name.includes("legendary duelist") ||
    name.includes("collector") ||
    name.includes("limited edition") ||
    name.includes("limited pack")
  );
}

export function isStandardProgressionPack(set: PackProductInput) {
  if (set.isOpenable === false || set.productType !== "CORE_BOOSTER") {
    return false;
  }

  return !isTournamentRewardPack(set) && !isPromoOrSpecialPack(set);
}
