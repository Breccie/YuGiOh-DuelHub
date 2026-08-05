"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MediaAssetDto } from "@ygo/contracts";
import { AppShell } from "@/components/app-shell";
import { AssetIcon } from "@/components/asset-icon";
import { BinderCollectionEditor } from "@/components/binder-collection-editor";
import { BinderOpenSpread } from "@/components/binder-open-spread";
import { BinderDesignPreview } from "@/components/personal-design-preview";
import { ImageCropUpload } from "@/components/image-crop-upload";
import {
  CardCatalogFilterDrawer,
  emptyCardCatalogFilters,
  type CardCatalogFilters,
} from "@/components/card-catalog-controls";
import { ConsoleGlobalStatusBar } from "@/components/console-shell-primitives";
import { StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import { binderSlotCount } from "@/lib/binder-open-layout";
import { collectionClient } from "@/lib/collection-client";
import { wishlistClient } from "@/lib/wishlist-client";
import { mediaClient } from "@/lib/media-client";
import {
  binderCoverCatalog,
  getCollectionSortLabel,
  type BinderCoverKey,
  type CollectionSortModeValue,
} from "@/lib/collection-showcase-config";
import type {
  CollectionBinderEditorSnapshot,
  CollectionBinderDto,
  CollectionPresetDto,
} from "@/lib/collection-showcase";

type CollectionBinderConsoleProps = {
  viewer: {
    displayName: string;
    duelistId?: string | null;
    avatarImageUrl?: string | null;
  };
  collectionProgress: {
    owned: number;
    total: number;
    copies: number;
    duplicates: number;
    available: number;
  };
  binders: CollectionBinderDto[];
  presets: CollectionPresetDto[];
  cards: Array<{
    cardId: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
    attribute?: string | null;
    monsterType?: string | null;
    levelRankLink?: number | null;
    atk?: number | null;
    def?: number | null;
    currentOracleText: string | null;
    totalCopies: number;
    availableCopies: number;
    reservedCopies: number;
    tradedCopies: number;
    latestAcquiredAt: string;
    printings: Array<{
      key: string;
      setLabel: string;
      setCode: string | null;
      rarity: string | null;
      releaseDate?: string | null;
      copies: number;
    }>;
    sources: Array<{
      source: string;
      label: string;
      copies: number;
    }>;
  }>;
  recentEntries: Array<{
    id: string;
    acquiredAt: string;
    source: string;
    sourceLabel: string;
    lockState: "AVAILABLE" | "RESERVED" | "TRADED";
    card: {
      id: string;
      name: string;
      kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
      imageUrl: string | null;
    };
    printingLabel: string;
  }>;
  initialEditorSnapshot?: CollectionBinderEditorSnapshot | null;
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function formatGermanDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getBinderFilledSlots(binder: CollectionBinderDto) {
  return binder.pages.reduce((sum, page) => sum + page.filledSlots, 0);
}

function getBinderKindCount(
  binder: CollectionBinderDto,
  kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN",
) {
  return binder.pages.reduce(
    (pageSum, page) =>
      pageSum +
      page.slots.filter((slot) => slot.status === "filled" && slot.kind === kind).length,
    0,
  );
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
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

function BinderShelfCard({
  binder,
  onSelect,
  onEdit,
  onDelete,
}: {
  binder: CollectionBinderDto;
  onSelect: (binderId: string) => void;
  onEdit: (binderId: string) => void;
  onDelete: (binder: CollectionBinderDto) => void;
}) {
  const filledSlots = getBinderFilledSlots(binder);

  return (
    <article
      className={classes(
        "group rounded-[20px] border bg-[rgba(7,10,15,0.72)] p-3 transition",
        binder.isActive
          ? "border-[rgba(207,91,66,0.5)] shadow-[0_0_0_1px_rgba(207,91,66,0.14),0_22px_42px_rgba(0,0,0,0.32)]"
          : "border-[rgba(214,164,92,0.12)] hover:border-[rgba(207,91,66,0.26)] hover:bg-[rgba(255,255,255,0.035)]",
      )}
    >
      <button type="button" onClick={() => onSelect(binder.id)} className="block w-full text-left">
        <div className="relative mx-auto w-full max-w-[160px] [perspective:1400px]">
          <div className="pointer-events-none absolute inset-x-[12%] bottom-1 h-8 rounded-full bg-[radial-gradient(circle,rgba(207,91,66,0.18),transparent_72%)] opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" />
          <div className="relative aspect-[2/3] bg-transparent">
            <BinderDesignPreview imageUrl={binder.coverImageUrl} alt={binder.name} custom={Boolean(binder.coverAssetId)} className="h-full w-full" />
            <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.26),transparent_34%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(125deg,transparent_18%,rgba(255,255,255,0.07)_38%,rgba(255,255,255,0.18)_48%,rgba(255,255,255,0.06)_56%,transparent_74%)]" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-6 text-[#f5e0c3]">
              {binder.name}
            </p>
            <p className="mt-1 text-sm text-[#c9b69d]">
              {filledSlots} Karten
            </p>
          </div>
          {binder.isActive ? <StatusPill tone="ember">Aktiv</StatusPill> : null}
        </div>
      </button>

      <div className="mt-3 flex items-center gap-2">
        <span className="min-h-[34px] flex-1 rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-3 py-2 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#cbb79d]">
          {binder.pageCount} Seiten
        </span>
        <button
          type="button"
          onClick={() => onEdit(binder.id)}
          className="grid h-[34px] w-[42px] place-items-center rounded-[4px] border border-[rgba(214,164,92,0.18)] bg-[rgba(150,97,33,0.1)] text-[#f0d3aa] transition hover:border-[rgba(214,164,92,0.34)]"
          aria-label={`${binder.name} bearbeiten`}
        >
          <AssetIcon name="edit" className="h-4 w-4 text-current" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(binder)}
          className="grid h-[34px] w-[42px] place-items-center rounded-[4px] border border-[rgba(207,79,54,0.24)] bg-[rgba(151,29,20,0.1)] text-[#e9a38f] transition hover:border-[rgba(207,79,54,0.46)] hover:bg-[rgba(151,29,20,0.18)]"
          aria-label={`${binder.name} löschen`}
        >
          <AssetIcon name="window-close" className="h-4 w-4 text-current" />
        </button>
      </div>
    </article>
  );
}

function AddBinderTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-[20px] border border-dashed border-[rgba(208,170,110,0.28)] bg-[rgba(7,10,15,0.52)] p-3 text-[#d9c4aa] transition hover:border-[rgba(207,91,66,0.42)] hover:bg-[rgba(207,91,66,0.08)] hover:text-[#f4dfc9]"
    >
      <div className="relative mx-auto flex w-full max-w-[160px] items-center justify-center [perspective:1400px]">
        <div className="relative flex aspect-[62/100] w-full items-center justify-center rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,21,28,0.9),rgba(10,12,16,0.96))] shadow-[0_22px_34px_rgba(0,0,0,0.28)]">
          <span className="grid h-14 w-14 place-items-center rounded-full border border-[rgba(208,170,110,0.28)] bg-[rgba(208,170,110,0.08)] transition group-hover:border-[rgba(207,91,66,0.44)]">
            <AssetIcon name="plus" className="h-7 w-7 text-current" />
          </span>
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-semibold uppercase tracking-[0.16em]">
        Neuer Binder
      </p>
    </button>
  );
}

function BinderDetailPanel({
  binder,
  onEdit,
}: {
  binder: CollectionBinderDto;
  onEdit: (binderId: string) => void;
}) {
  const filledSlots = getBinderFilledSlots(binder);
  const monsterCount = getBinderKindCount(binder, "MONSTER");
  const spellCount = getBinderKindCount(binder, "SPELL");
  const trapCount = getBinderKindCount(binder, "TRAP");

  return (
    <Panel className="sticky top-6 overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.68rem] uppercase tracking-[0.22em] text-[#cb5c44]">
            Ausgestellt
          </p>
          <h2 className="font-display inscription-text-soft mt-2 truncate text-3xl leading-8 text-[#f5dfc0]">
            {binder.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onEdit(binder.id)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[4px] border border-[rgba(214,164,92,0.18)] bg-[rgba(150,97,33,0.1)] text-[#f0d3aa] transition hover:border-[rgba(214,164,92,0.34)]"
          aria-label={`${binder.name} bearbeiten`}
        >
          <AssetIcon name="edit" className="h-4 w-4 text-current" />
        </button>
      </div>

      <div className="relative mx-auto mt-5 w-full max-w-[230px] [perspective:1400px]">
        <div className="pointer-events-none absolute inset-x-[16%] bottom-1 h-10 rounded-full bg-[radial-gradient(circle,rgba(207,91,66,0.18),transparent_72%)] blur-2xl" />
        <div className="relative aspect-[2/3] bg-transparent shadow-[0_28px_48px_rgba(0,0,0,0.42)]">
          <BinderDesignPreview imageUrl={binder.coverImageUrl} alt={binder.name} custom={Boolean(binder.coverAssetId)} className="h-full w-full" />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,transparent_18%,rgba(255,255,255,0.05)_38%,rgba(255,255,255,0.16)_48%,rgba(255,255,255,0.04)_58%,transparent_74%)]" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2 text-center">
        {[
          ["Karten", filledSlots],
          ["Monster", monsterCount],
          ["Zauber", spellCount],
          ["Fallen", trapCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[10px] border border-[rgba(214,164,92,0.12)] bg-[rgba(255,255,255,0.035)] px-2 py-3">
            <p className="text-lg font-semibold text-[#f5dfc0]">{value}</p>
            <p className="mt-1 text-[0.56rem] uppercase tracking-[0.12em] text-[#a9957b]">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-4 border-t border-[rgba(255,255,255,0.08)] pt-5 text-sm text-[#d4c1aa]">
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[#9f8c77]">
            Cover
          </p>
          <p className="mt-1 font-semibold text-[#f1deca]">{binder.coverName}</p>
        </div>
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[#9f8c77]">
            Aktualisiert
          </p>
          <p className="mt-1 font-semibold text-[#f1deca]">
            {formatGermanDateTime(binder.updatedAt)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onEdit(binder.id)}
        className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[4px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff0e1] shadow-[0_0_26px_rgba(151,29,20,0.22)] transition hover:brightness-110"
      >
        <AssetIcon name="edit" className="h-4 w-4 text-current" />
        Bearbeiten
      </button>
    </Panel>
  );
}

function ActiveBinderShowcase({
  binder,
  pageIndex,
  onPageChange,
}: {
  binder: CollectionBinderDto;
  pageIndex: number;
  onPageChange: (pageIndex: number) => void;
}) {
  const safePageIndex = Math.min(Math.max(0, pageIndex), Math.max(0, binder.pages.length - 1));
  const activePage = binder.pages[safePageIndex] ?? binder.pages[0] ?? null;
  const filledSlots = binder.pages.reduce((sum, page) => sum + page.filledSlots, 0);

  return (
    <Panel className="overflow-hidden p-4 sm:p-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[#cb5c44]">
              Geöffneter Binder
            </p>
            <h2 className="font-display inscription-text-soft mt-1 truncate text-2xl uppercase tracking-[0.02em] text-[#f7e4ce]">
              {binder.name}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="slate">{binder.pageCount} Seiten</StatusPill>
            <StatusPill tone="teal">{filledSlots} Karten</StatusPill>
          </div>
        </div>

        {activePage ? (
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {binder.pages.map((page, index) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => onPageChange(index)}
                    className={classes(
                      "rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold transition",
                      safePageIndex === index
                        ? "border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.86),rgba(95,14,9,0.9))] text-[#fff0e1] shadow-[0_0_22px_rgba(151,29,20,0.18)]"
                        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d] hover:border-[rgba(207,91,66,0.18)]",
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#d5c4af]">
                {activePage.filledSlots}/18
              </span>
            </div>
            <BinderOpenSpread compact className="mx-auto max-w-[860px]" slots={activePage.slots} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function CollectionBinderConsole({
  viewer,
  binders,
  cards,
  collectionProgress,
  initialEditorSnapshot = null,
}: CollectionBinderConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [binderOptions, setBinderOptions] = useState(binders);
  const [draftBinderName, setDraftBinderName] = useState("");
  const [draftCoverKey, setDraftCoverKey] = useState<BinderCoverKey>(binderCoverCatalog[0].key);
  const [draftCoverAssetId, setDraftCoverAssetId] = useState<string | null>(null);
  const [personalCovers, setPersonalCovers] = useState<MediaAssetDto[]>([]);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [activePreviewPageIndex, setActivePreviewPageIndex] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"binder" | null>(null);
  const [collectionView, setCollectionView] = useState<"CARDS" | "BINDERS">("CARDS");
  const [collectionSearch, setCollectionSearch] = useState("");

  useEffect(() => {
    void mediaClient.list("BINDER_COVER").then(setPersonalCovers).catch(() => undefined);
  }, []);
  const [collectionFilters, setCollectionFilters] = useState<CardCatalogFilters>(emptyCardCatalogFilters);
  const [collectionSort, setCollectionSort] =
    useState<CollectionSortModeValue | "NAME_DESC" | "LEVEL_ASC" | "LEVEL_DESC" | "ATK_ASC" | "ATK_DESC" | "DEF_ASC" | "DEF_DESC" | "TYPE_ASC" | "ATTRIBUTE_ASC" | "NEWEST_SET">("MOST_COPIES");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<CollectionBinderDto | null>(null);
  const [, startTransition] = useTransition();

  const editorBinderId =
    searchParams.get("mode") === "edit" ? searchParams.get("binder") : null;
  const editorInitialPageIndex = Math.max(
    0,
    Number.parseInt(searchParams.get("page") ?? "0", 10) || 0,
  );
  const parsedEditorSlotIndex = Number.parseInt(searchParams.get("slot") ?? "", 10);
  const editorInitialSlotIndex = Number.isFinite(parsedEditorSlotIndex)
    ? Math.max(0, Math.min(binderSlotCount - 1, parsedEditorSlotIndex))
    : null;
  const activeBinder =
    binderOptions.find((binder) => binder.isActive) ?? binderOptions[0] ?? null;
  useEffect(() => {
    const savedView = window.localStorage.getItem("collection-workspace-view");
    const savedSort = window.localStorage.getItem("collection-sort-mode");
    const frameId = window.requestAnimationFrame(() => {
      if (savedView === "BINDERS") {
        setCollectionView("BINDERS");
      }
      if (
        savedSort === "MOST_COPIES" ||
        savedSort === "NEWEST_ACQUIRED" ||
        savedSort === "ALPHABETICAL" ||
        savedSort === "RARITY" ||
        ["NAME_DESC", "LEVEL_ASC", "LEVEL_DESC", "ATK_ASC", "ATK_DESC", "DEF_ASC", "DEF_DESC", "TYPE_ASC", "ATTRIBUTE_ASC", "NEWEST_SET"].includes(savedSort ?? "")
      ) {
        setCollectionSort(savedSort as typeof collectionSort);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("collection-sort-mode", collectionSort);
  }, [collectionSort]);
  const collectionRarities = useMemo(
    () =>
      Array.from(
        new Set(
          cards.flatMap((card) =>
            card.printings
              .map((printing) => printing.rarity)
              .filter((rarity): rarity is string => Boolean(rarity)),
          ),
        ),
      ).sort((left, right) => left.localeCompare(right, "de")),
    [cards],
  );
  const collectionFacets = useMemo(() => ({
    monsterTypes: [...new Set(cards.map((card) => card.monsterType).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "de")),
    attributes: [...new Set(cards.map((card) => card.attribute).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "de")),
    levels: [...new Set(cards.map((card) => card.levelRankLink).filter((value): value is number => value !== null && value !== undefined))].sort((left, right) => left - right),
    rarities: collectionRarities,
    setCodes: [...new Set(cards.flatMap((card) => card.printings.map((printing) => printing.setCode).filter((value): value is string => Boolean(value))))].sort((left, right) => left.localeCompare(right, "de")),
  }), [cards, collectionRarities]);
  const filteredCollectionCards = useMemo(() => {
    const search = collectionSearch.trim().toLowerCase();
    const minimumLevel = collectionFilters.levelMin ? Number(collectionFilters.levelMin) : null;
    const maximumLevel = collectionFilters.levelMax ? Number(collectionFilters.levelMax) : null;
    const minimumAtk = collectionFilters.atkMin ? Number(collectionFilters.atkMin) : null;
    const maximumAtk = collectionFilters.atkMax ? Number(collectionFilters.atkMax) : null;
    const minimumDef = collectionFilters.defMin ? Number(collectionFilters.defMin) : null;
    const maximumDef = collectionFilters.defMax ? Number(collectionFilters.defMax) : null;

    return cards
      .filter((card) => {
        if (collectionFilters.kind !== "ALL" && card.kind !== collectionFilters.kind) return false;
        if (collectionFilters.rarity && !card.printings.some((printing) => printing.rarity === collectionFilters.rarity)) return false;
        if (collectionFilters.setCode && !card.printings.some((printing) => printing.setCode?.toLocaleLowerCase("de").includes(collectionFilters.setCode.toLocaleLowerCase("de")))) return false;
        if (collectionFilters.monsterType && !card.monsterType?.toLocaleLowerCase("de").includes(collectionFilters.monsterType.toLocaleLowerCase("de"))) return false;
        if (collectionFilters.attribute && card.attribute !== collectionFilters.attribute) return false;
        if (minimumLevel !== null && (card.levelRankLink ?? -1) < minimumLevel) return false;
        if (maximumLevel !== null && (card.levelRankLink ?? Number.POSITIVE_INFINITY) > maximumLevel) return false;
        if (minimumAtk !== null && (card.atk ?? -1) < minimumAtk) return false;
        if (maximumAtk !== null && (card.atk ?? Number.POSITIVE_INFINITY) > maximumAtk) return false;
        if (minimumDef !== null && (card.def ?? -1) < minimumDef) return false;
        if (maximumDef !== null && (card.def ?? Number.POSITIVE_INFINITY) > maximumDef) return false;

        return !search || `${card.name} ${card.slug}`.toLowerCase().includes(search);
      })
      .sort((left, right) => {
        if (collectionSort === "NEWEST_ACQUIRED") {
          return (
            new Date(right.latestAcquiredAt).getTime() -
              new Date(left.latestAcquiredAt).getTime() ||
            left.name.localeCompare(right.name, "de")
          );
        }
        if (collectionSort === "ALPHABETICAL") {
          return left.name.localeCompare(right.name, "de");
        }
        if (collectionSort === "NAME_DESC") return right.name.localeCompare(left.name, "de");
        if (collectionSort === "LEVEL_ASC" || collectionSort === "LEVEL_DESC") return ((left.levelRankLink ?? -1) - (right.levelRankLink ?? -1)) * (collectionSort === "LEVEL_ASC" ? 1 : -1) || left.name.localeCompare(right.name, "de");
        if (collectionSort === "ATK_ASC" || collectionSort === "ATK_DESC") return ((left.atk ?? -1) - (right.atk ?? -1)) * (collectionSort === "ATK_ASC" ? 1 : -1) || left.name.localeCompare(right.name, "de");
        if (collectionSort === "DEF_ASC" || collectionSort === "DEF_DESC") return ((left.def ?? -1) - (right.def ?? -1)) * (collectionSort === "DEF_ASC" ? 1 : -1) || left.name.localeCompare(right.name, "de");
        if (collectionSort === "TYPE_ASC") return `${left.kind}:${left.monsterType ?? ""}:${left.name}`.localeCompare(`${right.kind}:${right.monsterType ?? ""}:${right.name}`, "de");
        if (collectionSort === "ATTRIBUTE_ASC") return `${left.attribute ?? "ZZZ"}:${left.name}`.localeCompare(`${right.attribute ?? "ZZZ"}:${right.name}`, "de");
        if (collectionSort === "NEWEST_SET") return Math.max(...right.printings.map((printing) => printing.releaseDate ? new Date(printing.releaseDate).getTime() : 0)) - Math.max(...left.printings.map((printing) => printing.releaseDate ? new Date(printing.releaseDate).getTime() : 0)) || left.name.localeCompare(right.name, "de");
        if (collectionSort === "RARITY") {
          return (
            (right.printings[0]?.rarity ?? "").localeCompare(
              left.printings[0]?.rarity ?? "",
              "de",
            ) || left.name.localeCompare(right.name, "de")
          );
        }
        return (
          right.totalCopies - left.totalCopies ||
          left.name.localeCompare(right.name, "de")
        );
      });
  }, [cards, collectionFilters, collectionSearch, collectionSort]);

  function updateEditorRoute(
    nextBinderId: string | null,
    options?: {
      pageIndex?: number;
      slotIndex?: number | null;
    },
  ) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextBinderId) {
      nextParams.set("mode", "edit");
      nextParams.set("binder", nextBinderId);
      nextParams.set("page", String(options?.pageIndex ?? 0));

      if (options?.slotIndex !== undefined && options.slotIndex !== null) {
        nextParams.set("slot", String(options.slotIndex));
      } else {
        nextParams.delete("slot");
      }
    } else {
      nextParams.delete("mode");
      nextParams.delete("binder");
      nextParams.delete("page");
      nextParams.delete("slot");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });

    if (!nextBinderId) {
      router.refresh();
    }
  }

  async function handleEditorClose() {
    if (editorBinderId) {
      try {
        const payload = await collectionClient.getBinderEditor(editorBinderId);
        setBinderOptions((current) =>
          current.map((binder) =>
            binder.id === editorBinderId ? payload.binder : binder,
          ),
        );
      } catch {
        // The route refresh below remains the fallback if the targeted reload fails.
      }
    }

    updateEditorRoute(null);
  }

  async function handleActivateBinder(binderId: string) {
    if (busyAction) {
      return;
    }

    setBusyAction("binder");
    setFeedbackMessage(null);

    try {
      const payload = await collectionClient.updateBinder(binderId, {
        isActive: true,
      });

      startTransition(() => {
        setBinderOptions((current) =>
          current.map((binder) => ({
            ...binder,
            isActive: binder.id === payload.binder.id,
          })),
        );
        setActivePreviewPageIndex(0);
      });
    } catch (error) {
      setFeedbackMessage(getApiErrorMessage(error, "Binder konnte nicht aktiviert werden."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateBinder() {
    if (!draftBinderName.trim() || busyAction) {
      return;
    }

    setBusyAction("binder");
    setFeedbackMessage(null);

    try {
      const payload = await collectionClient.createBinder({
        name: draftBinderName.trim(),
        coverKey: draftCoverKey,
        coverAssetId: draftCoverAssetId,
      });

      startTransition(() => {
        setBinderOptions((current) => [
          payload.binder,
          ...current.map((binder) => ({
            ...binder,
            isActive: false,
          })),
        ]);
      setDraftBinderName("");
      setDraftCoverAssetId(null);
        setCreatorOpen(false);
        updateEditorRoute(payload.binder.id, {
          pageIndex: 0,
          slotIndex: null,
        });
      });
      setFeedbackMessage(`Binder "${payload.binder.name}" wurde erstellt und geöffnet.`);
    } catch (error) {
      setFeedbackMessage(getApiErrorMessage(error, "Binder konnte nicht erstellt werden."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteBinder() {
    const binder = deleteCandidate;
    if (busyAction || !binder) {
      return;
    }

    setBusyAction("binder");
    setFeedbackMessage(null);

    try {
      const result = await collectionClient.deleteEmptyBinder(binder.id);
      const replacementIsNew =
        result.activeBinderId !== null &&
        !binderOptions.some((item) => item.id === result.activeBinderId);
      setBinderOptions((current) =>
        current
          .filter((item) => item.id !== result.deletedBinderId)
          .map((item) => ({
            ...item,
            isActive: result.activeBinderId ? item.id === result.activeBinderId : item.isActive,
          })),
      );
      setDeleteCandidate(null);
      setFeedbackMessage(
        `Binder „${binder.name}“ wurde gelöscht. Alle Karten bleiben in deiner Sammlung.`,
      );
      if (replacementIsNew) {
        window.location.assign(pathname);
        return;
      }
      router.refresh();
    } catch (error) {
      setFeedbackMessage(getApiErrorMessage(error, "Binder konnte nicht gelöscht werden."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddCardToWishlist(cardId: string, cardName: string) {
    setFeedbackMessage(null);

    try {
      await wishlistClient.upsert({
        cardId,
        desiredQuantity: 1,
        priority: "NORMAL",
        note: null,
      });
      setFeedbackMessage(`„${cardName}“ wurde zur Wunschliste hinzugefügt.`);
    } catch (error) {
      setFeedbackMessage(
        getApiErrorMessage(error, "Karte konnte nicht zur Wunschliste hinzugefügt werden."),
      );
    }
  }

  return (
    <div>
      <AppShell
        topbar={(
          <ConsoleGlobalStatusBar
            viewer={{ displayName: viewer.displayName, duelistId: viewer.duelistId, avatarImageUrl: viewer.avatarImageUrl }}
            fallback={{
              collectionValue: `${collectionProgress.owned} / ${collectionProgress.total}`,
            }}
          />
        )}
      >
            <header className="mt-3 flex flex-col gap-3 rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(8,12,18,0.76)] p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#cb5c44]">
                  Sammlung
                </p>
                <h1 className="truncate text-xl font-semibold text-[#f2e7da] sm:text-2xl">
                  {collectionView === "CARDS" ? "Kartensammlung" : "Binder"}
                </h1>
                <p className="mt-1 text-xs text-[#9f8f7d]">
                  {collectionProgress.copies} Kopien · {collectionProgress.owned} Karten ·{" "}
                  {binderOptions.length} Binder
                </p>
              </div>

              <div className="inline-flex self-start rounded-[7px] border border-[rgba(255,255,255,0.1)] bg-[#080d14] p-1 sm:self-auto">
                {([
                  ["CARDS", "Karten", "grid"],
                  ["BINDERS", "Binder", "book"],
                ] as const).map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={collectionView === value}
                    onClick={() => {
                      setCollectionView(value);
                      window.localStorage.setItem("collection-workspace-view", value);
                    }}
                    className={classes(
                      "inline-flex min-h-[34px] items-center gap-2 rounded-[5px] px-3 text-[0.68rem] font-semibold uppercase tracking-[0.1em] transition",
                      collectionView === value
                        ? "bg-[rgba(207,91,66,0.2)] text-[#ffe3d4]"
                        : "text-[#9f8f7d] hover:text-[#ead9c6]",
                    )}
                  >
                    <AssetIcon name={icon} className="h-3.5 w-3.5 text-current" />
                    {label}
                  </button>
                ))}
              </div>

            </header>

            {feedbackMessage ? (
              <div className="mt-5 rounded-[16px] border border-[rgba(214,164,92,0.2)] bg-[rgba(150,97,33,0.12)] px-4 py-3 text-sm text-[#f6e0bc]">
                {feedbackMessage}
              </div>
            ) : null}

            {collectionView === "BINDERS" && creatorOpen ? (
              <Panel className="mt-6 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[#cb5c44]">
                    Neuer Binder
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreatorOpen(false)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#ecdcc7] transition hover:border-[rgba(255,255,255,0.18)]"
                  >
                    <AssetIcon name="window-close" className="h-4 w-4 text-current" />
                  </button>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(240px,340px)_minmax(0,1fr)_auto] xl:items-end">
                  <label className="block">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#9f8c77]">
                      Name
                    </span>
                    <input
                      value={draftBinderName}
                      onChange={(event) => setDraftBinderName(event.target.value)}
                      type="text"
                      aria-label="Bindername"
                      className="mt-2 w-full rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(5,7,10,0.52)] px-4 py-3 text-sm text-[#f2e5d1] outline-none"
                    />
                  </label>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#bca98f]">Eigene Designs</p>
                      <ImageCropUpload
                        kind="BINDER_COVER"
                        aspect={2 / 3}
                        label="Eigenes Cover"
                        onUploaded={(asset) => {
                          setPersonalCovers((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
                          setDraftCoverAssetId(asset.id);
                        }}
                      />
                    </div>
                    {personalCovers.length ? <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{personalCovers.map((asset) => <button key={asset.id} type="button" onClick={() => setDraftCoverAssetId(asset.id)} className={classes("rounded-xl border p-1", draftCoverAssetId === asset.id ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 bg-white/[.02]")}><BinderDesignPreview imageUrl={asset.imageUrl} alt={asset.name} custom className="w-full" /><span className="mt-1 block truncate text-[.65rem]">{asset.name}</span></button>)}</div> : <p className="mb-4 text-xs text-white/40">Noch kein eigenes Cover.</p>}
                  </div>
                  <p className="mb-2 text-xs font-semibold text-[#bca98f]">Standarddesigns</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {binderCoverCatalog.map((cover) => (
                      <button
                        key={cover.key}
                        type="button"
                        onClick={() => { setDraftCoverKey(cover.key); setDraftCoverAssetId(null); }}
                        className={classes(
                          "group rounded-[16px] border p-2 text-left transition",
                          draftCoverAssetId === null && draftCoverKey === cover.key
                            ? "border-[rgba(207,91,66,0.34)] bg-[rgba(255,255,255,0.05)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(207,91,66,0.18)]",
                        )}
                      >
                        <div className="relative mx-auto w-full max-w-[100px] [perspective:1200px]">
                          <div className="pointer-events-none absolute inset-x-[16%] bottom-1 h-6 rounded-full bg-[radial-gradient(circle,rgba(207,91,66,0.16),transparent_74%)] opacity-0 blur-xl transition duration-500 group-hover:opacity-100" />
                          <div className="relative aspect-[62/100] overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
                            <Image
                              src={cover.imageUrl}
                              alt={cover.name}
                              fill
                              sizes="100px"
                              className="pointer-events-none select-none object-cover object-center drop-shadow-[0_16px_26px_rgba(0,0,0,0.28)] [-webkit-user-drag:none]"
                            />
                            <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100">
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.24),transparent_34%)]" />
                              <div className="absolute inset-0 bg-[linear-gradient(125deg,transparent_18%,rgba(255,255,255,0.06)_38%,rgba(255,255,255,0.16)_48%,rgba(255,255,255,0.05)_56%,transparent_74%)]" />
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#f1deca]">
                          {cover.name}
                        </p>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateBinder}
                    disabled={!draftBinderName.trim() || busyAction !== null}
                    className="flex min-h-[52px] items-center justify-center gap-3 rounded-[4px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AssetIcon name="plus" className="h-4 w-4 text-current" />
                    Binder erstellen
                  </button>
                </div>
              </Panel>
            ) : null}

            {collectionView === "BINDERS" ? (
            <div className="mt-4 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-5">
                <section>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#d9c7b1]">
                      {binderOptions.length} Binder
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {binderOptions.map((binder) => (
                      <BinderShelfCard
                        key={binder.id}
                        binder={binder}
                        onSelect={handleActivateBinder}
                        onEdit={(binderId) =>
                          updateEditorRoute(binderId, {
                            pageIndex: 0,
                            slotIndex: null,
                          })
                        }
                        onDelete={setDeleteCandidate}
                      />
                    ))}
                    <AddBinderTile onClick={() => setCreatorOpen(true)} />
                  </div>
                  {binderOptions.length === 0 ? (
                    <div className="mt-4 rounded-[18px] border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] px-4 py-5 text-sm text-[#b9aa96]">
                      Noch kein Binder angelegt. Erstelle deinen ersten Binder über die
                      Plus-Kachel.
                    </div>
                  ) : null}
                </section>

                {activeBinder ? (
                  <ActiveBinderShowcase
                    binder={activeBinder}
                    pageIndex={activePreviewPageIndex}
                    onPageChange={setActivePreviewPageIndex}
                  />
                ) : null}
              </div>

              {activeBinder ? (
                <BinderDetailPanel
                  binder={activeBinder}
                  onEdit={(binderId) =>
                    updateEditorRoute(binderId, {
                      pageIndex: activePreviewPageIndex,
                      slotIndex: null,
                    })
                  }
                />
              ) : null}
            </div>
            ) : null}

            {collectionView === "CARDS" ? (
            <Panel className="mt-4 p-3 sm:p-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[0.7rem] uppercase tracking-[0.22em] text-[#cb5c44]">Kartensammlung</p>
                  <h2 className="font-display inscription-text-soft mt-1 text-2xl text-[#f5dfc0]">Alle Karten</h2>
                </div>
                <StatusPill tone="slate">{filteredCollectionCards.length} Karten</StatusPill>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.8fr)_230px]">
                <label className="flex items-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <AssetIcon name="search" className="h-4 w-4 text-[#b9a894]" />
                  <input value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Karten suchen" />
                </label>
                <CardCatalogFilterDrawer value={collectionFilters} onChange={setCollectionFilters} facets={collectionFacets} showOwnership={false} showBanlist={false} />
                <select
                  value={collectionSort}
                  onChange={(event) =>
                    setCollectionSort(event.target.value as typeof collectionSort)
                  }
                  className="ui-input"
                  aria-label="Sammlung sortieren"
                >
                  <option value="MOST_COPIES">{getCollectionSortLabel("MOST_COPIES")}</option>
                  <option value="NEWEST_ACQUIRED">{getCollectionSortLabel("NEWEST_ACQUIRED")}</option>
                  <option value="ALPHABETICAL">Name A–Z</option>
                  <option value="NAME_DESC">Name Z–A</option>
                  <option value="LEVEL_ASC">Stufe/Rang/Link aufsteigend</option>
                  <option value="LEVEL_DESC">Stufe/Rang/Link absteigend</option>
                  <option value="ATK_ASC">ATK aufsteigend</option>
                  <option value="ATK_DESC">ATK absteigend</option>
                  <option value="DEF_ASC">DEF aufsteigend</option>
                  <option value="DEF_DESC">DEF absteigend</option>
                  <option value="TYPE_ASC">Kartentyp</option>
                  <option value="ATTRIBUTE_ASC">Eigenschaft</option>
                  <option value="NEWEST_SET">Neueste Sets</option>
                  <option value="RARITY">{getCollectionSortLabel("RARITY")}</option>
                </select>
              </div>

              <div className="mt-4 grid max-h-[46rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                {filteredCollectionCards.map((card) => (
                  <article key={card.cardId} className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-2">
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() =>
                        setExpandedCardId((current) =>
                          current === card.cardId ? null : card.cardId,
                        )
                      }
                      aria-expanded={expandedCardId === card.cardId}
                    >
                    <div className="relative aspect-[59/86] overflow-hidden rounded-[6px] bg-[#080b10]">
                      {card.imageUrl ? <Image src={card.imageUrl} alt={card.name} fill sizes="160px" className="object-contain" unoptimized /> : null}
                      <span className="absolute bottom-1 right-1 rounded-[3px] bg-[rgba(4,6,10,0.82)] px-1.5 py-0.5 text-[0.58rem] font-bold">{card.totalCopies}x</span>
                    </div>
                    <p className="mt-2 truncate text-xs font-semibold text-[#f1deca]">{card.name}</p>
                    <p className="mt-1 truncate text-[0.58rem] uppercase tracking-[0.1em] text-[#9f8c77]">
                      {Array.from(
                        new Set(
                          card.printings
                            .map((printing) => printing.rarity)
                            .filter((rarity): rarity is string => Boolean(rarity)),
                        ),
                      ).join(" · ") || "Ohne Seltenheit"}
                    </p>
                    </button>
                    {expandedCardId === card.cardId ? (
                      <div className="mt-2 space-y-1.5 border-t border-[rgba(255,255,255,0.08)] pt-2">
                        <div className="grid grid-cols-2 gap-1">
                          <Link
                            href="/decks"
                            className="rounded-[4px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] px-2 py-1.5 text-center text-[0.56rem] font-semibold uppercase tracking-[0.08em] text-[#d7c6b1]"
                          >
                            Zum Deck
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleAddCardToWishlist(card.cardId, card.name)}
                            className="rounded-[4px] border border-[rgba(208,170,110,0.2)] bg-[rgba(208,170,110,0.08)] px-2 py-1.5 text-[0.56rem] font-semibold uppercase tracking-[0.08em] text-[#f0d9b0]"
                          >
                            Wunschliste
                          </button>
                          {activeBinder ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateEditorRoute(activeBinder.id, {
                                  pageIndex: activePreviewPageIndex,
                                  slotIndex: null,
                                })
                              }
                              className="col-span-2 rounded-[4px] border border-[rgba(88,163,169,0.2)] bg-[rgba(58,118,124,0.1)] px-2 py-1.5 text-[0.56rem] font-semibold uppercase tracking-[0.08em] text-[#bfe5e3]"
                            >
                              In Binder legen
                            </button>
                          ) : null}
                        </div>
                        {card.printings.map((printing) => (
                          <div
                            key={printing.key}
                            className="rounded-[5px] bg-[rgba(255,255,255,0.035)] px-2 py-1.5"
                          >
                            <p className="truncate text-[0.62rem] font-semibold text-[#e9d6bf]">
                              {printing.setLabel}
                            </p>
                            <p className="mt-0.5 text-[0.56rem] text-[#a9957b]">
                              {printing.setCode ?? "Ohne Setcode"} ·{" "}
                              {printing.rarity ?? "Ohne Seltenheit"} · {printing.copies}×
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </Panel>
            ) : null}
      </AppShell>

      {editorBinderId ? (
        <BinderCollectionEditor
          key={editorBinderId}
          binderId={editorBinderId}
          initialPageIndex={editorInitialPageIndex}
          initialSnapshot={initialEditorSnapshot}
          initialSlotIndex={editorInitialSlotIndex}
          isOpen
          onClose={() => void handleEditorClose()}
        />
      ) : null}

      {deleteCandidate ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(1,2,4,0.82)] px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busyAction) {
              setDeleteCandidate(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-binder-title"
            className="w-full max-w-[520px] rounded-[22px] border border-[rgba(207,79,54,0.32)] bg-[linear-gradient(180deg,#101319,#07090d)] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.62)]"
          >
            <p className="text-[0.68rem] uppercase tracking-[0.22em] text-[#df654d]">
              Binder endgültig löschen
            </p>
            <h2
              id="delete-binder-title"
              className="font-display inscription-text-soft mt-2 text-3xl text-[#f5dfc0]"
            >
              {deleteCandidate.name}
            </h2>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ["Seiten", deleteCandidate.pageCount],
                ["Belegte Plätze", getBinderFilledSlots(deleteCandidate)],
                ["Showcase", deleteCandidate.isShowcase ? "Ja" : "Nein"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] p-3"
                >
                  <p className="text-[0.58rem] uppercase tracking-[0.12em] text-[#9f8c77]">
                    {label}
                  </p>
                  <p className="mt-1 font-semibold text-[#f2dfc8]">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-[#cdb9a1]">
              Seiten und Platzierungen werden entfernt. Deine physischen Karten bleiben
              vollständig in der Sammlung. War dies dein letzter Binder, wird automatisch
              ein neuer leerer Standardbinder angelegt.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="ui-button-neutral"
                disabled={Boolean(busyAction)}
                onClick={() => setDeleteCandidate(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="ui-button-danger"
                disabled={Boolean(busyAction)}
                onClick={() => void handleDeleteBinder()}
              >
                {busyAction ? "Wird gelöscht …" : "Binder löschen"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
