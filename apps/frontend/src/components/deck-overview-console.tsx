"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetIcon, type AssetIconName } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import { consoleNavItems } from "@/components/console-nav-items";
import {
  ConsoleProfileMenuChip,
  ConsoleSidebarUtilityActions,
  ConsoleWindowChromeButton as WindowChromeButton,
} from "@/components/console-shell-primitives";
import { getApiErrorMessage } from "@/lib/api-client";
import { deckClient } from "@/lib/deck-client";
import { DeckEditorConsole } from "@/components/deck-editor-console";
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
    banlistName: string | null;
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

function getEraLabel(value: string) {
  const year = new Date(value).getUTCFullYear();

  if (year <= 2003) {
    return "DM Ära";
  }

  if (year <= 2007) {
    return "GX Ära";
  }

  if (year <= 2011) {
    return "5D's Ära";
  }

  if (year <= 2014) {
    return "ZEXAL Ära";
  }

  if (year <= 2017) {
    return "ARC-V Ära";
  }

  return "Moderne Ära";
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

function SidebarNavItem({
  href,
  label,
  active,
  iconName,
}: {
  href: string;
  label: string;
  active?: boolean;
  iconName: AssetIconName;
}) {
  return (
    <Link
      href={href}
      className={classes(
        "group relative flex items-center gap-4 border-y border-transparent px-6 py-8 text-sm uppercase tracking-[0.22em] transition",
        active
          ? "border-y-[rgba(196,69,48,0.14)] bg-[linear-gradient(90deg,rgba(124,32,22,0.34),rgba(124,32,22,0.12),transparent)] text-[#f4ddc2]"
          : "text-[#baa58d] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#f1deca]",
      )}
    >
      {active ? (
        <span className="absolute right-0 top-1/2 h-10 w-px -translate-y-1/2 bg-[#d04f36] shadow-[0_0_22px_rgba(208,79,54,0.95)]" />
      ) : null}
      <AssetIcon name={iconName} className="h-5 w-5 text-current" />
      <span>{label}</span>
    </Link>
  );
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

function MetricChip({
  iconName,
  label,
  value,
}: {
  iconName: AssetIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,13,18,0.62)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
      <AssetIcon name={iconName} className="h-6 w-6 text-[#d0b38c]" />
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[#9f8c77]">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#efdfcb]">{value}</p>
      </div>
    </div>
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

function FeaturedDeckCard({
  title,
  previewImageUrl,
  previewLabel,
  legal,
  mainCount,
  extraCount,
  sideCount,
}: {
  title: string;
  previewImageUrl: string | null;
  previewLabel: string;
  legal: boolean;
  mainCount: number;
  extraCount: number;
  sideCount: number;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[332px] xl:mx-0">
      <div className="pointer-events-none absolute inset-x-[14%] bottom-[-12px] h-20 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(208,86,63,0.2),transparent_72%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(11,14,19,0.9),rgba(8,10,14,0.96))] p-4 shadow-[0_30px_60px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(207,91,66,0.12),transparent_42%)]" />
        <div className="relative flex items-center justify-between gap-3 px-1 pb-3">
          <div>
            <p className="text-[0.66rem] uppercase tracking-[0.2em] text-[#9f8c77]">
              Aktives Deck
            </p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.08em] text-[#f0dfcc]">
              {title}
            </p>
          </div>
          <span
            className={classes(
              "inline-flex items-center rounded-full border px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
              legal
                ? "border-[rgba(88,163,169,0.22)] bg-[rgba(58,118,124,0.12)] text-[#b8e3e4]"
                : "border-[rgba(207,91,66,0.28)] bg-[rgba(126,23,15,0.18)] text-[#ffd7c9]",
            )}
          >
            {legal ? "Legal" : "Prüfen"}
          </span>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(23,29,38,0.96),rgba(11,16,22,0.98))]">
          <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
          <div className="relative aspect-[61/90]">
            <CardArtwork
              src={previewImageUrl}
              alt={previewLabel}
              sizes="332px"
              fallbackLabel={previewLabel}
              objectFit="cover"
            />
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-[#f0dfcc]">{mainCount}</p>
            <p className="mt-1 text-[0.66rem] uppercase tracking-[0.18em] text-[#9d8a75]">
              Main
            </p>
          </div>
          <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-[#eadbff]">{extraCount}</p>
            <p className="mt-1 text-[0.66rem] uppercase tracking-[0.18em] text-[#9d8a75]">
              Extra
            </p>
          </div>
          <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-[#d6e2ff]">{sideCount}</p>
            <p className="mt-1 text-[0.66rem] uppercase tracking-[0.18em] text-[#9d8a75]">
              Side
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeckOverviewConsole({
  viewer,
  collectionProgress,
  latestBanlistName,
  selectedDeckId,
  decks,
  recentCollectionCards,
  activeDeck,
  availableBanlists,
  collectionCards,
}: DeckOverviewConsoleProps) {
  const router = useRouter();
  const libraryRowRef = useRef<HTMLDivElement | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [draftDeckName, setDraftDeckName] = useState("");
  const [draftBanlistId, setDraftBanlistId] = useState(availableBanlists[0]?.id ?? "");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [creatorFeedback, setCreatorFeedback] = useState<string | null>(null);
  const selectedDeck =
    decks.find((deck) => deck.id === selectedDeckId) ??
    decks[0] ??
    null;
  const heroCard =
    activeDeck?.cards[0]
      ? {
          imageUrl: activeDeck.cards[0].imageUrl,
          name: activeDeck.cards[0].cardName,
        }
      : selectedDeck
        ? {
            imageUrl: selectedDeck.previewImageUrl,
            name: selectedDeck.previewLabel,
          }
        : null;
  const heroEra = getEraLabel(activeDeck?.snapshotDate ?? new Date().toISOString());
  const visibleDeckCards = activeDeck?.cards.slice(0, 10) ?? [];
  const resolvedDraftBanlistId = draftBanlistId || availableBanlists[0]?.id || "";

  function scrollLibrary(direction: "left" | "right") {
    libraryRowRef.current?.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
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

      if (!shell?.saveTextFile) {
        throw new Error("Desktop-Export ist in dieser Umgebung nicht verfügbar.");
      }

      const saveResult = await shell.saveTextFile({
        defaultPath: data.export.fileName,
        content: data.export.exportBody,
        filters: [{ name: "EDOPro Deck", extensions: ["ydk"] }],
      });

      if (!saveResult.canceled && saveResult.filePath) {
        await shell.revealPath?.(saveResult.filePath);
      }
    } catch (error) {
      setExportFeedback(getApiErrorMessage(error, "Deck konnte nicht exportiert werden."));
    } finally {
      setIsExporting(false);
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
        banlistId: resolvedDraftBanlistId || null,
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
        <aside className="app-sidebar border-b border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,15,0.78),rgba(5,7,10,0.9))] shadow-[18px_0_46px_rgba(0,0,0,0.34)] backdrop-blur-[18px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[196px] lg:border-b-0 lg:border-r lg:border-r-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-0 lg:py-0">
            <div className="border-b border-[rgba(255,255,255,0.08)] lg:px-6 lg:pb-8 lg:pt-6">
              <ConsoleBrand size="sm" />
            </div>

            <nav className="hidden lg:block lg:pt-2">
              {consoleNavItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  iconName={item.iconName}
                  active={item.href === "/decks"}
                />
              ))}
            </nav>

            <ConsoleSidebarUtilityActions />
          </div>

          <nav
            className="grid border-t border-[rgba(255,255,255,0.08)] lg:hidden"
            style={{ gridTemplateColumns: `repeat(${consoleNavItems.length}, minmax(0, 1fr))` }}
          >
            {consoleNavItems.map((item) => {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classes(
                    "flex flex-col items-center gap-2 px-1 py-3 text-[0.58rem] uppercase tracking-[0.16em] transition",
                    item.href === "/decks"
                      ? "bg-[rgba(207,91,66,0.14)] text-[#f4d9c4]"
                      : "text-[#aa9983] hover:bg-[rgba(255,255,255,0.04)]",
                  )}
                >
                  <AssetIcon name={item.iconName} className="h-5 w-5 text-current" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="relative flex-1 overflow-hidden lg:ml-[196px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-3 pb-4 pt-3 sm:px-4 lg:px-5">
            <section className="relative xl:min-h-[520px]">
              <div className="relative">
                <div className="hidden justify-end gap-3 xl:flex">
                  <WindowChromeButton name="window-min" label="Minimieren" />
                  <WindowChromeButton name="window-max" label="Fenster" />
                  <WindowChromeButton name="window-close" label="Schließen" />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3 xl:mt-2">
                  <MetricChip
                    iconName="book"
                    label="Sammlung"
                    value={`${collectionProgress.owned} / ${collectionProgress.total}`}
                  />
                  <MetricChip
                    iconName="scale"
                    label="Banlist"
                    value={latestBanlistName}
                  />
                  <MetricChip iconName="hourglass" label="Aktive Ära" value={heroEra} />

                  <ConsoleProfileMenuChip viewer={{ displayName: viewer.displayName }} />
                </div>
              </div>

              <div className="relative mt-5 grid gap-8 xl:grid-cols-[360px_520px_minmax(0,1fr)] xl:items-end">
                <div className="xl:self-end">
                  {heroCard ? (
                    <FeaturedDeckCard
                      title={activeDeck?.name ?? heroCard.name}
                      previewImageUrl={heroCard.imageUrl}
                      previewLabel={heroCard.name}
                      legal={activeDeck?.isLegal ?? true}
                      mainCount={activeDeck?.mainCount ?? selectedDeck?.mainCount ?? 0}
                      extraCount={activeDeck?.extraCount ?? selectedDeck?.extraCount ?? 0}
                      sideCount={activeDeck?.sideCount ?? selectedDeck?.sideCount ?? 0}
                    />
                  ) : null}
                </div>

                <div className="max-w-[520px]">
                  <p className="text-[0.8rem] uppercase tracking-[0.26em] text-[#cb5c44]">
                    Aktives Deck
                  </p>
                  <h1 className="font-display inscription-text mt-3 text-4xl leading-[0.92] uppercase tracking-[0.025em] sm:text-5xl xl:text-[4rem]">
                    {activeDeck?.name ?? "Kein Deck"}
                  </h1>

                  <div className="mt-6 flex flex-wrap gap-7 text-sm text-[#d9c6ad]">
                    <div className="flex items-center gap-2">
                      <AssetIcon name="clock" className="h-4 w-4 text-[#c7ae8d]" />
                      <span>{activeDeck ? formatGermanDateUtc(activeDeck.snapshotDate) : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AssetIcon name="book" className="h-4 w-4 text-[#c7ae8d]" />
                      <span>{activeDeck?.cardCount ?? 0} Karten</span>
                    </div>
                  </div>

                  <div className="mt-7 flex max-w-[320px] flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEditor(true)}
                      className="flex min-h-[56px] items-center justify-center gap-3 rounded-[4px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-5 text-base font-semibold uppercase tracking-[0.14em] text-[#fff0e1] shadow-[0_0_32px_rgba(151,29,20,0.28)] transition hover:brightness-110"
                    >
                      <span>Deck öffnen</span>
                      <AssetIcon name="nav-packs" className="h-5 w-5 text-current" />
                    </button>

                    <button
                      type="button"
                      onClick={handleExportDeck}
                      disabled={!activeDeck || isExporting}
                      className="flex min-h-[48px] items-center justify-center gap-3 rounded-[8px] border border-[rgba(88,163,169,0.26)] bg-[rgba(58,118,124,0.14)] px-5 text-sm uppercase tracking-[0.18em] text-[#c5eef0] transition hover:bg-[rgba(58,118,124,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{isExporting ? "Exportiert..." : "Als .ydk exportieren"}</span>
                      <AssetIcon name="copy" className="h-4 w-4 text-current" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById("deck-library")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className="flex min-h-[48px] items-center justify-center gap-3 rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[rgba(13,16,21,0.88)] px-5 text-sm uppercase tracking-[0.18em] text-[#ceb99f] transition hover:border-[rgba(202,80,59,0.28)] hover:text-[#f2dfcb]"
                    >
                      <span>Deck wählen</span>
                      <AssetIcon name="grid" className="h-4 w-4 text-current" />
                    </button>
                  </div>

                  {exportFeedback ? (
                    <div className="mt-3 max-w-[320px] rounded-[14px] border border-[rgba(207,91,66,0.24)] bg-[rgba(126,23,15,0.16)] px-4 py-3 text-sm text-[#ffd7c9]">
                      {exportFeedback}
                    </div>
                  ) : null}
                </div>

                <div className="hidden xl:block" />
              </div>
            </section>

            <section className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,1fr)_392px] xl:grid-rows-[auto_auto]">
              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                    Deckbibliothek
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollLibrary("left")}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#c9b79f] transition hover:border-[rgba(207,91,66,0.26)] hover:text-[#f2dfcb]"
                      aria-label="Deckreihe nach links scrollen"
                    >
                      <AssetIcon name="chevron-left" className="h-4 w-4 text-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollLibrary("right")}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#c9b79f] transition hover:border-[rgba(207,91,66,0.26)] hover:text-[#f2dfcb]"
                      aria-label="Deckreihe nach rechts scrollen"
                    >
                      <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditor(true)}
                      className="ml-2 inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[#b19b84] transition hover:text-[#f0ddc8]"
                    >
                      <span>Alle anzeigen</span>
                      <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                    </button>
                  </div>
                </div>

                <div
                  id="deck-library"
                  ref={libraryRowRef}
                  className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-3"
                >
                  {decks.map((deck) => {
                    const selected = deck.id === selectedDeckId;

                    return (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => router.push(`/decks?deck=${deck.id}`)}
                        className={classes(
                          "group relative shrink-0 rounded-[16px] border p-2 transition",
                          selected
                            ? "border-[rgba(207,91,66,0.48)] bg-[rgba(207,91,66,0.08)] shadow-[0_0_0_1px_rgba(207,91,66,0.16)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.16)]",
                        )}
                      >
                        <div className="relative flex h-[150px] w-[98px] items-center justify-center overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,21,28,0.96),rgba(10,12,16,0.98))] px-1 py-2">
                          <CardArtwork
                            src={deck.previewImageUrl}
                            alt={deck.name}
                            sizes="102px"
                            fallbackLabel={deck.previewLabel}
                            objectFit="contain"
                          />
                        </div>

                        {selected ? (
                          <div className="absolute inset-x-0 -bottom-2 flex justify-center">
                            <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#cf5b42]" />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setCreatorOpen(true)}
                    className="group relative flex shrink-0 flex-col items-center justify-center rounded-[16px] border border-dashed border-[rgba(208,170,110,0.28)] bg-[rgba(255,255,255,0.025)] p-2 text-[#d9c4aa] transition hover:border-[rgba(207,91,66,0.42)] hover:bg-[rgba(207,91,66,0.08)] hover:text-[#f4dfc9]"
                    aria-label="Neues Deck erstellen"
                  >
                    <div className="flex h-[150px] w-[98px] items-center justify-center rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,21,28,0.9),rgba(10,12,16,0.96))]">
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
                    <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.9fr)_auto_auto] lg:items-end">
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
                          Bannliste
                        </span>
                        <select
                          value={resolvedDraftBanlistId}
                          onChange={(event) => setDraftBanlistId(event.target.value)}
                          className="ui-input mt-2"
                          disabled={isCreatingDeck || availableBanlists.length === 0}
                        >
                          {availableBanlists.map((banlist) => (
                            <option key={banlist.id} value={banlist.id}>
                              {banlist.name}
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
                      onClick={() => setShowEditor(true)}
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

      {showEditor ? (
        <div className="fixed inset-0 z-50 bg-[rgba(4,6,10,0.74)] p-4 backdrop-blur-md sm:p-6">
          <div className="mx-auto flex h-full max-w-[1450px] flex-col rounded-[28px] border border-[rgba(255,255,255,0.10)] bg-[linear-gradient(180deg,rgba(10,13,18,0.94),rgba(7,9,13,0.98))] shadow-[0_34px_80px_rgba(0,0,0,0.48)]">
            <div className="flex items-center justify-between gap-4 border-b border-[rgba(255,255,255,0.08)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[0.74rem] uppercase tracking-[0.22em] text-[#cb5c44]">
                  Editor
                </p>
                <h2 className="font-display inscription-text-soft mt-2 text-3xl leading-tight">
                  {activeDeck?.name ?? "Neues Deck"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#d9c5ac] transition hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(18,22,28,0.72)]"
                aria-label="Editor schließen"
              >
                <AssetIcon name="window-close" className="h-4 w-4 text-current" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">
              <DeckEditorConsole
                activeDeck={activeDeck}
                availableBanlists={availableBanlists}
                collectionCards={collectionCards}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
