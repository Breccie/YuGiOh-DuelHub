"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeckBoxKey } from "@ygo/contracts";
import { AppSidebar } from "@/components/app-sidebar";
import { AssetIcon, type AssetIconName } from "@/components/asset-icon";
import { ConsoleGlobalStatusBar } from "@/components/console-shell-primitives";
import { getApiErrorMessage } from "@/lib/api-client";
import { deckClient } from "@/lib/deck-client";
import { deckBoxCatalog, defaultDeckBoxKey } from "@/lib/deckbox-config";
import type { DeckLegalitySnapshot } from "@/lib/deck-legality";

type DeckOverviewConsoleProps = {
  viewer: {
    displayName: string;
  };
  collectionProgress: {
    owned: string;
    total: string;
  };
  latestBanlistName: string;
  selectedDeckId: string | null;
  decks: Array<{
    id: string;
    name: string;
    updatedAt: string;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    isLegal: boolean;
    issueCount: number;
    missingCardCount: number;
    formatName: string | null;
    banlistName: string | null;
    deckBoxKey: string;
    deckBoxImageUrl: string;
    previewImageUrl: string | null;
    previewLabel: string;
  }>;
  recentCollectionCards: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
    setCode: string | null;
  }>;
  activeDeck: DeckLegalitySnapshot["activeDeck"];
  availableBanlists: DeckLegalitySnapshot["editor"]["availableBanlists"];
  collectionCards: DeckLegalitySnapshot["editor"]["collectionCards"];
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
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

function getErrataPolicyLabel(
  value: "USE_LATEST_TEXT" | "LOCK_TO_SNAPSHOT_TEXT" | "BAN_ON_ERRATA",
) {
  if (value === "USE_LATEST_TEXT") {
    return "Neuester Text";
  }

  if (value === "LOCK_TO_SNAPSHOT_TEXT") {
    return "Snapshot-Text";
  }

  return "Errata-Sperre";
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={classes(
        "rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[linear-gradient(180deg,rgba(10,13,18,0.82),rgba(7,9,13,0.92))] shadow-[0_28px_56px_rgba(0,0,0,0.38)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardArtwork({
  src,
  alt,
  sizes,
  fallbackLabel,
  objectFit = "cover",
}: {
  src: string | null;
  alt: string;
  sizes: string;
  fallbackLabel: string;
  objectFit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(!src);

  if (!src || failed) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-[0.7rem] font-semibold text-[#e8d8c3]">
        {fallbackLabel}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={objectFit === "contain" ? "object-contain object-center" : "object-cover"}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

function DeckCount({
  iconName,
  value,
  label,
  accent,
}: {
  iconName: AssetIconName;
  value: number;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]"
        style={{ color: accent }}
      >
        <AssetIcon name={iconName} className="h-5 w-5 text-current" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-[#f0dfcc]">{value}</p>
        <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9d8a75]">
          {label}
        </p>
      </div>
    </div>
  );
}

export function DeckOverviewConsole({
  viewer,
  collectionProgress,
  selectedDeckId,
  decks,
  recentCollectionCards,
  activeDeck,
  availableBanlists,
}: DeckOverviewConsoleProps) {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [draftDeckName, setDraftDeckName] = useState("");
  const [draftDeckBoxKey, setDraftDeckBoxKey] =
    useState<DeckBoxKey>(defaultDeckBoxKey);
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [creatorFeedback, setCreatorFeedback] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryStatus, setLibraryStatus] = useState<"ALL" | "PLAYABLE" | "DRAFT">(
    "ALL",
  );
  const [libraryFormat, setLibraryFormat] = useState("");
  const [libraryBanlist, setLibraryBanlist] = useState("");
  const [librarySort, setLibrarySort] = useState<"UPDATED" | "NAME">("UPDATED");
  const selectedDeck =
    decks.find((deck) => deck.id === selectedDeckId) ??
    decks[0] ??
    null;
  const heroCard =
    selectedDeck
      ? {
          imageUrl: selectedDeck.deckBoxImageUrl,
          name: `${selectedDeck.name} Deckbox`,
        }
      : null;
  const visibleDeckCards = activeDeck?.cards.slice(0, 10) ?? [];
  const formatOptions = useMemo(
    () =>
      [...new Set(decks.map((deck) => deck.formatName).filter(Boolean) as string[])].sort(
        (left, right) => left.localeCompare(right, "de"),
      ),
    [decks],
  );
  const banlistOptions = useMemo(
    () =>
      [...new Set(decks.map((deck) => deck.banlistName).filter(Boolean) as string[])].sort(
        (left, right) => left.localeCompare(right, "de"),
      ),
    [decks],
  );
  const filteredDecks = useMemo(() => {
    const normalizedQuery = libraryQuery.trim().toLocaleLowerCase("de");
    const result = decks.filter((deck) => {
      if (normalizedQuery && !deck.name.toLocaleLowerCase("de").includes(normalizedQuery)) {
        return false;
      }
      if (libraryStatus === "PLAYABLE" && !deck.isLegal) {
        return false;
      }
      if (libraryStatus === "DRAFT" && deck.isLegal) {
        return false;
      }
      if (libraryFormat && deck.formatName !== libraryFormat) {
        return false;
      }
      if (libraryBanlist && deck.banlistName !== libraryBanlist) {
        return false;
      }
      return true;
    });

    return result.sort((left, right) =>
      librarySort === "NAME"
        ? left.name.localeCompare(right.name, "de")
        : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [decks, libraryBanlist, libraryFormat, libraryQuery, librarySort, libraryStatus]);

  function openEditor() {
    router.push(activeDeck ? `/decks/${activeDeck.id}/edit` : "/decks/new");
  }

  async function handleExportDeck() {
    if (!activeDeck) {
      return;
    }

    setIsExporting(true);
    setExportFeedback(null);

    try {
      const data = await deckClient.exportDeck(activeDeck.id, {
        fileName: `${activeDeck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ydk`,
      });

      if (!data.export) {
        throw new Error("Deck konnte nicht exportiert werden.");
      }

      const shell = window.desktopShell;

      if (shell?.saveTextFile) {
        const saveResult = await shell.saveTextFile({
          defaultPath: data.export.fileName,
          content: data.export.exportBody,
          filters: [{ name: "EDOPro Deck", extensions: ["ydk"] }],
        });

        if (!saveResult.canceled && saveResult.filePath) {
          await shell.revealPath?.(saveResult.filePath);
        }
      } else {
        const blob = new Blob([data.export.exportBody], {
          type: "text/plain;charset=utf-8",
        });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = data.export.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
      }
    } catch (error) {
      setExportFeedback(getApiErrorMessage(error, "Deck konnte nicht exportiert werden."));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDuplicateDeck() {
    if (!activeDeck) {
      return;
    }

    setIsDuplicating(true);
    setExportFeedback(null);

    try {
      const payload = await deckClient.duplicate(activeDeck.id);

      if (!payload.deck?.id) {
        throw new Error("Deck wurde dupliziert, aber die Deck-ID fehlt.");
      }

      router.push(`/decks?deck=${payload.deck.id}`);
      router.refresh();
    } catch (error) {
      setExportFeedback(getApiErrorMessage(error, "Deck konnte nicht dupliziert werden."));
    } finally {
      setIsDuplicating(false);
    }
  }

  async function handleCreateDeck() {
    const trimmedName = draftDeckName.trim();

    if (!trimmedName) {
      setCreatorFeedback("Gib deinem Deck zuerst einen Namen.");
      return;
    }

    setIsCreatingDeck(true);
    setCreatorFeedback(null);

    try {
      const payload = await deckClient.create({
        name: trimmedName,
        deckBoxKey: draftDeckBoxKey,
        banlistId: availableBanlists[0]?.id ?? null,
      });

      if (!payload.deck?.id) {
        throw new Error("Deck wurde erstellt, aber die Deck-ID fehlt.");
      }

      setDraftDeckName("");
      setCreatorOpen(false);
      router.push(`/decks?deck=${payload.deck.id}`);
      router.refresh();
    } catch (error) {
      setCreatorFeedback(getApiErrorMessage(error, "Deck konnte nicht erstellt werden."));
    } finally {
      setIsCreatingDeck(false);
    }
  }

  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />

      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <AppSidebar />

        <main className="app-main relative flex-1 overflow-hidden lg:ml-[176px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 pb-20 pt-3 sm:px-4 lg:px-5 lg:pb-4">
            <section className="relative">
              <div className="relative">
                <div className="app-topbar flex min-h-[52px] items-center justify-end rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.78)] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-3">
                  <ConsoleGlobalStatusBar
                    viewer={{ displayName: viewer.displayName }}
                    fallback={{
                      collectionValue: `${collectionProgress.owned} / ${collectionProgress.total}`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-3 rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(8,12,18,0.78)] p-3 sm:flex-row sm:items-center">
                {heroCard ? (
                  <div className="relative h-[76px] w-[58px] shrink-0 overflow-hidden rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[#0b1119]">
                    <CardArtwork
                      src={heroCard.imageUrl}
                      alt={heroCard.name}
                      sizes="58px"
                      fallbackLabel="Deckbox"
                      objectFit="contain"
                    />
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#cb5c44]">
                    Deckbibliothek
                  </p>
                  <h1 className="truncate text-xl font-semibold text-[#f2e7da] sm:text-2xl">
                    {activeDeck?.name ?? "Deine Decks"}
                  </h1>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9f8f7d]">
                    <span>{activeDeck ? formatGermanDateUtc(activeDeck.snapshotDate) : "Noch kein aktives Deck"}</span>
                    <span>{activeDeck?.cardCount ?? 0} Karten</span>
                    <span className={activeDeck?.isLegal ? "text-[#9cd4cf]" : "text-[#e7a08f]"}>
                      {activeDeck?.isLegal ? "Spielbereit" : "Entwurf"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button type="button" onClick={openEditor} className="ui-button-primary min-h-[38px] px-3 py-2 text-[0.68rem]">
                    {activeDeck ? "Bearbeiten" : "Neues Deck"}
                  </button>
                  <button type="button" onClick={() => void handleDuplicateDeck()} disabled={!activeDeck || isDuplicating} className="ui-button-neutral min-h-[38px] px-3 py-2 text-[0.68rem] disabled:opacity-50">
                    {isDuplicating ? "Dupliziert…" : "Duplizieren"}
                  </button>
                  <button type="button" onClick={handleExportDeck} disabled={!activeDeck || !activeDeck.isLegal || isExporting} className="ui-button-secondary min-h-[38px] px-3 py-2 text-[0.68rem] disabled:opacity-50">
                    {isExporting ? "Exportiert…" : "Export"}
                  </button>
                </div>
              </div>

              {exportFeedback ? (
                <div className="mt-2 rounded-[8px] border border-[rgba(207,91,66,0.24)] bg-[rgba(126,23,15,0.16)] px-3 py-2 text-xs text-[#ffd7c9]">
                  {exportFeedback}
                </div>
              ) : null}
            </section>

            <section className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_392px] xl:grid-rows-[auto_auto]">
              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                    Deckbibliothek
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => router.push("/decks/new")}
                      className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[#b19b84] transition hover:text-[#f0ddc8]"
                    >
                      <span>Neues Deck</span>
                      <AssetIcon name="plus" className="h-4 w-4 text-current" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <label className="sm:col-span-2 xl:col-span-1">
                    <span className="sr-only">Decks durchsuchen</span>
                    <input
                      value={libraryQuery}
                      onChange={(event) => setLibraryQuery(event.target.value)}
                      className="ui-input"
                      placeholder="Deck suchen"
                    />
                  </label>
                  <select
                    value={libraryStatus}
                    onChange={(event) =>
                      setLibraryStatus(
                        event.target.value as "ALL" | "PLAYABLE" | "DRAFT",
                      )
                    }
                    className="ui-input"
                    aria-label="Spielbarkeit filtern"
                  >
                    <option value="ALL">Alle Zustände</option>
                    <option value="PLAYABLE">Spielbereit</option>
                    <option value="DRAFT">Entwürfe</option>
                  </select>
                  <select
                    value={libraryFormat}
                    onChange={(event) => setLibraryFormat(event.target.value)}
                    className="ui-input"
                    aria-label="Format filtern"
                  >
                    <option value="">Alle Formate</option>
                    {formatOptions.map((formatName) => (
                      <option key={formatName} value={formatName}>
                        {formatName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={libraryBanlist}
                    onChange={(event) => setLibraryBanlist(event.target.value)}
                    className="ui-input"
                    aria-label="Bannliste filtern"
                  >
                    <option value="">Alle Bannlisten</option>
                    {banlistOptions.map((banlistName) => (
                      <option key={banlistName} value={banlistName}>
                        {banlistName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={librarySort}
                    onChange={(event) =>
                      setLibrarySort(event.target.value as "UPDATED" | "NAME")
                    }
                    className="ui-input"
                    aria-label="Decks sortieren"
                  >
                    <option value="UPDATED">Zuletzt geändert</option>
                    <option value="NAME">Name A–Z</option>
                  </select>
                </div>

                <div
                  id="deck-library"
                  className="mt-4 grid grid-cols-2 gap-2 pb-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7"
                >
                  {filteredDecks.map((deck) => {
                    const selected = deck.id === selectedDeck?.id;

                    return (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => router.push(`/decks?deck=${deck.id}`)}
                        className={classes(
                          "group relative flex min-w-0 flex-col rounded-[10px] border p-2 text-left transition",
                          selected
                            ? "border-[rgba(207,91,66,0.48)] bg-[rgba(207,91,66,0.08)] shadow-[0_0_0_1px_rgba(207,91,66,0.16)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.16)]",
                        )}
                      >
                        <div className="relative flex h-[150px] w-full items-center justify-center overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,21,28,0.96),rgba(10,12,16,0.98))] px-1 py-2">
                          <CardArtwork
                            src={deck.deckBoxImageUrl}
                            alt={deck.name}
                            sizes="102px"
                            fallbackLabel="Deckbox"
                            objectFit="contain"
                          />
                        </div>
                        <span className="mt-2 truncate text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#f1dec9]">
                          {deck.name}
                        </span>
                        <span className="mt-1 text-[0.64rem] uppercase tracking-[0.12em] text-[#9f8c77]">
                          {deck.mainCount}/{deck.extraCount}/{deck.sideCount}
                        </span>
                        <span
                          className={classes(
                            "mt-2 inline-flex w-fit rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em]",
                            deck.isLegal
                              ? "border-[rgba(88,163,169,0.22)] bg-[rgba(58,118,124,0.12)] text-[#b8e3e4]"
                              : "border-[rgba(207,91,66,0.28)] bg-[rgba(126,23,15,0.18)] text-[#ffd7c9]",
                          )}
                        >
                          {deck.isLegal
                            ? "Spielbereit"
                            : deck.missingCardCount > 0
                              ? `Entwurf · ${deck.missingCardCount} fehlen`
                              : `Entwurf · ${deck.issueCount} Fehler`}
                        </span>

                        {selected ? (
                          <div className="absolute inset-x-0 -bottom-2 flex justify-center">
                            <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#cf5b42]" />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                  {filteredDecks.length === 0 ? (
                    <div className="flex min-h-[220px] min-w-[260px] items-center justify-center rounded-[16px] border border-dashed border-[rgba(255,255,255,0.12)] px-5 text-center text-sm text-[#ad9a84]">
                      Keine Decks entsprechen den gewählten Filtern.
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCreatorOpen(true)}
                    className="group relative flex min-w-0 flex-col items-center justify-center rounded-[10px] border border-dashed border-[rgba(208,170,110,0.28)] bg-[rgba(255,255,255,0.025)] p-2 text-[#d9c4aa] transition hover:border-[rgba(207,91,66,0.42)] hover:bg-[rgba(207,91,66,0.08)] hover:text-[#f4dfc9]"
                    aria-label="Neues Deck erstellen"
                  >
                    <div className="flex h-[150px] w-full items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,21,28,0.9),rgba(10,12,16,0.96))]">
                      <span className="grid h-12 w-12 place-items-center rounded-full border border-[rgba(208,170,110,0.28)] bg-[rgba(208,170,110,0.08)] transition group-hover:scale-105 group-hover:border-[rgba(207,91,66,0.44)]">
                        <AssetIcon name="plus" className="h-6 w-6 text-current" />
                      </span>
                    </div>
                    <span className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
                      Neues Deck
                    </span>
                  </button>
                </div>

                {creatorOpen ? (
                  <div className="mt-3 rounded-[18px] border border-[rgba(208,170,110,0.14)] bg-[rgba(255,255,255,0.025)] p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_auto_auto] lg:items-end">
                      <label className="block">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#9f8c77]">
                          Deckname
                        </span>
                        <input
                          value={draftDeckName}
                          onChange={(event) => setDraftDeckName(event.target.value)}
                          className="ui-input mt-2"
                          placeholder="z.B. Chaos Control"
                          disabled={isCreatingDeck}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#9f8c77]">
                          Deckbox
                        </span>
                        <select
                          value={draftDeckBoxKey}
                          onChange={(event) =>
                            setDraftDeckBoxKey(event.target.value as DeckBoxKey)
                          }
                          className="ui-input mt-2"
                          disabled={isCreatingDeck}
                        >
                          {deckBoxCatalog.map((deckBox) => (
                            <option key={deckBox.key} value={deckBox.key}>
                              {deckBox.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleCreateDeck()}
                        disabled={isCreatingDeck || !draftDeckName.trim()}
                        className="ui-button-primary min-h-[46px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCreatingDeck ? "Erstelle..." : "Erstellen"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreatorOpen(false)}
                        className="ui-button-neutral min-h-[46px]"
                        disabled={isCreatingDeck}
                      >
                        Abbrechen
                      </button>
                    </div>
                    {creatorFeedback ? (
                      <div className="mt-3 rounded-[14px] border border-[rgba(207,91,66,0.22)] bg-[rgba(126,23,15,0.14)] px-4 py-3 text-sm text-[#ffd7c9]">
                        {creatorFeedback}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              <Panel className="p-4 sm:p-5 xl:row-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                      Deck - {activeDeck?.name ?? "Kein Deck"}
                    </p>
                    <p className="mt-2 text-sm text-[#bca792]">
                      {activeDeck
                        ? `${activeDeck.banlistName} · ${activeDeck.isLegal ? "legal" : "mit Problemen"}`
                        : "Noch kein Deck erstellt."}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={openEditor}
                      className="rounded-full p-2 text-[#cab69b] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f0dcc7]"
                      aria-label="Deck bearbeiten"
                    >
                      <AssetIcon name="edit" className="h-5 w-5 text-current" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-2 text-[#cab69b] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f0dcc7]"
                      aria-label="Deckoptionen"
                    >
                      <AssetIcon name="dots" className="h-5 w-5 text-current" />
                    </button>
                  </div>
                </div>

                {activeDeck ? (
                  <>
                    <div className="mt-5 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
                      <div className="grid grid-cols-5 gap-3">
                        {visibleDeckCards.map((card) => (
                          <div key={`${card.cardId}-${card.section}`} className="space-y-2">
                            <div className="relative overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#171d26_0%,#0b1016_100%)]">
                              <div className="relative aspect-[59/86]">
                                <CardArtwork
                                  src={card.imageUrl}
                                  alt={card.cardName}
                                  sizes="88px"
                                  fallbackLabel={card.cardName}
                                />
                              </div>
                              <div className="absolute bottom-2 right-2 rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(6,7,10,0.84)] px-2 py-0.5 text-[0.65rem] font-semibold text-[#f0dfcc]">
                                ×{card.quantity}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="grid grid-cols-3 gap-3">
                        <DeckCount
                          iconName="book"
                          value={activeDeck.mainCount}
                          label="Hauptdeck"
                          accent="#d3b08a"
                        />
                        <DeckCount
                          iconName="grid"
                          value={activeDeck.extraCount}
                          label="Extra Deck"
                          accent="#b88ae9"
                        />
                        <DeckCount
                          iconName="nav-packs"
                          value={activeDeck.sideCount}
                          label="Side Deck"
                          accent="#8ea7e3"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-[rgba(88,163,169,0.22)] bg-[rgba(58,118,124,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#b8e3e4]">
                        {activeDeck.isLegal ? "Legal" : "Prüfen"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[rgba(208,170,110,0.22)] bg-[rgba(208,170,110,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f0d9b0]">
                        {activeDeck.banlistName}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[rgba(126,143,168,0.18)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#d6dfec]">
                        {getErrataPolicyLabel(activeDeck.errataPolicy)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 rounded-[18px] border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.02)] px-4 py-6 text-sm text-[#b9aa96]">
                    Erstelle ein Deck, dann erscheint hier deine aktuelle Liste.
                  </div>
                )}
              </Panel>

              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                    Sammlung - Neueste Zugänge
                  </p>
                  <Link
                    href="/collection"
                    className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[#b19b84] transition hover:text-[#f0ddc8]"
                  >
                    <span>Alle anzeigen</span>
                    <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                  </Link>
                </div>

                <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">
                  {recentCollectionCards.map((card) => (
                    <article
                      key={card.id}
                      className="relative shrink-0 rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-2"
                    >
                      <div className="absolute left-3 top-3 z-10 rounded-full border border-[rgba(207,91,66,0.42)] bg-[rgba(126,23,15,0.9)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#fff0e2]">
                        Neu
                      </div>

                      <div className="relative h-[154px] w-[102px] overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#171d26_0%,#0b1016_100%)]">
                        <CardArtwork
                          src={card.imageUrl}
                          alt={card.name}
                          sizes="102px"
                          fallbackLabel={card.name}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="max-w-[70px] truncate text-[0.7rem] uppercase tracking-[0.12em] text-[#d4b18e]">
                          {card.rarity ?? "Karte"}
                        </span>
                        <span className="text-[0.68rem] uppercase tracking-[0.12em] text-[#8f8376]">
                          {card.setCode ?? "Set"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </Panel>
            </section>
          </div>
        </main>
      </div>

    </div>
  );
}
