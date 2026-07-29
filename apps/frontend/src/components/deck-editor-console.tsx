"use client";

import Image from "next/image";
import Link from "next/link";
import type {
  CardCatalogSort,
  CardCatalogItem,
  CardOwnershipFilter,
  DeckBoxKey,
  DeckSortMode,
  DeckSectionValue,
} from "@ygo/contracts";
import type { DragEvent, MouseEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import { cardCatalogClient } from "@/lib/card-catalog-client";
import { deckClient } from "@/lib/deck-client";
import { deckBoxCatalog, defaultDeckBoxKey } from "@/lib/deckbox-config";
import type { DeckIssueType, DeckLegalitySnapshot } from "@/lib/deck-legality";
import { sortDeckCards } from "@/lib/deck-sort";
import { wishlistClient } from "@/lib/wishlist-client";

type DeckEditorConsoleProps = {
  activeDeck: DeckLegalitySnapshot["activeDeck"];
  availableBanlists: DeckLegalitySnapshot["editor"]["availableBanlists"];
  collectionCards: DeckLegalitySnapshot["editor"]["collectionCards"];
};

type DeckCard = NonNullable<DeckLegalitySnapshot["activeDeck"]>["cards"][number];
type CollectionCard = CardCatalogItem;
type DeckSection = DeckSectionValue;
type KindFilter = "ALL" | "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
type LimitFilter = "ALL" | "LEGAL" | "FORBIDDEN" | "LIMITED" | "SEMI_LIMITED";
type MobileEditorView = "CATALOG" | "DECK" | "DETAILS";
type PreviewTarget =
  | { source: "collection"; cardId: string }
  | { source: "deck"; cardId: string; section: DeckSection };
type DragCardPayload =
  | {
      source: "collection";
      cardId: string;
    }
  | {
      source: "deck";
      cardId: string;
      section: DeckSection;
    };

const deckCardDragMime = "application/x-ygo-card";
const existingDeckCardDragMime = "application/x-ygo-deck-card";
const deckSortStorageKey = "deck-editor-sort-mode";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function bindCatalogCardToDeck(
  card: CardCatalogItem,
  deckCards: DeckCard[],
): CardCatalogItem {
  const matchingCards = deckCards.filter((entry) => entry.cardId === card.cardId);
  const countSection = (section: DeckSection) =>
    matchingCards
      .filter((entry) => entry.section === section)
      .reduce((sum, entry) => sum + entry.quantity, 0);
  const mainCopies = countSection("MAIN");
  const extraCopies = countSection("EXTRA");
  const sideCopies = countSection("SIDE");

  return {
    ...card,
    deckCopies: mainCopies + extraCopies + sideCopies,
    mainCopies,
    extraCopies,
    sideCopies,
  };
}

function getDeckCardKey(cardId: string, section: DeckSection) {
  return `${cardId}:${section}`;
}

function buildDeckCard(
  card: CollectionCard,
  section: DeckSection,
  quantity: number,
): DeckCard {
  return {
    cardId: card.cardId,
    cardName: card.name,
    kind: card.kind,
    attribute: card.attribute,
    monsterType: card.monsterType,
    levelRankLink: card.levelRankLink,
    atk: card.atk,
    def: card.def,
    imageUrl: card.imageUrl,
    section,
    quantity,
    allowedCopies: card.legalLimit,
    pointValue: card.pointValue,
    availableCopies: card.availableCopies,
    reservedCopies: card.reservedCopies,
    tradedCopies: card.tradedCopies,
    activeTextLabel: "Aktueller Kartentext",
    activeTextSnippet: card.oracleText ?? "Kein Text verfügbar.",
    errataCutoff: card.errataCutoff,
    issues: [],
  };
}

function withDeckCardQuantity(
  deck: NonNullable<DeckLegalitySnapshot["activeDeck"]>,
  card: CollectionCard | null,
  cardId: string,
  section: DeckSection,
  quantity: number,
) {
  const existing = deck.cards.find(
    (entry) => entry.cardId === cardId && entry.section === section,
  );
  const cards =
    quantity <= 0
      ? deck.cards.filter(
          (entry) => !(entry.cardId === cardId && entry.section === section),
        )
      : existing
        ? deck.cards.map((entry) =>
            entry.cardId === cardId && entry.section === section
              ? { ...entry, quantity }
              : entry,
          )
        : card
          ? [...deck.cards, buildDeckCard(card, section, quantity)]
          : deck.cards;
  const countSection = (target: DeckSection) =>
    cards
      .filter((entry) => entry.section === target)
      .reduce((sum, entry) => sum + entry.quantity, 0);

  return {
    ...deck,
    cards,
    cardCount: cards.reduce((sum, entry) => sum + entry.quantity, 0),
    mainCount: countSection("MAIN"),
    extraCount: countSection("EXTRA"),
    sideCount: countSection("SIDE"),
  };
}

function getDeckQuantityMap(
  deck: DeckLegalitySnapshot["activeDeck"],
) {
  return new Map(
    (deck?.cards ?? []).map((card) => [
      getDeckCardKey(card.cardId, card.section),
      card.quantity,
    ]),
  );
}

function getKindLabel(kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN") {
  if (kind === "MONSTER") {
    return "Monster";
  }

  if (kind === "SPELL") {
    return "Zauber";
  }

  if (kind === "TRAP") {
    return "Falle";
  }

  return "Token";
}

function getSectionLabel(section: DeckSection) {
  if (section === "MAIN") {
    return "Main Deck";
  }

  if (section === "EXTRA") {
    return "Extra Deck";
  }

  return "Side Deck";
}

function getSectionTone(section: DeckSection) {
  if (section === "MAIN") {
    return "teal" as const;
  }

  if (section === "EXTRA") {
    return "gold" as const;
  }

  return "slate" as const;
}

function getIssueTone(type: DeckIssueType) {
  if (type === "OWNERSHIP") {
    return "gold" as const;
  }

  return "ember" as const;
}

function getIssueLabel(type: DeckIssueType) {
  if (type === "BANLIST") {
    return "Bannliste";
  }

  if (type === "ERRATA") {
    return "Errata";
  }

  if (type === "DECK_SIZE") {
    return "Deckgröße";
  }

  if (type === "POINTS") {
    return "Punkte";
  }

  return "Besitz";
}

function getLimitLabel(value: number) {
  if (value <= 0) {
    return "Verboten";
  }

  if (value === 1) {
    return "Limitiert";
  }

  if (value === 2) {
    return "Semi-limitiert";
  }

  return "Unbegrenzt";
}

function getLimitTone(value: number) {
  if (value <= 0) {
    return "ember" as const;
  }

  if (value < 3) {
    return "gold" as const;
  }

  return "teal" as const;
}

function getLimitShortLabel(value: number) {
  if (value <= 0) {
    return "0";
  }

  if (value >= 3) {
    return "3";
  }

  return String(value);
}

function formatPointValue(value: number) {
  return `${value} P`;
}

function isExtraDeckMonster(card: Pick<CollectionCard | DeckCard, "kind" | "monsterType">) {
  if (card.kind !== "MONSTER" || !card.monsterType) {
    return false;
  }

  return /\b(Fusion|Synchro|Xyz|Link)\b/i.test(card.monsterType);
}

function getDefaultSectionForCard(card: CollectionCard): DeckSection {
  return isExtraDeckMonster(card) ? "EXTRA" : "MAIN";
}

function encodeDragPayload(payload: DragCardPayload) {
  return JSON.stringify(payload);
}

function decodeDragPayload(value: string) {
  if (value.startsWith("ygo-card:")) {
    const [, source, cardId, section] = value.split(":");

    if (source === "collection" && cardId) {
      return { source, cardId } satisfies DragCardPayload;
    }

    if (
      source === "deck" &&
      cardId &&
      (section === "MAIN" || section === "EXTRA" || section === "SIDE")
    ) {
      return { source, cardId, section } satisfies DragCardPayload;
    }
  }

  try {
    const parsed = JSON.parse(value) as Partial<DragCardPayload>;

    if (parsed.source === "collection" && typeof parsed.cardId === "string") {
      return parsed as DragCardPayload;
    }

    if (
      parsed.source === "deck" &&
      typeof parsed.cardId === "string" &&
      (parsed.section === "MAIN" ||
        parsed.section === "EXTRA" ||
        parsed.section === "SIDE")
    ) {
      return parsed as DragCardPayload;
    }
  } catch {
    return null;
  }

  return null;
}

function CollectionBrowserCard({
  card,
  selected,
  disabled,
  usesPointLimit,
  onAdd,
  onRemove,
  onPreview,
  onDragStart,
}: {
  card: CollectionCard;
  selected: boolean;
  disabled: boolean;
  usesPointLimit: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  const canAdd = card.deckCopies < 3;
  const canRemove = card.deckCopies > 0;

  function handleClick() {
    onPreview();

    if (!disabled && canAdd) {
      onAdd();
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    onPreview();

    if (!disabled && canRemove) {
      onRemove();
    }
  }

  return (
    <button
      type="button"
      draggable={!disabled && canAdd}
      onDragStart={onDragStart}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title="Linksklick: hinzufügen. Rechtsklick: entfernen. Ziehen: in eine Deckzone legen."
      className={classes(
        "group relative rounded-[5px] border p-1 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        !card.owned
          ? "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.012)]"
          : selected
          ? "border-[#b8df28] bg-[rgba(184,223,40,0.08)] shadow-[0_0_0_1px_rgba(184,223,40,0.22)]"
          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(207,91,66,0.18)] hover:bg-[rgba(255,255,255,0.04)]",
      )}
      disabled={disabled && !canRemove}
    >
      <div className="relative aspect-[59/86] overflow-hidden rounded-[3px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 1536px) 22vw, 12vw"
            draggable={false}
            className={classes(
              "pointer-events-none select-none object-cover transition-opacity duration-150 [-webkit-user-drag:none]",
              card.owned
                ? "opacity-100"
                : "opacity-[0.65] group-hover:opacity-[0.82] group-focus-visible:opacity-[0.82]",
            )}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[#ead9c3]">
            {card.name}
          </div>
        )}
        <span className="absolute bottom-1 right-1 rounded-[3px] bg-[rgba(8,10,14,0.88)] px-1.5 py-0.5 text-[0.58rem] font-bold text-[#f1dfc8]">
          {card.owned ? `×${card.availableCopies}` : "0"}
        </span>
        <span
          className={classes(
            "absolute right-1 top-1 rounded-[3px] border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase",
            usesPointLimit && card.legalLimit <= 0
              ? "border-[rgba(204,97,78,0.34)] bg-[rgba(141,61,48,0.72)] text-[#ffd5cd]"
              : usesPointLimit
              ? "border-[rgba(208,170,110,0.34)] bg-[rgba(104,76,35,0.72)] text-[#ffe0af]"
              : card.legalLimit <= 0
              ? "border-[rgba(204,97,78,0.34)] bg-[rgba(141,61,48,0.72)] text-[#ffd5cd]"
              : card.legalLimit < 3
                ? "border-[rgba(208,170,110,0.34)] bg-[rgba(104,76,35,0.72)] text-[#ffe0af]"
                : "border-[rgba(88,163,169,0.26)] bg-[rgba(24,72,78,0.72)] text-[#c7f1f1]",
          )}
        >
          {usesPointLimit && card.legalLimit <= 0
            ? "0"
            : usesPointLimit
              ? formatPointValue(card.pointValue)
              : getLimitShortLabel(card.legalLimit)}
        </span>
      </div>

      <span className="pointer-events-none absolute inset-x-1 bottom-1 translate-y-1 rounded-[4px] bg-[rgba(4,6,9,0.96)] px-2 py-1 text-center text-[0.62rem] font-semibold leading-4 text-[#f6ebdb] opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        {card.name}
      </span>
    </button>
  );
}

function DeckZoneCompact({
  title,
  section,
  cards,
  selectedTarget,
  isSubmitting,
  usesPointLimit,
  onSelect,
  onDropCard,
  onMoveCard,
  onRemoveOne,
}: {
  title: string;
  section: DeckSection;
  cards: DeckCard[];
  selectedTarget: PreviewTarget | null;
  isSubmitting: boolean;
  usesPointLimit: boolean;
  onSelect: (target: PreviewTarget) => void;
  onDropCard: (cardId: string, section: DeckSection) => void;
  onMoveCard: (
    cardId: string,
    fromSection: DeckSection,
    toSection: DeckSection,
  ) => void;
  onRemoveOne: (card: DeckCard) => void;
}) {
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const [dragDepth, setDragDepth] = useState(0);
  const isDragTarget = dragDepth > 0;

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (isSubmitting) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(
      existingDeckCardDragMime,
    )
      ? "move"
      : "copy";
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (isSubmitting) {
      return;
    }

    event.preventDefault();
    setDragDepth((current) => current + 1);
  }

  function handleDragLeave() {
    setDragDepth((current) => Math.max(0, current - 1));
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragDepth(0);

    if (isSubmitting) {
      return;
    }

    const payload = decodeDragPayload(
      event.dataTransfer.getData(existingDeckCardDragMime) ||
        event.dataTransfer.getData(deckCardDragMime) ||
        event.dataTransfer.getData("text/plain"),
    );

    if (payload?.source === "collection") {
      onDropCard(payload.cardId, section);
    } else if (payload?.source === "deck") {
      onMoveCard(payload.cardId, payload.section, section);
    }
  }

  return (
    <section
      role="group"
      aria-label={`${title} Deckbereich`}
      data-deck-section={section}
      className={classes(
        "deck-editor-zone rounded-[7px] border bg-[linear-gradient(180deg,rgba(15,25,32,0.96),rgba(8,14,20,0.98))] p-2 transition duration-150",
        isDragTarget
          ? "border-[#b8df28] bg-[rgba(184,223,40,0.07)] shadow-[inset_0_0_0_1px_rgba(184,223,40,0.2),0_0_24px_rgba(184,223,40,0.08)]"
          : "border-[rgba(255,255,255,0.1)] hover:border-[rgba(88,163,169,0.28)]",
        section === "MAIN" ? "min-h-[15rem] flex-1" : "min-h-[6.5rem]",
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] px-1 pb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#dfe9e6]">
          {title}
        </p>
        <span className="text-xs font-semibold tabular-nums text-[#b8df28]">
          {totalCards}
        </span>
      </div>

      {cards.length ? (
        <div className="mt-2 grid grid-cols-5 content-start gap-1.5 overflow-y-auto pr-1 sm:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10">
          {cards.flatMap((card) =>
            Array.from({ length: card.quantity }, (_, copyIndex) => ({
              card,
              copyIndex,
            })),
          ).map(({ card, copyIndex }) => {
            const isSelected =
              selectedTarget?.source === "deck" &&
              selectedTarget.cardId === card.cardId &&
              selectedTarget.section === card.section;
            const ownedCopies = card.availableCopies + card.reservedCopies;
            const isMissingCopy = copyIndex >= ownedCopies;

            return (
              <button
                key={`${card.cardId}-${card.section}-${copyIndex}`}
                type="button"
                aria-label={`${card.cardName}, Kopie ${copyIndex + 1}${
                  isMissingCopy ? ", nicht im Besitz" : ""
                }`}
                draggable={!isSubmitting}
                onDragStart={(event) => {
                  const payload: DragCardPayload = {
                    source: "deck",
                    cardId: card.cardId,
                    section: card.section,
                  };
                  const encodedPayload = encodeDragPayload(payload);
                  event.dataTransfer.setData(
                    existingDeckCardDragMime,
                    encodedPayload,
                  );
                  event.dataTransfer.setData(deckCardDragMime, encodedPayload);
                  event.dataTransfer.setData(
                    "text/plain",
                    `ygo-card:deck:${card.cardId}:${card.section}`,
                  );
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() =>
                  onSelect({
                    source: "deck",
                    cardId: card.cardId,
                    section: card.section,
                  })
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelect({
                    source: "deck",
                    cardId: card.cardId,
                    section: card.section,
                  });
                  onRemoveOne(card);
                }}
                title="Rechtsklick entfernt eine Kopie."
                className={classes(
                  "group relative rounded-[4px] border p-0.5 text-left transition",
                  isSelected
                    ? "border-[#b8df28] bg-[rgba(184,223,40,0.08)] shadow-[0_0_0_1px_rgba(184,223,40,0.18)]"
                    : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(207,91,66,0.18)]",
                )}
              >
                <div className="relative aspect-[59/86] overflow-hidden rounded-[2px] bg-[rgba(255,255,255,0.03)]">
                  {card.imageUrl ? (
                    <Image
                      src={card.imageUrl}
                      alt={card.cardName}
                      fill
                      sizes="96px"
                      draggable={false}
                      className={classes(
                        "pointer-events-none select-none object-cover transition-opacity duration-150 [-webkit-user-drag:none]",
                        isMissingCopy
                          ? "opacity-[0.65] group-hover:opacity-[0.82] group-focus-visible:opacity-[0.82]"
                          : "opacity-100",
                      )}
                      unoptimized
                    />
                  ) : (
                    <div
                      className={classes(
                        "flex h-full items-center justify-center px-2 text-center text-[0.6rem] font-semibold text-[#ead9c3] transition-opacity",
                        isMissingCopy
                          ? "opacity-[0.65] group-hover:opacity-[0.82] group-focus-visible:opacity-[0.82]"
                          : "opacity-100",
                      )}
                    >
                      {card.cardName}
                    </div>
                  )}

                  {isMissingCopy ? (
                    <span className="absolute bottom-1 left-1 rounded-[3px] border border-[rgba(204,97,78,0.38)] bg-[rgba(102,31,24,0.88)] px-1 py-0.5 text-[0.48rem] font-bold uppercase text-[#ffd7cf]">
                      Fehlt
                    </span>
                  ) : null}

                  <span
                    className={classes(
                      "absolute right-1 top-1 rounded-[3px] border px-1 py-0.5 text-[0.5rem] font-bold text-[#f2dfc8]",
                      usesPointLimit && card.allowedCopies <= 0
                        ? "border-[rgba(204,97,78,0.34)] bg-[rgba(141,61,48,0.72)]"
                        : usesPointLimit
                        ? "border-[rgba(208,170,110,0.34)] bg-[rgba(104,76,35,0.72)]"
                        : card.allowedCopies <= 0
                        ? "border-[rgba(204,97,78,0.34)] bg-[rgba(141,61,48,0.72)]"
                        : card.allowedCopies < 3
                          ? "border-[rgba(208,170,110,0.34)] bg-[rgba(104,76,35,0.72)]"
                          : "border-[rgba(88,163,169,0.26)] bg-[rgba(24,72,78,0.72)]",
                    )}
                  >
                    {usesPointLimit && card.allowedCopies <= 0
                      ? "0"
                      : usesPointLimit
                        ? formatPointValue(card.pointValue)
                        : getLimitShortLabel(card.allowedCopies)}
                  </span>
                </div>

              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 flex min-h-[3.5rem] items-center justify-center text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#65737d]">
          {isDragTarget ? "Hier ablegen" : "Leer"}
        </div>
      )}
    </section>
  );
}

export function DeckEditorConsole({
  activeDeck: initialActiveDeck,
  availableBanlists,
  collectionCards: initialCollectionCards,
}: DeckEditorConsoleProps) {
  const router = useRouter();
  const [activeDeck, setActiveDeck] = useState(initialActiveDeck);
  const [collectionCards, setCollectionCards] = useState<CardCatalogItem[]>(
    initialCollectionCards.map((card) => ({
      ...card,
      slug: card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      owned: card.totalCopies > 0,
      setCodes: [],
    })),
  );
  const [createDeckName, setCreateDeckName] = useState("");
  const [createDeckBoxKey, setCreateDeckBoxKey] =
    useState<DeckBoxKey>(defaultDeckBoxKey);
  const [activeDeckName, setActiveDeckName] = useState(activeDeck?.name ?? "");
  const [activeDeckBoxKey, setActiveDeckBoxKey] = useState<DeckBoxKey>(
    (activeDeck?.deckBoxKey as DeckBoxKey | undefined) ?? defaultDeckBoxKey,
  );
  const [activeBanlistId, setActiveBanlistId] = useState(
    activeDeck?.banlistId ?? availableBanlists[0]?.id ?? "",
  );
  const [activeSnapshotDate, setActiveSnapshotDate] = useState(
    activeDeck?.snapshotDate.slice(0, 10) ?? "",
  );
  const [cardSearch, setCardSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [limitFilter, setLimitFilter] = useState<LimitFilter>("ALL");
  const [rarityFilter, setRarityFilter] = useState("ALL");
  const [catalogSort, setCatalogSort] = useState<CardCatalogSort>("NAME_ASC");
  const [deckSortMode, setDeckSortMode] =
    useState<DeckSortMode>("TYPE_LEVEL");
  const [ownershipFilter, setOwnershipFilter] =
    useState<CardOwnershipFilter>("ALL");
  const [catalogTotal, setCatalogTotal] = useState(initialCollectionCards.length);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [mobileEditorView, setMobileEditorView] = useState<MobileEditorView>("CATALOG");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCardKeys, setPendingCardKeys] = useState<string[]>([]);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const catalogRequestRef = useRef(0);
  const activeDeckRef = useRef(activeDeck);
  const confirmedQuantitiesRef = useRef(getDeckQuantityMap(activeDeck));
  const desiredQuantitiesRef = useRef(new Map<string, number>());
  const runningQuantityWorkersRef = useRef(new Set<string>());
  const runningMoveCountRef = useRef(0);
  const reconcileGenerationRef = useRef(0);
  const deckSortHydratedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredCardSearch = useDeferredValue(cardSearch);

  useEffect(() => {
    activeDeckRef.current = activeDeck;
  }, [activeDeck]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(deckSortStorageKey);
    queueMicrotask(() => {
      if (
        savedMode === "TYPE_LEVEL" ||
        savedMode === "NAME_ASC" ||
        savedMode === "NAME_DESC" ||
        savedMode === "ATK_DESC"
      ) {
        setDeckSortMode(savedMode);
      }
      deckSortHydratedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!deckSortHydratedRef.current) return;
    window.localStorage.setItem(deckSortStorageKey, deckSortMode);
  }, [deckSortMode]);

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.key === "/" && !isTyping) || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setMobileEditorView("CATALOG");
      } else if (event.key === "Escape" && !isTyping && !deleteConfirmationOpen) {
        router.push("/decks");
      }
    }

    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [deleteConfirmationOpen, router]);

  useEffect(() => {
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    queueMicrotask(() => {
      if (catalogRequestRef.current !== requestId) return;
      setCatalogLoading(true);
      setCatalogError("");
    });

    void cardCatalogClient
      .search({
        q: deferredCardSearch.trim(),
        ownership: ownershipFilter,
        kind: kindFilter === "ALL" ? undefined : kindFilter,
        rarity: rarityFilter === "ALL" ? undefined : rarityFilter,
        banlistId: activeBanlistId || undefined,
        banlistStatus: limitFilter,
        sort: catalogSort,
        limit: 60,
      })
      .then((payload) => {
        if (catalogRequestRef.current !== requestId) return;
        setCollectionCards(payload.items);
        setCatalogTotal(payload.total);
        setCatalogCursor(payload.nextCursor);
      })
      .catch((catalogError) => {
        if (catalogRequestRef.current === requestId) {
          setCatalogError(getApiErrorMessage(catalogError, "Kartenkatalog konnte nicht geladen werden."));
        }
      })
      .finally(() => {
        if (catalogRequestRef.current === requestId) setCatalogLoading(false);
      });

    return () => {
      if (catalogRequestRef.current === requestId) catalogRequestRef.current += 1;
    };
  }, [
    activeBanlistId,
    catalogRevision,
    catalogSort,
    deferredCardSearch,
    kindFilter,
    limitFilter,
    ownershipFilter,
    rarityFilter,
  ]);

  const mainCards = useMemo(
    () =>
      sortDeckCards(
        activeDeck?.cards.filter((card) => card.section === "MAIN") ?? [],
        deckSortMode,
      ),
    [activeDeck?.cards, deckSortMode],
  );
  const extraCards = useMemo(
    () =>
      sortDeckCards(
        activeDeck?.cards.filter((card) => card.section === "EXTRA") ?? [],
        deckSortMode,
      ),
    [activeDeck?.cards, deckSortMode],
  );
  const sideCards = useMemo(
    () =>
      sortDeckCards(
        activeDeck?.cards.filter((card) => card.section === "SIDE") ?? [],
        deckSortMode,
      ),
    [activeDeck?.cards, deckSortMode],
  );
  const allDeckCards = useMemo(() => activeDeck?.cards ?? [], [activeDeck?.cards]);
  const selectedBanlist = useMemo(
    () => availableBanlists.find((banlist) => banlist.id === activeBanlistId) ?? null,
    [activeBanlistId, availableBanlists],
  );
  const usesGenesisRules = useMemo(
    () =>
      selectedBanlist
        ? selectedBanlist.pointLimit !== null
        : Boolean(activeDeck?.usesPointLimit),
    [activeDeck?.usesPointLimit, selectedBanlist],
  );

  const filteredCollectionCards = useMemo(
    () =>
      collectionCards.map((card) =>
        bindCatalogCardToDeck(card, activeDeck?.cards ?? []),
      ),
    [activeDeck?.cards, collectionCards],
  );

  const rarityOptions = useMemo(
    () => Array.from(new Set(collectionCards.flatMap((card) => card.rarities))).sort(),
    [collectionCards],
  );

  const resolvedPreview = useMemo(() => {
    if (previewTarget?.source === "collection") {
      const card = filteredCollectionCards.find((entry) => entry.cardId === previewTarget.cardId);

      if (card) {
        const deckCard = allDeckCards.find((entry) => entry.cardId === card.cardId) ?? null;

        return {
          source: "collection" as const,
          card,
          deckCard,
        };
      }
    }

    if (previewTarget?.source === "deck") {
      const card =
        allDeckCards.find(
          (entry) =>
            entry.cardId === previewTarget.cardId &&
            entry.section === previewTarget.section,
        ) ?? null;

      if (card) {
        const collectionCard =
          filteredCollectionCards.find((entry) => entry.cardId === card.cardId) ?? null;

        return {
          source: "deck" as const,
          card,
          collectionCard,
        };
      }
    }

    const fallbackCollectionCard = filteredCollectionCards[0] ?? null;

    if (fallbackCollectionCard) {
      const deckCard =
        allDeckCards.find((entry) => entry.cardId === fallbackCollectionCard.cardId) ?? null;

      return {
        source: "collection" as const,
        card: fallbackCollectionCard,
        deckCard,
      };
    }

    const fallbackDeckCard = allDeckCards[0] ?? null;

    if (fallbackDeckCard) {
      const collectionCard =
        filteredCollectionCards.find((entry) => entry.cardId === fallbackDeckCard.cardId) ?? null;

      return {
        source: "deck" as const,
        card: fallbackDeckCard,
        collectionCard,
      };
    }

    return null;
  }, [allDeckCards, filteredCollectionCards, previewTarget]);

  async function runMutation(task: () => Promise<void>) {
    try {
      setError("");
      setSuccess("");
      setIsSubmitting(true);
      await task();
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError, "Aktion konnte nicht abgeschlossen werden."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoadMoreCatalogCards() {
    if (!catalogCursor || catalogLoading) return;
    const requestId = catalogRequestRef.current;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const payload = await cardCatalogClient.search({
        q: deferredCardSearch.trim(),
        ownership: ownershipFilter,
        kind: kindFilter === "ALL" ? undefined : kindFilter,
        rarity: rarityFilter === "ALL" ? undefined : rarityFilter,
        banlistId: activeBanlistId || undefined,
        banlistStatus: limitFilter,
        sort: catalogSort,
        cursor: catalogCursor,
        limit: 60,
      });
      if (catalogRequestRef.current !== requestId) return;
      setCollectionCards((current) => {
        const known = new Set(current.map((card) => card.cardId));
        return [
          ...current,
          ...payload.items
            .filter((card) => !known.has(card.cardId)),
        ];
      });
      setCatalogCursor(payload.nextCursor);
      setCatalogTotal(payload.total);
    } catch (catalogError) {
      if (catalogRequestRef.current === requestId) {
        setCatalogError(getApiErrorMessage(catalogError, "Weitere Karten konnten nicht geladen werden."));
      }
    } finally {
      if (catalogRequestRef.current === requestId) setCatalogLoading(false);
    }
  }

  async function refreshEditorSnapshot(deckId: string) {
    const payload = await deckClient.getEditorOverview(deckId);
    setActiveDeck(payload.activeDeck);
    activeDeckRef.current = payload.activeDeck;
    confirmedQuantitiesRef.current = getDeckQuantityMap(payload.activeDeck);
    if (payload.activeDeck) {
      setActiveDeckBoxKey(
        (payload.activeDeck.deckBoxKey as DeckBoxKey) ?? defaultDeckBoxKey,
      );
    }
    setCatalogRevision((revision) => revision + 1);
  }

  async function reconcileEditorSnapshotWhenIdle(deckId: string) {
    if (
      runningQuantityWorkersRef.current.size > 0 ||
      runningMoveCountRef.current > 0 ||
      desiredQuantitiesRef.current.size > 0
    ) {
      return;
    }

    const generation = reconcileGenerationRef.current + 1;
    reconcileGenerationRef.current = generation;

    try {
      const payload = await deckClient.getEditorOverview(deckId);
      if (
        reconcileGenerationRef.current !== generation ||
        runningQuantityWorkersRef.current.size > 0 ||
        runningMoveCountRef.current > 0 ||
        desiredQuantitiesRef.current.size > 0
      ) {
        return;
      }

      setActiveDeck(payload.activeDeck);
      activeDeckRef.current = payload.activeDeck;
      confirmedQuantitiesRef.current = getDeckQuantityMap(payload.activeDeck);
    } catch (caughtError) {
      setError(
        getApiErrorMessage(
          caughtError,
          "Der bestätigte Deckstand konnte nicht abgeglichen werden.",
        ),
      );
    }
  }

  async function handleCreateDeck() {
    await runMutation(async () => {
      const payload = await deckClient.create({
        name: createDeckName,
        deckBoxKey: createDeckBoxKey,
        banlistId: availableBanlists[0]?.id ?? null,
      });

      if (payload.deck?.id) {
        setSuccess(`Deck "${payload.deck.name}" wurde erstellt.`);
        setCreateDeckName("");
        router.push(`/decks/${payload.deck.id}/edit`);
        router.refresh();
      }
    });
  }

  async function handleUpdateDeck() {
    if (!activeDeck) {
      return;
    }

    await runMutation(async () => {
      const payload = await deckClient.update(activeDeck.id, {
        name: activeDeckName,
        deckBoxKey: activeDeckBoxKey,
        banlistId: activeBanlistId || null,
        snapshotDate: activeSnapshotDate || null,
      });

      setSuccess(`Deck "${payload.deck?.name ?? activeDeck.name}" wurde aktualisiert.`);
      await refreshEditorSnapshot(activeDeck.id);
    });
  }

  async function handleChangeActiveBanlist(nextBanlistId: string) {
    const nextBanlist =
      availableBanlists.find((banlist) => banlist.id === nextBanlistId) ?? null;

    if (!activeDeck) {
      setActiveBanlistId(nextBanlistId);
      return;
    }

    setActiveBanlistId(nextBanlistId);

    await runMutation(async () => {
      const payload = await deckClient.update(activeDeck.id, {
        name: activeDeckName,
        deckBoxKey: activeDeckBoxKey,
        banlistId: nextBanlistId || null,
        snapshotDate: activeSnapshotDate || null,
      });

      setSuccess(
        `Bannliste für "${payload.deck?.name ?? activeDeck.name}" wurde auf "${
          nextBanlist?.name ?? "ausgewählte Liste"
        }" aktualisiert.`,
      );
      await refreshEditorSnapshot(activeDeck.id);
    });
  }

  async function handleDeleteDeck() {
    if (!activeDeck) {
      return;
    }

    await runMutation(async () => {
      await deckClient.remove(activeDeck.id);
      setSuccess(`Deck "${activeDeck.name}" wurde gelöscht.`);
      router.push("/decks");
      router.refresh();
    });
  }

  async function handleSetCardQuantity(
    cardId: string,
    section: DeckSection,
    quantity: number,
  ) {
    if (!activeDeck) {
      return;
    }

    await runCardMutation(cardId, section, quantity);
  }

  async function handleRemoveCard(cardId: string, section: DeckSection) {
    if (!activeDeck) {
      return;
    }

    await runCardMutation(cardId, section, 0);
  }

  async function runCardMutation(
    cardId: string,
    section: DeckSection,
    quantity: number,
  ) {
    const deck = activeDeckRef.current;
    if (!deck) return;

    const pendingKey = getDeckCardKey(cardId, section);
    const collectionCard = filteredCollectionCards.find(
      (card) => card.cardId === cardId,
    );
    const targetQuantity = Math.max(0, Math.min(3, quantity));
    if (targetQuantity > 0 && !collectionCard) return;

    desiredQuantitiesRef.current.set(pendingKey, targetQuantity);
    setError("");
    setSuccess("");
    setActiveDeck((current) => {
      if (!current) return current;
      const next = withDeckCardQuantity(
        current,
        collectionCard ?? null,
        cardId,
        section,
        targetQuantity,
      );
      activeDeckRef.current = next;
      return next;
    });

    if (runningQuantityWorkersRef.current.has(pendingKey)) return;

    runningQuantityWorkersRef.current.add(pendingKey);
    setPendingCardKeys((current) =>
      current.includes(pendingKey) ? current : [...current, pendingKey],
    );
    try {
      while (desiredQuantitiesRef.current.has(pendingKey)) {
        const desiredQuantity = desiredQuantitiesRef.current.get(pendingKey)!;
        if (desiredQuantity <= 0) {
          await deckClient.removeCard(deck.id, { cardId, section });
        } else {
          await deckClient.upsertCard(deck.id, {
            cardId,
            section,
            quantity: desiredQuantity,
          });
        }

        confirmedQuantitiesRef.current.set(pendingKey, desiredQuantity);
        if (desiredQuantitiesRef.current.get(pendingKey) === desiredQuantity) {
          desiredQuantitiesRef.current.delete(pendingKey);
        }
      }
    } catch (caughtError) {
      desiredQuantitiesRef.current.delete(pendingKey);
      const confirmedQuantity =
        confirmedQuantitiesRef.current.get(pendingKey) ?? 0;
      setActiveDeck((current) => {
        if (!current) return current;
        const next = withDeckCardQuantity(
          current,
          collectionCard ?? null,
          cardId,
          section,
          confirmedQuantity,
        );
        activeDeckRef.current = next;
        return next;
      });
      setError(
        getApiErrorMessage(
          caughtError,
          "Kartenänderung konnte nicht gespeichert werden.",
        ),
      );
    } finally {
      runningQuantityWorkersRef.current.delete(pendingKey);
      setPendingCardKeys((current) =>
        current.filter((key) => key !== pendingKey),
      );
      void reconcileEditorSnapshotWhenIdle(deck.id);
    }
  }

  function findDeckCard(cardId: string, section: DeckSection) {
    return activeDeckRef.current?.cards.find(
      (entry) => entry.cardId === cardId && entry.section === section,
    );
  }

  function getPlannedCardQuantity(cardId: string, section: DeckSection) {
    const key = getDeckCardKey(cardId, section);
    return (
      desiredQuantitiesRef.current.get(key) ??
      findDeckCard(cardId, section)?.quantity ??
      0
    );
  }

  async function handleAddCollectionCard(card: CollectionCard, section = getDefaultSectionForCard(card)) {
    if (
      !activeDeckRef.current ||
      !canAddCollectionCard(card)
    ) {
      return;
    }

    await handleSetCardQuantity(
      card.cardId,
      section,
      getPlannedCardQuantity(card.cardId, section) + 1,
    );
  }

  async function handleAddCardToSection(cardId: string, section: DeckSection) {
    const card = filteredCollectionCards.find((entry) => entry.cardId === cardId);

    if (!card) {
      return;
    }

    await handleAddCollectionCard(card, section);
  }

  async function handleMoveDeckCard(
    cardId: string,
    fromSection: DeckSection,
    toSection: DeckSection,
  ) {
    const deck = activeDeckRef.current;
    if (!deck || fromSection === toSection) {
      return;
    }

    const fromKey = getDeckCardKey(cardId, fromSection);
    const toKey = getDeckCardKey(cardId, toSection);

    if (
      pendingCardKeys.includes(fromKey) ||
      pendingCardKeys.includes(toKey)
    ) {
      return;
    }

    const sourceCard = deck.cards.find(
      (card) => card.cardId === cardId && card.section === fromSection,
    );
    const targetCard = deck.cards.find(
      (card) => card.cardId === cardId && card.section === toSection,
    );

    if (!sourceCard) {
      return;
    }

    const sourceQuantity = sourceCard.quantity;
    const targetQuantity = targetCard?.quantity ?? 0;
    const collectionCard =
      filteredCollectionCards.find((card) => card.cardId === cardId) ?? null;

    runningMoveCountRef.current += 1;
    setPendingCardKeys((current) => [...current, fromKey, toKey]);
    setError("");
    setSuccess("");
    setActiveDeck((current) => {
      if (!current) return current;
      const withoutSource = withDeckCardQuantity(
        current,
        collectionCard,
        cardId,
        fromSection,
        sourceQuantity - 1,
      );
      const next = withDeckCardQuantity(
        withoutSource,
        collectionCard,
        cardId,
        toSection,
        targetQuantity + 1,
      );
      activeDeckRef.current = next;
      return next;
    });

    try {
      const result = await deckClient.moveCard(deck.id, {
        cardId,
        fromSection,
        toSection,
        quantity: 1,
      });
      const serverDeck = result.activeDeck;
      const quantities = getDeckQuantityMap(serverDeck);
      confirmedQuantitiesRef.current.set(
        fromKey,
        quantities.get(fromKey) ?? 0,
      );
      confirmedQuantitiesRef.current.set(toKey, quantities.get(toKey) ?? 0);
    } catch (caughtError) {
      setActiveDeck((current) => {
        if (!current) return current;
        const restoredSource = withDeckCardQuantity(
          current,
          collectionCard,
          cardId,
          fromSection,
          sourceQuantity,
        );
        const next = withDeckCardQuantity(
          restoredSource,
          collectionCard,
          cardId,
          toSection,
          targetQuantity,
        );
        activeDeckRef.current = next;
        return next;
      });
      setError(
        getApiErrorMessage(
          caughtError,
          "Karte konnte nicht in den Zielbereich verschoben werden.",
        ),
      );
    } finally {
      runningMoveCountRef.current = Math.max(
        0,
        runningMoveCountRef.current - 1,
      );
      setPendingCardKeys((current) =>
        current.filter((key) => key !== fromKey && key !== toKey),
      );
      void reconcileEditorSnapshotWhenIdle(deck.id);
    }
  }

  async function handleRemoveOneDeckCard(card: DeckCard) {
    const plannedQuantity = getPlannedCardQuantity(card.cardId, card.section);
    if (plannedQuantity <= 1) {
      await handleRemoveCard(card.cardId, card.section);
      return;
    }

    await handleSetCardQuantity(
      card.cardId,
      card.section,
      plannedQuantity - 1,
    );
  }

  async function handleRemoveOneCollectionCard(card: CollectionCard) {
    const existing =
      findDeckCard(card.cardId, getDefaultSectionForCard(card)) ??
      activeDeckRef.current?.cards.find((entry) => entry.cardId === card.cardId);

    if (existing) {
      await handleRemoveOneDeckCard(existing);
    }
  }

  function canAddCollectionCard(card: CollectionCard) {
    const plannedCopies = (["MAIN", "EXTRA", "SIDE"] as const).reduce(
      (sum, section) =>
        sum + getPlannedCardQuantity(card.cardId, section),
      0,
    );
    return plannedCopies < 3;
  }

  async function addMissingCardToWishlist(
    cardId: string,
    desiredQuantity: number,
  ) {
    await runMutation(async () => {
      await wishlistClient.upsert({
        cardId,
        desiredQuantity,
        priority: "NORMAL",
        note: activeDeck ? `Fehlt für Deck „${activeDeck.name}“` : null,
      });
      setSuccess("Fehlende Karte wurde zur Kampagnen-Wunschliste hinzugefügt.");
    });
  }

  function canIncreaseDeckCard(card: DeckCard) {
    const plannedCopies = allDeckCards
      .filter((entry) => entry.cardId === card.cardId)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    return plannedCopies < 3;
  }

  const kindFilters: Array<{ value: KindFilter; label: string }> = [
    { value: "ALL", label: "Alle" },
    { value: "MONSTER", label: "Monster" },
    { value: "SPELL", label: "Zauber" },
    { value: "TRAP", label: "Fallen" },
    { value: "TOKEN", label: "Token" },
  ];

  if (!activeDeck) {
    return (
      <div className="grid min-h-full place-items-center px-3 py-8">
        <section className="w-full max-w-[620px] rounded-[12px] border border-[rgba(144,174,198,0.16)] bg-[linear-gradient(180deg,rgba(15,23,34,0.98),rgba(7,12,19,0.98))] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.34)] sm:p-7">
          <Link
            href="/decks"
            className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#9aabb7] transition hover:text-white"
          >
            <AssetIcon name="chevron-left" className="h-3.5 w-3.5 text-current" />
            Deckbibliothek
          </Link>
          <div className="mt-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#b8df28]">
              Neues Deck
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#f3eadf]">
              Deck anlegen
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[#8fa0ac]">
              Name und Deckbox reichen für den Start. Karten und Format wählst du
              anschließend direkt im Editor.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[#c6d0d5]">Deckname</span>
              <input
                value={createDeckName}
                onChange={(event) => setCreateDeckName(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    createDeckName.trim() &&
                    !isSubmitting
                  ) {
                    void handleCreateDeck();
                  }
                }}
                type="text"
                autoFocus
                className="ui-input"
                placeholder="z. B. Chaos Control"
                disabled={isSubmitting}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[#c6d0d5]">Deckbox</span>
              <select
                value={createDeckBoxKey}
                onChange={(event) =>
                  setCreateDeckBoxKey(event.target.value as DeckBoxKey)
                }
                className="ui-input"
                disabled={isSubmitting}
              >
                {deckBoxCatalog.map((deckBox) => (
                  <option key={deckBox.key} value={deckBox.key}>
                    {deckBox.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-[#f2aaa0]">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void handleCreateDeck();
              }}
              disabled={isSubmitting || !createDeckName.trim()}
              className="ui-button-primary min-w-[150px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Erstelle…" : "Deck erstellen"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="deck-editor-root relative flex min-h-0 flex-col gap-2">
      {(error || catalogError || success) && (
        <div className="fixed bottom-20 right-4 z-[80] grid w-[min(24rem,calc(100vw-2rem))] gap-2 lg:bottom-5">
          {error ? (
            <div role="alert" className="rounded-[8px] border border-[rgba(204,97,78,0.32)] bg-[#251311] px-4 py-3 text-sm text-[#f2c1b7] shadow-2xl">
              {error}
            </div>
          ) : null}
          {catalogError ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-[8px] border border-[rgba(204,97,78,0.32)] bg-[#251311] px-4 py-3 text-sm text-[#f2c1b7] shadow-2xl">
              <span>{catalogError}</span>
              <button type="button" className="shrink-0 text-xs font-semibold text-white underline underline-offset-4" onClick={() => setCatalogRevision((revision) => revision + 1)}>
                Erneut laden
              </button>
            </div>
          ) : null}
          {success ? (
            <div role="status" className="rounded-[8px] border border-[rgba(88,163,169,0.3)] bg-[#0c2226] px-4 py-3 text-sm text-[#c5ecec] shadow-2xl">
              {success}
            </div>
          ) : null}
        </div>
      )}

      <header className="deck-editor-commandbar flex min-h-[48px] shrink-0 items-center gap-2 rounded-[7px] border border-[rgba(144,174,198,0.14)] bg-[rgba(12,19,28,0.98)] px-2">
        <Link
          href="/decks"
          aria-label="Zur Deckbibliothek"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[5px] text-[#9cabb5] transition hover:bg-white/5 hover:text-white"
        >
          <AssetIcon name="chevron-left" className="h-4 w-4 text-current" />
        </Link>

        <input
          value={activeDeckName}
          onChange={(event) => setActiveDeckName(event.target.value)}
          type="text"
          aria-label="Deckname"
          className="h-8 min-w-0 max-w-[260px] flex-1 rounded-[4px] border border-transparent bg-transparent px-2 text-sm font-semibold text-[#f1e8dd] outline-none transition hover:border-white/10 focus:border-[rgba(88,163,169,0.42)] focus:bg-black/20"
          disabled={isSubmitting}
        />

        <label className="hidden min-w-[190px] max-w-[260px] items-center gap-2 lg:flex">
          <span className="shrink-0 text-xs font-semibold text-[#a9b6bd]">
            Bannliste
          </span>
          <select
            value={activeBanlistId}
            onChange={(event) => {
              void handleChangeActiveBanlist(event.target.value);
            }}
            className="ui-input min-w-0 flex-1"
            disabled={isSubmitting}
            aria-label="Bannliste in der Editor-Kopfzeile"
          >
            {availableBanlists.map((banlist) => (
              <option key={banlist.id} value={banlist.id}>
                {banlist.name}
              </option>
            ))}
          </select>
        </label>

        <span
          className={classes(
            "hidden items-center gap-1.5 text-xs font-semibold sm:inline-flex",
            activeDeck.isLegal ? "text-[#91d4d3]" : "text-[#efaaa0]",
          )}
        >
          <span
            className={classes(
              "h-1.5 w-1.5 rounded-full",
              activeDeck.isLegal ? "bg-[#65c6c2]" : "bg-[#d66b5c]",
            )}
          />
          {activeDeck.isLegal ? "Spielbereit" : `${activeDeck.issues.length} Probleme`}
        </span>

        <span className="ml-auto hidden text-xs font-semibold tabular-nums text-[#9caab3] md:inline">
          {activeDeck.mainCount} / {activeDeck.extraCount} / {activeDeck.sideCount}
        </span>

        <details className="relative">
          <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-[5px] border border-white/10 text-[#aab6bd] transition hover:border-white/20 hover:text-white">
            <AssetIcon name="settings" className="h-4 w-4 text-current" />
            <span className="sr-only">Deckeinstellungen</span>
          </summary>
          <div className="absolute right-0 top-[calc(100%+0.45rem)] z-40 w-[min(360px,calc(100vw-2rem))] space-y-3 rounded-[8px] border border-white/10 bg-[#0b111a] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.56)]">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
              <span className="text-xs font-semibold text-[#95a4ae]">Deckbox</span>
              <select
                value={activeDeckBoxKey}
                onChange={(event) =>
                  setActiveDeckBoxKey(event.target.value as DeckBoxKey)
                }
                className="ui-input min-w-0"
                disabled={isSubmitting}
              >
                {deckBoxCatalog.map((deckBox) => (
                  <option key={deckBox.key} value={deckBox.key}>
                    {deckBox.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
              <span className="text-xs font-semibold text-[#95a4ae]">Bannliste</span>
              <select
                value={activeBanlistId}
                onChange={(event) => {
                  void handleChangeActiveBanlist(event.target.value);
                }}
                className="ui-input min-w-0"
                disabled={isSubmitting}
                aria-label="Bannliste"
              >
                {availableBanlists.map((banlist) => (
                  <option key={banlist.id} value={banlist.id}>
                    {banlist.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
              <span className="text-xs font-semibold text-[#95a4ae]">Stand</span>
              <input
                value={activeSnapshotDate}
                onChange={(event) => setActiveSnapshotDate(event.target.value)}
                type="date"
                className="ui-input min-w-0"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/8 pt-3">
              <span className="truncate text-xs text-[#77858f]">
                {activeDeck.banlistName}
              </span>
              <button
                type="button"
                onClick={() => setDeleteConfirmationOpen(true)}
                disabled={isSubmitting}
                className="text-xs font-semibold text-[#e89b90] transition hover:text-[#ffd0ca] disabled:opacity-50"
              >
                Deck löschen
              </button>
            </div>
          </div>
        </details>

        <button
          type="button"
          onClick={() => {
            void handleUpdateDeck();
          }}
          disabled={isSubmitting || !activeDeckName.trim() || !activeBanlistId}
          className="ui-button-primary h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Speichern
        </button>
      </header>

      {deleteConfirmationOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div role="alertdialog" aria-labelledby="delete-deck-title" aria-describedby="delete-deck-description" className="w-full max-w-md rounded-[10px] border border-[rgba(204,97,78,0.3)] bg-[#131014] p-5 shadow-2xl">
            <p id="delete-deck-title" className="font-semibold text-[#ffe3ca]">Deck „{activeDeck.name}“ löschen?</p>
            <p id="delete-deck-description" className="mt-2 text-sm leading-6 text-[#bca7a0]">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="ui-button-neutral" onClick={() => setDeleteConfirmationOpen(false)} disabled={isSubmitting}>Abbrechen</button>
              <button type="button" className="ui-button-danger" onClick={() => void handleDeleteDeck()} disabled={isSubmitting}>Löschen</button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="sr-only">
        Linksklick auf Karten fügt sie automatisch hinzu, Rechtsklick entfernt eine
        Kopie. Ziehe Karten direkt auf Main, Extra oder Side.
      </p>

      <nav className="grid grid-cols-3 gap-2 xl:hidden" aria-label="Editorbereich wählen">
        {([
          ["CATALOG", "Katalog"],
          ["DECK", `Deck ${activeDeck?.cardCount ?? 0}`],
          ["DETAILS", "Details"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mobileEditorView === value}
            onClick={() => setMobileEditorView(value)}
            className={classes(
              "ui-segment-button border px-3 py-3",
              mobileEditorView === value
                ? "border-[rgba(207,91,66,0.36)] bg-[rgba(151,29,20,0.24)] text-[#ffe3ca]"
                : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#baa58d]",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="deck-editor-grid grid min-h-0 gap-2 xl:flex-1 xl:grid-cols-[190px_minmax(400px,1fr)_300px] 2xl:grid-cols-[220px_minmax(520px,1fr)_340px]">
        <Panel
          kicker="Sammlung"
          title="Kartenkatalog"
          className={classes("deck-editor-panel deck-editor-catalog xl:order-3", mobileEditorView !== "CATALOG" && "!hidden xl:!flex")}
        >
          <div className="deck-editor-catalog-body flex min-h-0 flex-1 flex-col gap-2">
            <div className="space-y-2">
              <label className="block">
                <span className="sr-only">Suche</span>
                <div className="flex items-center gap-2 rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                  <AssetIcon name="search" className="h-4 w-4 text-[#b9a894]" />
                  <input
                    ref={searchInputRef}
                    value={cardSearch}
                    onChange={(event) => setCardSearch(event.target.value)}
                    type="text"
                    placeholder="Karte suchen  /"
                    className="w-full bg-transparent text-sm text-[#f2e5d1] outline-none placeholder:text-[#8f7d69]"
                    disabled={isSubmitting}
                  />
                </div>
              </label>

              <div className="deck-editor-filter-row relative flex flex-wrap gap-1.5">
                {(["ALL", "OWNED", "UNOWNED"] as CardOwnershipFilter[]).map(
                  (filter) => (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={ownershipFilter === filter}
                      onClick={() => setOwnershipFilter(filter)}
                      className={classes(
                        "ui-segment-button border px-2.5 py-1.5 transition",
                        ownershipFilter === filter
                          ? "border-[rgba(88,163,169,0.32)] bg-[rgba(58,118,124,0.2)] text-[#d5f5f3]"
                          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d] hover:text-[#f3dfc8]",
                      )}
                    >
                      {filter === "ALL"
                        ? "Alle Karten"
                        : filter === "OWNED"
                          ? "Im Besitz"
                          : "Nicht im Besitz"}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  aria-expanded={mobileFiltersOpen}
                  onClick={() => setMobileFiltersOpen((current) => !current)}
                  className="ui-segment-button border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[#cbb79d]"
                >
                  {mobileFiltersOpen ? "Weniger" : "Filter"}
                </button>
                <div
                  className={classes(
                    "w-full grid-cols-2 gap-1.5 rounded-[6px] border border-white/8 bg-black/20 p-2",
                    mobileFiltersOpen ? "grid" : "hidden",
                  )}
                >
                {kindFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={kindFilter === filter.value}
                    onClick={() => setKindFilter(filter.value)}
                    disabled={isSubmitting}
                    className={classes(
                      "ui-segment-button border px-2.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-50",
                      kindFilter === filter.value
                        ? "border-[rgba(207,91,66,0.28)] bg-[rgba(207,91,66,0.14)] text-[#ffe3ca]"
                        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d] hover:border-[rgba(207,91,66,0.18)] hover:text-[#f3dfc8]",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
                <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)} className="ui-input min-w-[130px] flex-1" aria-label="Seltenheit filtern">
                  <option value="ALL">Alle Seltenheiten</option>
                  {rarityOptions.map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}
                </select>
                <select value={limitFilter} onChange={(event) => setLimitFilter(event.target.value as LimitFilter)} className="ui-input min-w-[130px] flex-1" aria-label="Bannlistenstatus filtern">
                  <option value="ALL">Alle Status</option>
                  <option value="LEGAL">Erlaubt</option>
                  <option value="FORBIDDEN">Verboten</option>
                  <option value="LIMITED">Limitiert</option>
                  <option value="SEMI_LIMITED">Semi-limitiert</option>
                </select>
                <select
                  value={catalogSort}
                  onChange={(event) =>
                    setCatalogSort(event.target.value as CardCatalogSort)
                  }
                  className="ui-input min-w-[130px] flex-1"
                  aria-label="Kartenkatalog sortieren"
                >
                  <option value="NAME_ASC">Name A–Z</option>
                  <option value="NAME_DESC">Name Z–A</option>
                  <option value="OWNED_DESC">Besitzmenge</option>
                  <option value="ATK_DESC">ATK absteigend</option>
                  <option value="NEWEST_SET">Neueste Sets</option>
                </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[0.65rem] font-semibold text-[#778791]">
              <span>{catalogLoading ? "Lädt…" : `${catalogTotal} Ergebnisse`}</span>
              <span className="text-[#8fc9c8]">
                {filteredCollectionCards.reduce((sum, card) => sum + card.availableCopies, 0)} verfügbar
              </span>
            </div>

            {filteredCollectionCards.length ? (
              <>
                <div className="deck-catalog-grid grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto pr-1">
                  {filteredCollectionCards.map((card) => (
                  <CollectionBrowserCard
                    key={card.cardId}
                    card={card}
                    disabled={!activeDeck || isSubmitting}
                    usesPointLimit={usesGenesisRules}
                    selected={
                      resolvedPreview?.source === "collection" &&
                      resolvedPreview.card.cardId === card.cardId
                    }
                    onPreview={() =>
                      setPreviewTarget({
                        source: "collection",
                        cardId: card.cardId,
                      })
                    }
                    onAdd={() => {
                      void handleAddCollectionCard(card);
                    }}
                    onRemove={() => {
                      void handleRemoveOneCollectionCard(card);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        deckCardDragMime,
                        encodeDragPayload({ source: "collection", cardId: card.cardId }),
                      );
                      event.dataTransfer.setData(
                        "text/plain",
                        `ygo-card:collection:${card.cardId}`,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  />
                  ))}
                </div>
                {catalogCursor ? (
                  <button
                    type="button"
                    onClick={() => void handleLoadMoreCatalogCards()}
                    disabled={catalogLoading}
                    className="ui-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {catalogLoading ? "Lädt…" : "Weitere Karten laden"}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="ui-empty rounded-[24px] p-5 text-sm leading-7">
                Keine Treffer.
              </div>
            )}
          </div>
        </Panel>

        <Panel
          kicker="Deckansicht"
          title="Deck"
          className={classes("deck-editor-panel deck-editor-deck xl:order-2", mobileEditorView !== "DECK" && "!hidden xl:!flex")}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#95a4ae]">
                <span className="shrink-0">Deck sortieren</span>
                <select
                  value={deckSortMode}
                  onChange={(event) =>
                    setDeckSortMode(event.target.value as DeckSortMode)
                  }
                  className="ui-input h-8 min-w-0 max-w-[190px] py-1"
                  aria-label="Deck sortieren"
                >
                  <option value="TYPE_LEVEL">Kartentyp · Stufe</option>
                  <option value="NAME_ASC">Name A–Z</option>
                  <option value="NAME_DESC">Name Z–A</option>
                  <option value="ATK_DESC">ATK absteigend</option>
                </select>
              </label>
              <span className="shrink-0 text-xs tabular-nums text-[#77858f]">
                {activeDeck.cardCount} Karten
              </span>
            </div>
            {activeDeck.issues.length || activeDeck.missingCards.length ? (
              <div className="relative flex justify-end">
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-[5px] border border-[rgba(204,97,78,0.22)] bg-[rgba(141,61,48,0.1)] px-2.5 py-1 text-[0.64rem] font-semibold text-[#e8aaa1]">
                    {activeDeck.issues.length + activeDeck.missingCards.length} Hinweise prüfen
                  </summary>
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 max-h-[24rem] w-[min(34rem,80vw)] overflow-y-auto rounded-[9px] border border-[rgba(255,255,255,0.12)] bg-[#0b0f15] p-3 shadow-[0_24px_54px_rgba(0,0,0,0.52)]">
                      {activeDeck.issues.length ? (
                        <div className="grid gap-1.5">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f2c1b7]">
                            Legalitätsprobleme
                          </p>
                          {activeDeck.issues.slice(0, 8).map((issue) => (
                            <p
                              key={`${issue.cardId}-${issue.type}-${issue.message}`}
                              className="text-xs leading-5 text-[#d9b4aa]"
                            >
                              {getIssueLabel(issue.type)}: {issue.message}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {activeDeck.missingCards.length ? (
                        <div className="mt-3 grid gap-2 border-t border-[rgba(255,255,255,0.08)] pt-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f4d6a5]">
                            Fehlende Karten
                          </p>
                          {activeDeck.missingCards.map((card) => (
                            <div key={card.cardId} className="flex items-center justify-between gap-3 rounded-[6px] border border-[rgba(255,255,255,0.06)] px-2.5 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-[#f5ead9]">{card.cardName}</p>
                                <p className="text-[0.66rem] text-[#bfae9a]">
                                  {card.availableQuantity}/{card.requiredQuantity} vorhanden
                                </p>
                              </div>
                              <button
                                type="button"
                                className="ui-button-neutral shrink-0 px-2.5 py-1.5 text-[0.62rem]"
                                disabled={isSubmitting}
                                onClick={() => void addMissingCardToWishlist(card.cardId, card.requiredQuantity)}
                              >
                                Wunschliste
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                </details>
              </div>
            ) : null}

              <DeckZoneCompact
                title="Main"
                section="MAIN"
                cards={mainCards}
                selectedTarget={previewTarget}
                isSubmitting={false}
                usesPointLimit={usesGenesisRules}
                onSelect={setPreviewTarget}
                onDropCard={(cardId, section) => {
                  void handleAddCardToSection(cardId, section);
                }}
                onMoveCard={(cardId, fromSection, toSection) => {
                  void handleMoveDeckCard(cardId, fromSection, toSection);
                }}
                onRemoveOne={(card) => {
                  void handleRemoveOneDeckCard(card);
                }}
              />

              <DeckZoneCompact
                title="Extra"
                section="EXTRA"
                cards={extraCards}
                selectedTarget={previewTarget}
                isSubmitting={false}
                usesPointLimit={usesGenesisRules}
                onSelect={setPreviewTarget}
                onDropCard={(cardId, section) => {
                  void handleAddCardToSection(cardId, section);
                }}
                onMoveCard={(cardId, fromSection, toSection) => {
                  void handleMoveDeckCard(cardId, fromSection, toSection);
                }}
                onRemoveOne={(card) => {
                  void handleRemoveOneDeckCard(card);
                }}
              />

              <DeckZoneCompact
                title="Side"
                section="SIDE"
                cards={sideCards}
                selectedTarget={previewTarget}
                isSubmitting={false}
                usesPointLimit={usesGenesisRules}
                onSelect={setPreviewTarget}
                onDropCard={(cardId, section) => {
                  void handleAddCardToSection(cardId, section);
                }}
                onMoveCard={(cardId, fromSection, toSection) => {
                  void handleMoveDeckCard(cardId, fromSection, toSection);
                }}
                onRemoveOne={(card) => {
                  void handleRemoveOneDeckCard(card);
                }}
              />
          </div>
        </Panel>

        <Panel
          kicker="Details"
          title="Karte"
          className={classes("deck-editor-panel deck-editor-details xl:order-1", mobileEditorView !== "DETAILS" && "!hidden xl:!flex")}
        >
          {resolvedPreview ? (
            <div className="space-y-3">
              <div className="relative mx-auto aspect-[59/86] w-full max-w-[148px] overflow-hidden rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] shadow-[0_12px_24px_rgba(0,0,0,0.28)]">
                {resolvedPreview.source === "collection" ? (
                  resolvedPreview.card.imageUrl ? (
                    <Image
                      src={resolvedPreview.card.imageUrl}
                      alt={resolvedPreview.card.name}
                      fill
                      sizes="148px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[#ead9c3]">
                      {resolvedPreview.card.name}
                    </div>
                  )
                ) : resolvedPreview.card.imageUrl ? (
                  <Image
                    src={resolvedPreview.card.imageUrl}
                    alt={resolvedPreview.card.cardName}
                    fill
                    sizes="148px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[#ead9c3]">
                    {resolvedPreview.card.cardName}
                  </div>
                )}
              </div>

              {resolvedPreview.source === "collection" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone="slate">
                      {getKindLabel(resolvedPreview.card.kind)}
                    </StatusPill>
                    {usesGenesisRules && resolvedPreview.card.legalLimit <= 0 ? (
                      <StatusPill tone="ember">Nicht erlaubt</StatusPill>
                    ) : usesGenesisRules ? (
                      <StatusPill tone="gold">
                        {formatPointValue(resolvedPreview.card.pointValue)}
                      </StatusPill>
                    ) : (
                      <StatusPill tone={getLimitTone(resolvedPreview.card.legalLimit)}>
                        {getLimitLabel(resolvedPreview.card.legalLimit)}
                      </StatusPill>
                    )}
                    <StatusPill tone="teal">
                      {resolvedPreview.card.availableCopies} frei
                    </StatusPill>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold leading-snug text-[#f5ead9]">
                      {resolvedPreview.card.name}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#8f9ca5]">
                      Im Deck {resolvedPreview.card.deckCopies} · Main{" "}
                      {resolvedPreview.card.mainCopies} · Extra{" "}
                      {resolvedPreview.card.extraCopies} · Side{" "}
                      {resolvedPreview.card.sideCopies}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-white/8 py-3 text-xs">
                    <div>
                      <dt className="text-[#70808a]">Verfügbar</dt>
                      <dd className="mt-0.5 font-semibold text-[#dce6e8]">
                        {resolvedPreview.card.availableCopies}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#70808a]">
                        {usesGenesisRules ? "Punkte" : "Limit"}
                      </dt>
                      <dd className="mt-0.5 font-semibold text-[#dce6e8]">
                        {usesGenesisRules && resolvedPreview.card.legalLimit <= 0
                          ? "Nicht erlaubt"
                          : usesGenesisRules
                            ? formatPointValue(resolvedPreview.card.pointValue)
                            : resolvedPreview.card.legalLimit}
                      </dd>
                    </div>
                    {resolvedPreview.card.monsterType ? (
                      <div className="col-span-2">
                        <dt className="text-[#70808a]">Typ</dt>
                        <dd className="mt-0.5 font-semibold text-[#dce6e8]">
                          {resolvedPreview.card.monsterType}
                        </dd>
                      </div>
                    ) : null}
                    {resolvedPreview.card.reservedCopies > 0 ||
                    resolvedPreview.card.tradedCopies > 0 ? (
                      <div className="col-span-2 text-[#8d9aa3]">
                        Reserviert {resolvedPreview.card.reservedCopies} · Getauscht{" "}
                        {resolvedPreview.card.tradedCopies}
                      </div>
                    ) : null}
                  </dl>

                  <div className="rounded-[7px] bg-black/20 p-3">
                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#a9b5bc]">
                      Kartentext
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#b9c5c9]">
                      {resolvedPreview.deckCard?.activeTextSnippet ??
                        resolvedPreview.card.oracleText ??
                        "Kein Text verfügbar."}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(["MAIN", "EXTRA", "SIDE"] as DeckSection[]).map((section) => (
                      <button
                        key={`${resolvedPreview.card.cardId}-${section}`}
                        type="button"
                        onClick={() => {
                          void handleAddCollectionCard(
                            resolvedPreview.card,
                            section,
                          );
                        }}
                        disabled={
                          isSubmitting ||
                          !activeDeck ||
                          resolvedPreview.card.deckCopies >= 3
                        }
                        className={classes(
                          "flex items-center justify-center rounded-[5px] border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                          section === "MAIN"
                            ? "border-[rgba(88,163,169,0.24)] bg-[rgba(58,118,124,0.14)] text-[#c7ecec] hover:bg-[rgba(58,118,124,0.22)]"
                            : section === "EXTRA"
                              ? "border-[rgba(207,91,66,0.26)] bg-[rgba(207,91,66,0.14)] text-[#ffe0c8] hover:bg-[rgba(207,91,66,0.22)]"
                              : "border-[rgba(126,143,168,0.18)] bg-[rgba(255,255,255,0.04)] text-[#d6dfec] hover:border-[rgba(126,143,168,0.28)] hover:bg-[rgba(255,255,255,0.07)]",
                        )}
                      >
                        + {section === "MAIN" ? "Main" : section === "EXTRA" ? "Extra" : "Side"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        void addMissingCardToWishlist(resolvedPreview.card.cardId, 1)
                      }
                      disabled={isSubmitting}
                      className="col-span-3 text-xs font-semibold text-[#9caab2] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Zur Wunschliste
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={getSectionTone(resolvedPreview.card.section)}>
                      {getSectionLabel(resolvedPreview.card.section)}
                    </StatusPill>
                    {usesGenesisRules && resolvedPreview.card.allowedCopies <= 0 ? (
                      <StatusPill tone="ember">Nicht erlaubt</StatusPill>
                    ) : usesGenesisRules ? (
                      <StatusPill tone="gold">
                        {formatPointValue(resolvedPreview.card.pointValue)}
                      </StatusPill>
                    ) : (
                      <StatusPill tone={getLimitTone(resolvedPreview.card.allowedCopies)}>
                        {getLimitLabel(resolvedPreview.card.allowedCopies)}
                      </StatusPill>
                    )}
                    <StatusPill tone="gold">×{resolvedPreview.card.quantity}</StatusPill>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold leading-snug text-[#f5ead9]">
                      {resolvedPreview.card.cardName}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#8f9ca5]">
                      {resolvedPreview.card.activeTextLabel}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-white/8 py-3 text-xs">
                    <div>
                      <dt className="text-[#70808a]">
                        {usesGenesisRules ? "Punkte" : "Limit"}
                      </dt>
                      <dd className="mt-0.5 font-semibold text-[#dce6e8]">
                        {usesGenesisRules && resolvedPreview.card.allowedCopies <= 0
                          ? "Nicht erlaubt"
                          : usesGenesisRules
                            ? formatPointValue(resolvedPreview.card.pointValue)
                            : resolvedPreview.card.allowedCopies}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#70808a]">Verfügbar</dt>
                      <dd className="mt-0.5 font-semibold text-[#dce6e8]">
                        {resolvedPreview.card.availableCopies}
                      </dd>
                    </div>
                    {resolvedPreview.card.monsterType ? (
                      <div className="col-span-2">
                        <dt className="text-[#70808a]">Typ</dt>
                        <dd className="mt-0.5 font-semibold text-[#dce6e8]">
                          {resolvedPreview.card.monsterType}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {resolvedPreview.card.issues.length ? (
                    <div className="rounded-[7px] border border-[rgba(204,97,78,0.2)] bg-[rgba(141,61,48,0.08)] p-3">
                      <div className="flex items-center gap-2 text-[#f2c1b7]">
                        <AssetIcon name="alert" className="h-4 w-4 text-current" />
                        <p className="text-sm font-semibold">Probleme</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {resolvedPreview.card.issues.map((issue) => (
                          <StatusPill
                            key={`${resolvedPreview.card.cardId}-${resolvedPreview.card.section}-${issue}`}
                            tone={getIssueTone(issue)}
                          >
                            {getIssueLabel(issue)}
                          </StatusPill>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-[7px] bg-black/20 p-3">
                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[#a9b5bc]">
                      Kartentext
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#b9c5c9]">
                      {resolvedPreview.card.activeTextSnippet}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (resolvedPreview.card.quantity <= 1) {
                          void handleRemoveCard(
                            resolvedPreview.card.cardId,
                            resolvedPreview.card.section,
                          );
                          return;
                        }

                        void handleSetCardQuantity(
                          resolvedPreview.card.cardId,
                          resolvedPreview.card.section,
                          resolvedPreview.card.quantity - 1,
                        );
                      }}
                      disabled={isSubmitting}
                      className="rounded-[5px] border border-white/10 px-2 py-2 text-xs font-semibold text-[#c7d0d5] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSetCardQuantity(
                          resolvedPreview.card.cardId,
                          resolvedPreview.card.section,
                          resolvedPreview.card.quantity + 1,
                        );
                      }}
                      disabled={isSubmitting || !canIncreaseDeckCard(resolvedPreview.card)}
                      className="rounded-[5px] border border-[rgba(88,163,169,0.24)] bg-[rgba(58,118,124,0.14)] px-2 py-2 text-xs font-semibold text-[#c7ecec] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleRemoveCard(
                          resolvedPreview.card.cardId,
                          resolvedPreview.card.section,
                        );
                      }}
                      disabled={isSubmitting}
                      className="rounded-[5px] border border-[rgba(204,97,78,0.22)] bg-[rgba(141,61,48,0.1)] px-2 py-2 text-xs font-semibold text-[#e8aaa1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Entfernen
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="ui-empty rounded-[24px] p-5 text-sm leading-7">
              Keine Karte ausgewählt.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
