export type ErrataPolicyMode =
  | "USE_LATEST_TEXT"
  | "LOCK_TO_SNAPSHOT_TEXT"
  | "BAN_ON_ERRATA";

export type DemoTextVersion = {
  id: string;
  label: string;
  effectText: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isErrata: boolean;
};

export type DemoCard = {
  id: string;
  name: string;
  textVersions: DemoTextVersion[];
};

export type DemoBanlistEntry = {
  cardId: string;
  allowedCopies: number;
  note?: string;
};

export type DemoBanlist = {
  id: string;
  name: string;
  effectiveFrom: string;
  errataPolicy: ErrataPolicyMode;
  entries: DemoBanlistEntry[];
};

export type DemoDeckCard = {
  cardId: string;
  name: string;
  quantity: number;
  section: "MAIN" | "EXTRA" | "SIDE";
};

export type DemoDeck = {
  name: string;
  cards: DemoDeckCard[];
};

export type DemoIssue = {
  cardId: string;
  cardName: string;
  type: "BANLIST" | "ERRATA" | "OWNERSHIP";
  message: string;
};

export type DemoResolution = {
  cardId: string;
  cardName: string;
  activeTextLabel: string;
  activeTextSnippet: string;
  allowedCopies: number;
  ownedCopies: number;
  errataCutoff: string | null;
};

export type DemoLegalityPreview = {
  snapshotDate: string;
  banlistName: string;
  errataPolicy: ErrataPolicyMode;
  deck: DemoDeck;
  issues: DemoIssue[];
  resolutions: DemoResolution[];
  isLegal: boolean;
};

const demoCards: DemoCard[] = [
  {
    id: "relic-channeler",
    name: "Relic Channeler",
    textVersions: [
      {
        id: "relic-original",
        label: "Launch text",
        effectText: "If this card is Normal Summoned: draw 2 cards.",
        effectiveFrom: "2003-05-01",
        effectiveTo: "2011-09-01",
        isErrata: false,
      },
      {
        id: "relic-errata",
        label: "Post-errata text",
        effectText:
          "If this card is Normal Summoned: draw 1 card, then discard 1 card.",
        effectiveFrom: "2011-09-01",
        isErrata: true,
      },
    ],
  },
  {
    id: "vault-drake",
    name: "Vault Drake",
    textVersions: [
      {
        id: "vault-current",
        label: "Current text",
        effectText:
          "Cannot be Special Summoned. You can Tribute 2 monsters to Normal Summon this card without Tribute Set.",
        effectiveFrom: "2004-02-01",
        isErrata: false,
      },
    ],
  },
  {
    id: "ember-scribe",
    name: "Ember Scribe",
    textVersions: [
      {
        id: "ember-current",
        label: "Current text",
        effectText:
          "Add 1 Level 4 or lower monster from your GY to your hand.",
        effectiveFrom: "2004-02-01",
        isErrata: false,
      },
    ],
  },
];

const demoBanlist: DemoBanlist = {
  id: "classic-2011-autumn",
  name: "Classic Progression - Autumn 2011",
  effectiveFrom: "2011-09-01",
  errataPolicy: "BAN_ON_ERRATA",
  entries: [
    { cardId: "relic-channeler", allowedCopies: 3 },
    { cardId: "vault-drake", allowedCopies: 1 },
    { cardId: "ember-scribe", allowedCopies: 2 },
  ],
};

const demoDeck: DemoDeck = {
  name: "Starter Control",
  cards: [
    {
      cardId: "relic-channeler",
      name: "Relic Channeler",
      quantity: 2,
      section: "MAIN",
    },
    {
      cardId: "vault-drake",
      name: "Vault Drake",
      quantity: 1,
      section: "MAIN",
    },
    {
      cardId: "ember-scribe",
      name: "Ember Scribe",
      quantity: 3,
      section: "MAIN",
    },
  ],
};

const demoCollection: Record<string, number> = {
  "relic-channeler": 1,
  "vault-drake": 1,
  "ember-scribe": 2,
};

function toDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function clampTextSnippet(text: string) {
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function findCard(cardId: string) {
  const card = demoCards.find((entry) => entry.id === cardId);

  if (!card) {
    throw new Error(`Unknown card: ${cardId}`);
  }

  return card;
}

function resolveTextVersion(
  card: DemoCard,
  snapshotDate: Date,
  policy: ErrataPolicyMode,
) {
  const sorted = [...card.textVersions].sort(
    (left, right) =>
      toDate(left.effectiveFrom).getTime() - toDate(right.effectiveFrom).getTime(),
  );

  if (policy === "USE_LATEST_TEXT") {
    return sorted.at(-1) ?? null;
  }

  return (
    [...sorted]
      .reverse()
      .find((version) => {
        const from = toDate(version.effectiveFrom).getTime();
        const to = version.effectiveTo
          ? toDate(version.effectiveTo).getTime()
          : Number.POSITIVE_INFINITY;
        const current = snapshotDate.getTime();

        return current >= from && current < to;
      }) ?? sorted.at(-1) ?? null
  );
}

function getFirstErrataDate(card: DemoCard) {
  return (
    [...card.textVersions]
      .filter((version) => version.isErrata)
      .sort(
        (left, right) =>
          toDate(left.effectiveFrom).getTime() -
          toDate(right.effectiveFrom).getTime(),
      )
      .at(0)?.effectiveFrom ?? null
  );
}

function getBanlistAllowance(cardId: string) {
  return demoBanlist.entries.find((entry) => entry.cardId === cardId)?.allowedCopies ?? 3;
}

export function getDemoLegalityPreview(): DemoLegalityPreview {
  const snapshotDate = toDate("2011-09-10");
  const issues: DemoIssue[] = [];

  const resolutions = demoDeck.cards.map((deckCard) => {
    const card = findCard(deckCard.cardId);
    const errataCutoff = getFirstErrataDate(card);
    const activeTextVersion = resolveTextVersion(
      card,
      snapshotDate,
      demoBanlist.errataPolicy,
    );
    const errataBan =
      demoBanlist.errataPolicy === "BAN_ON_ERRATA" &&
      errataCutoff !== null &&
      toDate(errataCutoff).getTime() <= snapshotDate.getTime();

    const allowedCopies = errataBan ? 0 : getBanlistAllowance(deckCard.cardId);
    const ownedCopies = demoCollection[deckCard.cardId] ?? 0;

    if (errataBan) {
      issues.push({
        cardId: deckCard.cardId,
        cardName: deckCard.name,
        type: "ERRATA",
        message:
          "This format auto-bans the card from the date its oracle text changed.",
      });
    } else if (deckCard.quantity > allowedCopies) {
      issues.push({
        cardId: deckCard.cardId,
        cardName: deckCard.name,
        type: "BANLIST",
        message: `Only ${allowedCopies} copy/copies allowed under the selected banlist.`,
      });
    }

    if (deckCard.quantity > ownedCopies) {
      issues.push({
        cardId: deckCard.cardId,
        cardName: deckCard.name,
        type: "OWNERSHIP",
        message: `Deck wants ${deckCard.quantity} but the collection only owns ${ownedCopies}.`,
      });
    }

    return {
      cardId: deckCard.cardId,
      cardName: deckCard.name,
      activeTextLabel: activeTextVersion?.label ?? "No text version found",
      activeTextSnippet: clampTextSnippet(
        activeTextVersion?.effectText ?? "No text snapshot available.",
      ),
      allowedCopies,
      ownedCopies,
      errataCutoff,
    };
  });

  return {
    snapshotDate: "2011-09-10",
    banlistName: demoBanlist.name,
    errataPolicy: demoBanlist.errataPolicy,
    deck: demoDeck,
    issues,
    resolutions,
    isLegal: issues.length === 0,
  };
}
