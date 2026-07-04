export const productPillars = [
  {
    title: "Chronological pack opening",
    description:
      "Sets unlock by release date. Every opening stores set, pull slots, rarity, timestamp, and audit metadata.",
  },
  {
    title: "Per-copy collection tracking",
    description:
      "Each owned copy is stored as its own row so duplicates, set printings, and trades stay traceable.",
  },
  {
    title: "Banlist-aware deckbuilding",
    description:
      "Decks are attached to a specific format and banlist snapshot instead of floating as timeless lists.",
  },
  {
    title: "Errata-aware legality",
    description:
      "Card text versions are first-class records, so formats can ban, freeze, or update cards when errata happens.",
  },
] as const;

export const chronologyPreview = [
  {
    label: "Wave 1",
    pack: "Legend of Blue Eyes White Dragon",
    focus: "Tiny starting pools and immediate trade pressure.",
  },
  {
    label: "Wave 2",
    pack: "Metal Raiders",
    focus: "Early staple density increases and deck identity starts to emerge.",
  },
  {
    label: "Wave 3",
    pack: "Spell Ruler",
    focus: "Spell-heavy power spikes start to distort deckbuilding choices.",
  },
  {
    label: "Wave 4",
    pack: "Pharaoh's Servant",
    focus: "Collection advantage begins to matter as friend groups branch out.",
  },
] as const;

export const systemModules = [
  {
    title: "Pack engine",
    summary:
      "Server-side pull logic, set pools, pack chronology, and opening audit logs.",
  },
  {
    title: "Collection ledger",
    summary:
      "Per-copy ownership, duplicates, lock states for trades, and source traceability.",
  },
  {
    title: "Rules engine",
    summary:
      "Banlists, errata policy, card text timeline resolution, and deck legality output.",
  },
  {
    title: "EDOPro bridge",
    summary:
      "Deck export and sync layer, while duels stay inside a proven simulator.",
  },
] as const;

export const roadmapSteps = [
  "Import real set and card metadata, then seed chronological pack order.",
  "Implement server-side pack opening writes into PackOpening, PackPull, and CollectionEntry.",
  "Add deck editor screens that validate against the selected banlist snapshot.",
  "Wire friend lists and trades with row-level locks on specific collection entries.",
  "Export validated decks into an EDOPro-compatible handoff flow.",
] as const;

export const packFlowSteps = [
  {
    step: "1. Choose season",
    detail:
      "The app chooses a release-date cutoff and the pack list unlocked for that progression stage.",
  },
  {
    step: "2. Open a pack",
    detail:
      "The backend resolves pulls from SetCard rows and stores the exact outcome before the UI reveal animation starts.",
  },
  {
    step: "3. Persist the gain",
    detail:
      "Every pulled card becomes its own CollectionEntry so future trades and deck validation stay exact.",
  },
  {
    step: "4. Validate a deck",
    detail:
      "Deck legality uses ownership, the chosen banlist, and the format's errata policy in one pass.",
  },
] as const;

export const collectionRules = [
  {
    title: "One copy equals one row",
    detail:
      "This avoids fuzzy ownership counts and makes trading duplicates safe and reversible.",
  },
  {
    title: "Set-aware ownership",
    detail:
      "A collection row can point back to a specific SetCard so you know where a copy came from.",
  },
  {
    title: "Reserve on accept",
    detail:
      "Collection entries stay available during negotiation and are only reserved when the final active version is accepted.",
  },
  {
    title: "Source traceability",
    detail:
      "Each collection row records whether it came from a pack, a trade, or an admin import.",
  },
] as const;

export const rulesHighlights = [
  {
    title: "Banlists are snapshots, not global toggles",
    detail:
      "A deck chooses a banlist effective date so legality stays tied to a specific progression moment.",
  },
  {
    title: "Errata policy is format-owned",
    detail:
      "Different formats may allow latest text, freeze to snapshot text, or auto-ban cards once errata lands.",
  },
  {
    title: "Card text history is first-class",
    detail:
      "A card can have multiple CardTextVersion rows with effective dates and notes about the change.",
  },
  {
    title: "Ownership is part of legality",
    detail:
      "The deck validator checks not only rules, but also whether the user actually owns the required copies.",
  },
] as const;

export const errataPolicies = [
  {
    mode: "USE_LATEST_TEXT",
    label: "Always use latest text",
    detail:
      "Good for modern casual play where old text is not meant to create a separate metagame.",
  },
  {
    mode: "LOCK_TO_SNAPSHOT_TEXT",
    label: "Freeze to snapshot text",
    detail:
      "Best when you want historical formats to preserve the text that was active at that time.",
  },
  {
    mode: "BAN_ON_ERRATA",
    label: "Ban once errata happens",
    detail:
      "Best fit for your requested progression rule: a changed card becomes illegal from the errata date onward.",
  },
] as const;
