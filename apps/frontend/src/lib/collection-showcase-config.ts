export const binderCoverCatalog = [
  {
    key: "inferno-vortex",
    name: "Inferno Vortex",
    imageUrl: "/app-assets/binders/binder-cover-inferno-vortex-clean.png",
    accentColor: "#cb5c44",
    description: "Lavaspalten und Wirbelkern für aggressive Showcase-Binder.",
  },
  {
    key: "void-eye",
    name: "Void Eye",
    imageUrl: "/app-assets/binders/binder-cover-void-eye-clean.png",
    accentColor: "#8e62da",
    description: "Mystisches Auge mit violetter Energie für dunkle Sammlungen.",
  },
  {
    key: "storm-eye",
    name: "Storm Eye",
    imageUrl: "/app-assets/binders/binder-cover-storm-eye-clean.png",
    accentColor: "#4f91ff",
    description: "Elektrischer Blick mit kaltem Metallrahmen für klare Präsentationen.",
  },
  {
    key: "golden-dragon",
    name: "Golden Dragon",
    imageUrl: "/app-assets/binders/binder-cover-golden-dragon-clean.png",
    accentColor: "#d4a661",
    description: "Goldener Drache auf schwarzem Leder für prestigeorientierte Binder.",
  },
] as const;

export type BinderCoverKey = (typeof binderCoverCatalog)[number]["key"];

export type CollectionLayoutModeValue = "BINDER" | "GRID";
export type CollectionSortModeValue =
  | "MOST_COPIES"
  | "NEWEST_ACQUIRED"
  | "ALPHABETICAL"
  | "RARITY";

export function getBinderCoverMeta(key: string | null | undefined) {
  return (
    binderCoverCatalog.find((cover) => cover.key === key) ??
    binderCoverCatalog[0]
  );
}

export function getCollectionSortLabel(sortMode: CollectionSortModeValue) {
  switch (sortMode) {
    case "NEWEST_ACQUIRED":
      return "Neueste zuerst";
    case "ALPHABETICAL":
      return "Name A-Z";
    case "RARITY":
      return "Seltenheit";
    default:
      return "Meiste Kopien";
  }
}
