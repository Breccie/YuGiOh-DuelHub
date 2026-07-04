const RARITY_VALUE_RULES: Array<{ pattern: RegExp; value: number }> = [
  { pattern: /ghost/i, value: 420 },
  { pattern: /starlight|collector|collectors/i, value: 320 },
  { pattern: /ultimate/i, value: 260 },
  { pattern: /secret/i, value: 220 },
  { pattern: /ultra/i, value: 160 },
  { pattern: /super/i, value: 110 },
  { pattern: /rare/i, value: 70 },
  { pattern: /common/i, value: 40 },
];

export function getGenesysValueForRarity(rarity?: string | null) {
  if (!rarity) {
    return 40;
  }

  const rule = RARITY_VALUE_RULES.find(({ pattern }) => pattern.test(rarity));
  return rule?.value ?? 40;
}

export function sumGenesysValues(
  items: Array<{
    rarity?: string | null;
    quantity?: number;
  }>,
) {
  return items.reduce((total, item) => {
    const quantity = Math.max(1, item.quantity ?? 1);
    return total + getGenesysValueForRarity(item.rarity) * quantity;
  }, 0);
}

export function formatGenesysValue(value: number) {
  return `${new Intl.NumberFormat("de-DE").format(value)} GP`;
}
