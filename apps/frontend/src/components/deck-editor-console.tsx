"use client";

import Image from "next/image";
import type { DeckSectionValue } from "@ygo/contracts";
import type { DragEvent, MouseEvent } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import { deckClient } from "@/lib/deck-client";
import type { DeckIssueType, DeckLegalitySnapshot } from "@/lib/deck-legality";

type DeckEditorConsoleProps = {
  activeDeck: DeckLegalitySnapshot["activeDeck"];
  availableBanlists: DeckLegalitySnapshot["editor"]["availableBanlists"];
  collectionCards: DeckLegalitySnapshot["editor"]["collectionCards"];
};

type DeckCard = NonNullable<DeckLegalitySnapshot["activeDeck"]>["cards"][number];
type CollectionCard = DeckLegalitySnapshot["editor"]["collectionCards"][number];
type BanlistOption = DeckLegalitySnapshot["editor"]["availableBanlists"][number];
type DeckSection = DeckSectionValue;
type KindFilter = "ALL" | "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
type PreviewTarget =
  | { source: "collection"; cardId: string }
  | { source: "deck"; cardId: string; section: DeckSection };
type DragCardPayload = {
  source: "collection";
  cardId: string;
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
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

function isExtraDeckMonster(card: Pick<CollectionCard | DeckCard, "kind" | "monsterType">) {
  if (card.kind !== "MONSTER" || !card.monsterType) {
    return false;
  }

  return /\b(Fusion|Synchro|Xyz|Link)\b/i.test(card.monsterType);
}

function getDefaultSectionForCard(card: CollectionCard): DeckSection {
  return isExtraDeckMonster(card) ? "EXTRA" : "MAIN";
}

function getSectionCopies(card: CollectionCard, section: DeckSection) {
  if (section === "MAIN") {
    return card.mainCopies;
  }

  if (section === "EXTRA") {
    return card.extraCopies;
  }

  return card.sideCopies;
}

function encodeDragPayload(payload: DragCardPayload) {
  return JSON.stringify(payload);
}

function decodeDragPayload(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<DragCardPayload>;

    if (parsed.source === "collection" && typeof parsed.cardId === "string") {
      return parsed as DragCardPayload;
    }
  } catch {
    return null;
  }

  return null;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatGermanDateUtc(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

function formatBanlistDate(value: string) {
  return formatGermanDateUtc(value);
}

function formatErrataDate(value: string | null) {
  if (!value) {
    return "Keine Errata";
  }

  return formatGermanDateUtc(value);
}

function BanlistSelect({
  label,
  availableBanlists,
  selectedBanlistId,
  onSelect,
  disabled,
}: {
  label: string;
  availableBanlists: BanlistOption[];
  selectedBanlistId: string;
  onSelect: (banlistId: string) => void;
  disabled: boolean;
}) {
  const groupedBanlists = Array.from(
    availableBanlists.reduce((groups, banlist) => {
      const current = groups.get(banlist.formatName) ?? [];
      current.push(banlist);
      groups.set(banlist.formatName, current);
      return groups;
    }, new Map<string, BanlistOption[]>()),
  ).sort(([left], [right]) => left.localeCompare(right, "de"));

  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-[#f0dfcc]">{label}</span>
      <select
        value={selectedBanlistId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={disabled || availableBanlists.length === 0}
        className="ui-input"
      >
        {groupedBanlists.map(([formatName, banlists]) => (
          <optgroup key={formatName} label={`${formatName} (${banlists.length})`}>
            {banlists.map((banlist) => (
              <option key={banlist.id} value={banlist.id}>
                {banlist.name} · {formatBanlistDate(banlist.effectiveFrom)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function CollectionBrowserCard({
  card,
  selected,
  disabled,
  onAdd,
  onRemove,
  onPreview,
  onDragStart,
}: {
  card: CollectionCard;
  selected: boolean;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  const canAdd = card.availableCopies > card.deckCopies && card.legalLimit > card.deckCopies;
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
        "rounded-[24px] border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-[rgba(207,91,66,0.34)] bg-[rgba(255,255,255,0.05)] shadow-[0_18px_34px_rgba(0,0,0,0.22)]"
          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(207,91,66,0.18)] hover:bg-[rgba(255,255,255,0.04)]",
      )}
      disabled={disabled && !canRemove}
    >
      <div className="relative aspect-[59/86] overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 1536px) 22vw, 12vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[#ead9c3]">
            {card.name}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-[rgba(8,10,14,0.8)] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#f1dfc8]">
          {card.availableCopies} frei
        </span>
        <span
          className={classes(
            "absolute right-2 top-2 rounded-full border px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em]",
            card.legalLimit <= 0
              ? "border-[rgba(204,97,78,0.34)] bg-[rgba(141,61,48,0.72)] text-[#ffd5cd]"
              : card.legalLimit < 3
                ? "border-[rgba(208,170,110,0.34)] bg-[rgba(104,76,35,0.72)] text-[#ffe0af]"
                : "border-[rgba(88,163,169,0.26)] bg-[rgba(24,72,78,0.72)] text-[#c7f1f1]",
          )}
        >
          {getLimitShortLabel(card.legalLimit)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusPill tone="slate">{getKindLabel(card.kind)}</StatusPill>
        {card.monsterType ? <StatusPill tone="slate">{card.monsterType}</StatusPill> : null}
        <StatusPill tone={getLimitTone(card.legalLimit)}>
          {getLimitLabel(card.legalLimit)}
        </StatusPill>
      </div>

      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[#f6ebdb]">
        {card.name}
      </p>
      <p className="mt-2 text-xs text-[#bfae9a]">
        Im Deck {card.deckCopies} · Erlaubt {card.legalLimit}
      </p>
    </button>
  );
}

function DeckZoneCompact({
  title,
  section,
  cards,
  selectedTarget,
  isSubmitting,
  onSelect,
  onDropCard,
  onRemoveOne,
}: {
  title: string;
  section: DeckSection;
  cards: DeckCard[];
  selectedTarget: PreviewTarget | null;
  isSubmitting: boolean;
  onSelect: (target: PreviewTarget) => void;
  onDropCard: (cardId: string, section: DeckSection) => void;
  onRemoveOne: (card: DeckCard) => void;
}) {
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (isSubmitting) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const payload = decodeDragPayload(event.dataTransfer.getData("application/x-ygo-card"));

    if (payload) {
      onDropCard(payload.cardId, section);
    }
  }

  return (
    <section
      className="paper-card-strong rounded-[26px] p-4 transition hover:border-[rgba(207,91,66,0.22)]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ui-kicker">{title}</p>
          <p className="mt-2 text-lg font-semibold text-[#f5ead9]">
            {totalCards} Karten
          </p>
        </div>
        <StatusPill tone={getSectionTone(section)}>{cards.length} Slots</StatusPill>
      </div>

      {cards.length ? (
        <div className="mt-4 grid max-h-[20rem] grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5">
          {cards.map((card) => {
            const isSelected =
              selectedTarget?.source === "deck" &&
              selectedTarget.cardId === card.cardId &&
              selectedTarget.section === card.section;

            return (
              <button
                key={`${card.cardId}-${card.section}`}
                type="button"
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
                  "rounded-[18px] border p-2 text-left transition",
                  isSelected
                    ? "border-[rgba(207,91,66,0.34)] bg-[rgba(255,255,255,0.06)]"
                    : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(207,91,66,0.18)]",
                )}
              >
                <div className="relative aspect-[59/86] overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                  {card.imageUrl ? (
                    <Image
                      src={card.imageUrl}
                      alt={card.cardName}
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-[0.6rem] font-semibold text-[#ead9c3]">
                      {card.cardName}
                    </div>
                  )}

                  <span className="absolute right-1.5 top-1.5 rounded-full bg-[rgba(8,10,14,0.82)] px-2 py-0.5 text-[0.62rem] font-semibold text-[#f2dfc8]">
                    ×{card.quantity}
                  </span>
                  <span
                    className={classes(
                      "absolute left-1.5 top-1.5 rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold text-[#f2dfc8]",
                      card.allowedCopies <= 0
                        ? "border-[rgba(204,97,78,0.34)] bg-[rgba(141,61,48,0.72)]"
                        : card.allowedCopies < 3
                          ? "border-[rgba(208,170,110,0.34)] bg-[rgba(104,76,35,0.72)]"
                          : "border-[rgba(88,163,169,0.26)] bg-[rgba(24,72,78,0.72)]",
                    )}
                  >
                    {getLimitShortLabel(card.allowedCopies)}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-[0.72rem] font-semibold leading-5 text-[#e8d6c1]">
                  {card.cardName}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusPill tone={getLimitTone(card.allowedCopies)}>
                    {getLimitLabel(card.allowedCopies)}
                  </StatusPill>
                  {card.issues.slice(0, 2).map((issue) => (
                    <StatusPill
                      key={`${card.cardId}-${card.section}-${issue}`}
                      tone={getIssueTone(issue)}
                    >
                      {getIssueLabel(issue)}
                    </StatusPill>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ui-empty mt-4 rounded-[20px] p-5 text-sm leading-7">
          Leer.
        </div>
      )}
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="paper-card-soft rounded-[18px] px-4 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#9f8c77]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#f0dfcc]">{value}</p>
    </div>
  );
}

export function DeckEditorConsole({
  activeDeck,
  availableBanlists,
  collectionCards,
}: DeckEditorConsoleProps) {
  const router = useRouter();
  const [createDeckName, setCreateDeckName] = useState("");
  const [createBanlistId, setCreateBanlistId] = useState(availableBanlists[0]?.id ?? "");
  const [createSnapshotDate, setCreateSnapshotDate] = useState("");
  const [activeDeckName, setActiveDeckName] = useState(activeDeck?.name ?? "");
  const [activeBanlistId, setActiveBanlistId] = useState(
    activeDeck?.banlistId ?? availableBanlists[0]?.id ?? "",
  );
  const [activeSnapshotDate, setActiveSnapshotDate] = useState(
    activeDeck?.snapshotDate.slice(0, 10) ?? "",
  );
  const [cardSearch, setCardSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredCardSearch = useDeferredValue(cardSearch);
  const normalizedSearch = deferredCardSearch.trim().toLowerCase();

  const mainCards = useMemo(
    () => activeDeck?.cards.filter((card) => card.section === "MAIN") ?? [],
    [activeDeck?.cards],
  );
  const extraCards = useMemo(
    () => activeDeck?.cards.filter((card) => card.section === "EXTRA") ?? [],
    [activeDeck?.cards],
  );
  const sideCards = useMemo(
    () => activeDeck?.cards.filter((card) => card.section === "SIDE") ?? [],
    [activeDeck?.cards],
  );
  const allDeckCards = useMemo(() => activeDeck?.cards ?? [], [activeDeck?.cards]);
  const selectedBanlist = useMemo(
    () => availableBanlists.find((banlist) => banlist.id === activeBanlistId) ?? null,
    [activeBanlistId, availableBanlists],
  );
  const usesGenesisRules = useMemo(
    () =>
      Boolean(
        selectedBanlist &&
          /genesys|genesis/i.test(`${selectedBanlist.formatName} ${selectedBanlist.name}`),
      ),
    [selectedBanlist],
  );

  const filteredCollectionCards = useMemo(
    () =>
      collectionCards.filter((card) => {
        if (kindFilter !== "ALL" && card.kind !== kindFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return `${card.name} ${card.kind}`.toLowerCase().includes(normalizedSearch);
      }),
    [collectionCards, kindFilter, normalizedSearch],
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
          collectionCards.find((entry) => entry.cardId === card.cardId) ?? null;

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
        collectionCards.find((entry) => entry.cardId === fallbackDeckCard.cardId) ?? null;

      return {
        source: "deck" as const,
        card: fallbackDeckCard,
        collectionCard,
      };
    }

    return null;
  }, [allDeckCards, collectionCards, filteredCollectionCards, previewTarget]);

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

  async function handleCreateDeck() {
    await runMutation(async () => {
      const payload = await deckClient.create({
        name: createDeckName,
        banlistId: createBanlistId || null,
        snapshotDate: createSnapshotDate || null,
      });

      if (payload.deck?.id) {
        setSuccess(`Deck "${payload.deck.name}" wurde erstellt.`);
        setCreateDeckName("");
        router.push(`/decks?deck=${payload.deck.id}`);
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
        banlistId: activeBanlistId || null,
        snapshotDate: activeSnapshotDate || null,
      });

      setSuccess(`Deck "${payload.deck?.name ?? activeDeck.name}" wurde aktualisiert.`);
      router.refresh();
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
        banlistId: nextBanlistId || null,
        snapshotDate: activeSnapshotDate || null,
      });

      setSuccess(
        `Bannliste für "${payload.deck?.name ?? activeDeck.name}" wurde auf "${
          nextBanlist?.name ?? "ausgewählte Liste"
        }" aktualisiert.`,
      );
      router.refresh();
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

    await runMutation(async () => {
      await deckClient.upsertCard(activeDeck.id, {
        cardId,
        section,
        quantity,
      });
      router.refresh();
    });
  }

  async function handleRemoveCard(cardId: string, section: DeckSection) {
    if (!activeDeck) {
      return;
    }

    await runMutation(async () => {
      await deckClient.removeCard(activeDeck.id, {
        cardId,
        section,
      });
      router.refresh();
    });
  }

  function findDeckCard(cardId: string, section: DeckSection) {
    return allDeckCards.find(
      (entry) => entry.cardId === cardId && entry.section === section,
    );
  }

  async function handleAddCollectionCard(card: CollectionCard, section = getDefaultSectionForCard(card)) {
    if (!activeDeck || isSubmitting || !canAddCollectionCard(card)) {
      return;
    }

    const existing = findDeckCard(card.cardId, section);

    await handleSetCardQuantity(
      card.cardId,
      section,
      (existing?.quantity ?? getSectionCopies(card, section)) + 1,
    );
  }

  async function handleAddCardToSection(cardId: string, section: DeckSection) {
    const card = collectionCards.find((entry) => entry.cardId === cardId);

    if (!card) {
      return;
    }

    await handleAddCollectionCard(card, section);
  }

  async function handleRemoveOneDeckCard(card: DeckCard) {
    if (isSubmitting) {
      return;
    }

    if (card.quantity <= 1) {
      await handleRemoveCard(card.cardId, card.section);
      return;
    }

    await handleSetCardQuantity(card.cardId, card.section, card.quantity - 1);
  }

  async function handleRemoveOneCollectionCard(card: CollectionCard) {
    if (isSubmitting) {
      return;
    }

    const existing =
      findDeckCard(card.cardId, getDefaultSectionForCard(card)) ??
      allDeckCards.find((entry) => entry.cardId === card.cardId);

    if (existing) {
      await handleRemoveOneDeckCard(existing);
    }
  }

  function canAddCollectionCard(card: CollectionCard) {
    const maxCopies = Math.min(card.availableCopies, card.legalLimit);

    return maxCopies > card.deckCopies;
  }

  function canIncreaseDeckCard(card: DeckCard) {
    const collectionCard = collectionCards.find((entry) => entry.cardId === card.cardId);

    if (!collectionCard) {
      return false;
    }

    return canAddCollectionCard(collectionCard);
  }

  const kindFilters: Array<{ value: KindFilter; label: string }> = [
    { value: "ALL", label: "Alle" },
    { value: "MONSTER", label: "Monster" },
    { value: "SPELL", label: "Zauber" },
    { value: "TRAP", label: "Fallen" },
    { value: "TOKEN", label: "Token" },
  ];

  return (
    <div className="space-y-6">
      {(error || success) && (
        <div className="grid gap-3">
          {error ? (
            <div className="rounded-[22px] border border-[rgba(204,97,78,0.28)] bg-[rgba(141,61,48,0.14)] px-5 py-4 text-sm leading-7 text-[#f2c1b7]">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-[22px] border border-[rgba(88,163,169,0.26)] bg-[rgba(58,118,124,0.14)] px-5 py-4 text-sm leading-7 text-[#c5ecec]">
              {success}
            </div>
          ) : null}
        </div>
      )}

      <Panel
        kicker={activeDeck ? "Decksteuerung" : "Neues Deck"}
        title={activeDeck ? "Konfiguration" : "Neues Deck"}
      >
        {activeDeck ? (
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.7fr_1.05fr_auto] xl:items-end">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#f0dfcc]">Deckname</span>
              <input
                value={activeDeckName}
                onChange={(event) => setActiveDeckName(event.target.value)}
                type="text"
                className="ui-input"
                disabled={isSubmitting}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#f0dfcc]">Snapshot</span>
              <input
                value={activeSnapshotDate}
                onChange={(event) => setActiveSnapshotDate(event.target.value)}
                type="date"
                className="ui-input"
                disabled={isSubmitting}
              />
            </label>

            <BanlistSelect
              label="Bannliste"
              availableBanlists={availableBanlists}
              selectedBanlistId={activeBanlistId}
              onSelect={(banlistId) => {
                void handleChangeActiveBanlist(banlistId);
              }}
              disabled={isSubmitting}
            />

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleUpdateDeck();
                }}
                disabled={isSubmitting || !activeDeckName.trim() || !activeBanlistId}
                className="ui-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteDeck();
                }}
                disabled={isSubmitting}
                className="ui-button-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                Löschen
              </button>
            </div>

            <div className="xl:col-span-4">
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={activeDeck.isLegal ? "teal" : "ember"}>
                  {activeDeck.isLegal ? "Legal" : `${activeDeck.issues.length} Probleme`}
                </StatusPill>
                <StatusPill tone="gold">{activeDeck.banlistName}</StatusPill>
                {usesGenesisRules ? (
                  <StatusPill tone="slate">Genesis-Werte aktiv</StatusPill>
                ) : null}
                <StatusPill tone="slate">Main {activeDeck.mainCount}</StatusPill>
                <StatusPill tone="slate">Extra {activeDeck.extraCount}</StatusPill>
                <StatusPill tone="slate">Side {activeDeck.sideCount}</StatusPill>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#baa58a]">
                Linksklick auf Karten fügt sie automatisch hinzu, Rechtsklick entfernt eine
                Kopie. Ziehe Karten direkt auf Main, Extra oder Side.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1fr_0.7fr_1fr_auto] xl:items-end">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#f0dfcc]">Deckname</span>
              <input
                value={createDeckName}
                onChange={(event) => setCreateDeckName(event.target.value)}
                type="text"
                className="ui-input"
                disabled={isSubmitting}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[#f0dfcc]">Snapshot</span>
              <input
                value={createSnapshotDate}
                onChange={(event) => setCreateSnapshotDate(event.target.value)}
                type="date"
                className="ui-input"
                disabled={isSubmitting}
              />
            </label>

            <BanlistSelect
              label="Bannliste"
              availableBanlists={availableBanlists}
              selectedBanlistId={createBanlistId}
              onSelect={setCreateBanlistId}
              disabled={isSubmitting}
            />

            <button
              type="button"
              onClick={() => {
                void handleCreateDeck();
              }}
              disabled={isSubmitting || !createDeckName.trim() || !createBanlistId}
              className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Erstelle..." : "Deck erstellen"}
            </button>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)_320px]">
        <Panel
          kicker="Sammlung"
          title="Kartenkatalog"
          className="xl:min-h-[58rem]"
        >
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[#f0dfcc]">Suche</span>
                <div className="flex items-center gap-3 rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <AssetIcon name="search" className="h-4 w-4 text-[#b9a894]" />
                  <input
                    value={cardSearch}
                    onChange={(event) => setCardSearch(event.target.value)}
                    type="text"
                    className="w-full bg-transparent text-sm text-[#f2e5d1] outline-none placeholder:text-[#8f7d69]"
                    disabled={isSubmitting}
                  />
                </div>
              </label>

              <div className="flex flex-wrap gap-2">
                {kindFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setKindFilter(filter.value)}
                    disabled={isSubmitting}
                    className={classes(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                      kindFilter === filter.value
                        ? "border-[rgba(207,91,66,0.28)] bg-[rgba(207,91,66,0.14)] text-[#ffe3ca]"
                        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d] hover:border-[rgba(207,91,66,0.18)] hover:text-[#f3dfc8]",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusPill tone="slate">
                {filteredCollectionCards.length} Karten
              </StatusPill>
              <StatusPill tone="teal">
                {filteredCollectionCards.reduce((sum, card) => sum + card.availableCopies, 0)} frei
              </StatusPill>
              <StatusPill tone="gold">
                {filteredCollectionCards.filter((card) => card.legalLimit === 0).length} gesperrt
              </StatusPill>
            </div>

            {filteredCollectionCards.length ? (
              <div className="grid max-h-[44rem] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredCollectionCards.map((card) => (
                  <CollectionBrowserCard
                    key={card.cardId}
                    card={card}
                    disabled={isSubmitting || !activeDeck}
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
                        "application/x-ygo-card",
                        encodeDragPayload({ source: "collection", cardId: card.cardId }),
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  />
                ))}
              </div>
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
          className="xl:min-h-[58rem]"
        >
          {activeDeck ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="paper-card rounded-[20px] p-4">
                  <p className="ui-kicker">Main</p>
                  <p className="mt-2 text-2xl font-semibold text-[#f5ead9]">
                    {activeDeck.mainCount}
                  </p>
                </div>
                <div className="paper-card rounded-[20px] p-4">
                  <p className="ui-kicker">Extra</p>
                  <p className="mt-2 text-2xl font-semibold text-[#f5ead9]">
                    {activeDeck.extraCount}
                  </p>
                </div>
                <div className="paper-card rounded-[20px] p-4">
                  <p className="ui-kicker">Side</p>
                  <p className="mt-2 text-2xl font-semibold text-[#f5ead9]">
                    {activeDeck.sideCount}
                  </p>
                </div>
              </div>

              {activeDeck.issues.length ? (
                <div className="rounded-[20px] border border-[rgba(204,97,78,0.24)] bg-[rgba(141,61,48,0.12)] p-4">
                  <div className="flex items-center gap-2 text-[#f2c1b7]">
                    <AssetIcon name="alert" className="h-4 w-4 text-current" />
                    <p className="text-sm font-semibold">Aktuelle Legalitätsprobleme</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {activeDeck.issues.slice(0, 5).map((issue) => (
                      <p
                        key={`${issue.cardId}-${issue.type}-${issue.message}`}
                        className="text-sm leading-6 text-[#f2c1b7]"
                      >
                        {getIssueLabel(issue.type)}: {issue.message}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <DeckZoneCompact
                title="Main"
                section="MAIN"
                cards={mainCards}
                selectedTarget={previewTarget}
                isSubmitting={isSubmitting}
                onSelect={setPreviewTarget}
                onDropCard={(cardId, section) => {
                  void handleAddCardToSection(cardId, section);
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
                isSubmitting={isSubmitting}
                onSelect={setPreviewTarget}
                onDropCard={(cardId, section) => {
                  void handleAddCardToSection(cardId, section);
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
                isSubmitting={isSubmitting}
                onSelect={setPreviewTarget}
                onDropCard={(cardId, section) => {
                  void handleAddCardToSection(cardId, section);
                }}
                onRemoveOne={(card) => {
                  void handleRemoveOneDeckCard(card);
                }}
              />
            </div>
          ) : (
            <div className="ui-empty rounded-[24px] p-5 text-sm leading-7">
              Kein Deck.
            </div>
          )}
        </Panel>

        <Panel
          kicker="Details"
          title="Karte"
          className="xl:col-span-2 2xl:col-span-1"
        >
          {resolvedPreview ? (
            <div className="space-y-5">
              <div className="relative mx-auto aspect-[59/86] w-full max-w-[240px] overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                {resolvedPreview.source === "collection" ? (
                  resolvedPreview.card.imageUrl ? (
                    <Image
                      src={resolvedPreview.card.imageUrl}
                      alt={resolvedPreview.card.name}
                      fill
                      sizes="240px"
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
                    sizes="240px"
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
                    <StatusPill tone={getLimitTone(resolvedPreview.card.legalLimit)}>
                      {getLimitLabel(resolvedPreview.card.legalLimit)}
                    </StatusPill>
                    <StatusPill tone="teal">
                      {resolvedPreview.card.availableCopies} frei
                    </StatusPill>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold leading-tight text-[#f5ead9]">
                      {resolvedPreview.card.name}
                    </h3>
                    <p className="mt-2 text-sm text-[#bfae9a]">
                      Im Deck {resolvedPreview.card.deckCopies} · Main{" "}
                      {resolvedPreview.card.mainCopies} · Extra{" "}
                      {resolvedPreview.card.extraCopies} · Side{" "}
                      {resolvedPreview.card.sideCopies}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                    <InfoRow
                      label="Verfügbare Kopien"
                      value={String(resolvedPreview.card.availableCopies)}
                    />
                    <InfoRow
                      label={usesGenesisRules ? "Genesis-Wert" : "Erlaubte Kopien"}
                      value={String(resolvedPreview.card.legalLimit)}
                    />
                    <InfoRow
                      label="Reserviert"
                      value={String(resolvedPreview.card.reservedCopies)}
                    />
                    {resolvedPreview.card.monsterType ? (
                      <InfoRow
                        label="Monsterart"
                        value={resolvedPreview.card.monsterType}
                      />
                    ) : null}
                    <InfoRow
                      label="Getauscht"
                      value={String(resolvedPreview.card.tradedCopies)}
                    />
                    <InfoRow
                      label="Errata ab"
                      value={formatErrataDate(resolvedPreview.card.errataCutoff)}
                    />
                  </div>

                  <div className="paper-card-soft rounded-[22px] p-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#cb5c44]">
                      Kartentext
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[#d6c5b2]">
                      {resolvedPreview.deckCard?.activeTextSnippet ??
                        resolvedPreview.card.oracleText ??
                        "Kein Text verfügbar."}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    {(["MAIN", "EXTRA", "SIDE"] as DeckSection[]).map((section) => (
                      <button
                        key={`${resolvedPreview.card.cardId}-${section}`}
                        type="button"
                        onClick={() => {
                          void handleSetCardQuantity(
                            resolvedPreview.card.cardId,
                            section,
                            (section === "MAIN"
                              ? resolvedPreview.card.mainCopies
                              : section === "EXTRA"
                                ? resolvedPreview.card.extraCopies
                                : resolvedPreview.card.sideCopies) + 1,
                          );
                        }}
                        disabled={
                          isSubmitting ||
                          !activeDeck ||
                          !canAddCollectionCard(resolvedPreview.card)
                        }
                        className={classes(
                          "flex items-center justify-between rounded-[18px] border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                          section === "MAIN"
                            ? "border-[rgba(88,163,169,0.24)] bg-[rgba(58,118,124,0.14)] text-[#c7ecec] hover:bg-[rgba(58,118,124,0.22)]"
                            : section === "EXTRA"
                              ? "border-[rgba(207,91,66,0.26)] bg-[rgba(207,91,66,0.14)] text-[#ffe0c8] hover:bg-[rgba(207,91,66,0.22)]"
                              : "border-[rgba(126,143,168,0.18)] bg-[rgba(255,255,255,0.04)] text-[#d6dfec] hover:border-[rgba(126,143,168,0.28)] hover:bg-[rgba(255,255,255,0.07)]",
                        )}
                      >
                        <span>Zu {getSectionLabel(section)}</span>
                        <AssetIcon name="plus" className="h-4 w-4 text-current" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={getSectionTone(resolvedPreview.card.section)}>
                      {getSectionLabel(resolvedPreview.card.section)}
                    </StatusPill>
                    <StatusPill tone={getLimitTone(resolvedPreview.card.allowedCopies)}>
                      {getLimitLabel(resolvedPreview.card.allowedCopies)}
                    </StatusPill>
                    <StatusPill tone="gold">×{resolvedPreview.card.quantity}</StatusPill>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold leading-tight text-[#f5ead9]">
                      {resolvedPreview.card.cardName}
                    </h3>
                    <p className="mt-2 text-sm text-[#bfae9a]">
                      {resolvedPreview.card.activeTextLabel}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                    <InfoRow
                      label={usesGenesisRules ? "Genesis-Wert" : "Erlaubte Kopien"}
                      value={String(resolvedPreview.card.allowedCopies)}
                    />
                    {resolvedPreview.card.monsterType ? (
                      <InfoRow
                        label="Monsterart"
                        value={resolvedPreview.card.monsterType}
                      />
                    ) : null}
                    <InfoRow
                      label="Verfügbare Kopien"
                      value={String(resolvedPreview.card.availableCopies)}
                    />
                    <InfoRow
                      label="Reserviert"
                      value={String(resolvedPreview.card.reservedCopies)}
                    />
                    <InfoRow
                      label="Errata ab"
                      value={formatErrataDate(resolvedPreview.card.errataCutoff)}
                    />
                  </div>

                  {resolvedPreview.card.issues.length ? (
                    <div className="paper-card-soft rounded-[22px] p-4">
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

                  <div className="paper-card-soft rounded-[22px] p-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#cb5c44]">
                      Textstand
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[#d6c5b2]">
                      {resolvedPreview.card.activeTextSnippet}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 2xl:grid-cols-1">
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
                      className="ui-button-neutral disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="ui-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="ui-button-danger disabled:cursor-not-allowed disabled:opacity-50"
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
