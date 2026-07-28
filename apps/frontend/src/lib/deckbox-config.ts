import type { DeckBoxKey } from "@ygo/contracts";

export type DeckBoxMeta = {
  key: DeckBoxKey;
  name: string;
  description: string;
  imageUrl: string;
  accentColor: string;
};

export const deckBoxCatalog: readonly DeckBoxMeta[] = [
  {
    key: "inferno-vortex",
    name: "Inferno Vortex",
    description: "Obsidianbox mit glühendem Inferno-Siegel.",
    imageUrl: "/app-assets/deckboxes/deckbox-inferno-vortex.png",
    accentColor: "#ef4f32",
  },
  {
    key: "void-eye",
    name: "Void Eye",
    description: "Schwarze Deckbox mit violettem Auge der Leere.",
    imageUrl: "/app-assets/deckboxes/deckbox-void-eye.png",
    accentColor: "#a777ff",
  },
  {
    key: "storm-eye",
    name: "Storm Eye",
    description: "Stahlblaue Box mit einem geladenen Sturmauge.",
    imageUrl: "/app-assets/deckboxes/deckbox-storm-eye.png",
    accentColor: "#69c7ff",
  },
  {
    key: "golden-dragon",
    name: "Golden Dragon",
    description: "Dunkle Premiumbox mit goldenem Drachenrelief.",
    imageUrl: "/app-assets/deckboxes/deckbox-golden-dragon.png",
    accentColor: "#e8c170",
  },
] as const;

export const defaultDeckBoxKey: DeckBoxKey = "inferno-vortex";

export function getDeckBoxMeta(key: string | null | undefined): DeckBoxMeta {
  return (
    deckBoxCatalog.find((deckBox) => deckBox.key === key) ??
    deckBoxCatalog[0]!
  );
}
