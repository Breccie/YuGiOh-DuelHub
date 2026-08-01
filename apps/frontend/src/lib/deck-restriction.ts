export type DeckRestrictionStatus =
  | "FORBIDDEN"
  | "LIMITED"
  | "SEMI_LIMITED"
  | "UNLIMITED";

type DeckRestrictionCard = {
  cardId: string;
  section: "MAIN" | "EXTRA" | "SIDE";
  quantity: number;
};

const sectionOrder = ["MAIN", "EXTRA", "SIDE"] as const;

export function getDeckRestrictionStatus(
  allowedCopies: number,
): DeckRestrictionStatus {
  if (allowedCopies <= 0) return "FORBIDDEN";
  if (allowedCopies === 1) return "LIMITED";
  if (allowedCopies === 2) return "SEMI_LIMITED";
  return "UNLIMITED";
}

export function isDeckCopyExcess(
  allowedCopies: number,
  copyOrdinal: number,
) {
  return copyOrdinal > Math.max(0, allowedCopies);
}

export function getDeckRestrictionPresentation({
  allowedCopies,
  copyOrdinal,
  usesPointLimit,
}: {
  allowedCopies: number;
  copyOrdinal: number;
  usesPointLimit: boolean;
}) {
  if (usesPointLimit) {
    const forbidden = allowedCopies <= 0;
    return {
      status: forbidden ? ("FORBIDDEN" as const) : ("UNLIMITED" as const),
      isExcess: forbidden,
    };
  }

  return {
    status: getDeckRestrictionStatus(allowedCopies),
    isExcess: isDeckCopyExcess(allowedCopies, copyOrdinal),
  };
}

export function getDeckRestrictionSectionKey(
  cardId: string,
  section: DeckRestrictionCard["section"],
) {
  return `${section}:${cardId}`;
}

export function buildDeckCopyStartOffsets(cards: DeckRestrictionCard[]) {
  const offsets = new Map<string, number>();
  const copiesByCard = new Map<string, number>();

  for (const section of sectionOrder) {
    for (const card of cards) {
      if (card.section !== section) continue;

      const currentCopies = copiesByCard.get(card.cardId) ?? 0;
      offsets.set(
        getDeckRestrictionSectionKey(card.cardId, section),
        currentCopies,
      );
      copiesByCard.set(card.cardId, currentCopies + card.quantity);
    }
  }

  return offsets;
}
