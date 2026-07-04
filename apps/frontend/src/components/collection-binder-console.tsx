"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AssetIcon, type AssetIconName } from "@/components/asset-icon";
import { BinderCollectionEditor } from "@/components/binder-collection-editor";
import { BinderOpenSpread } from "@/components/binder-open-spread";
import { ConsoleBrand } from "@/components/console-brand";
import { consoleNavItems } from "@/components/console-nav-items";
import {
  ConsoleSidebarUtilityActions,
  ConsoleWindowChromeButton as WindowChromeButton,
} from "@/components/console-shell-primitives";
import { StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import { binderSlotCount } from "@/lib/binder-open-layout";
import { collectionClient } from "@/lib/collection-client";
import {
  binderCoverCatalog,
  type BinderCoverKey,
} from "@/lib/collection-showcase-config";
import type {
  CollectionBinderEditorSnapshot,
  CollectionBinderDto,
  CollectionPresetDto,
} from "@/lib/collection-showcase";

type CollectionBinderConsoleProps = {
  viewer: {
    displayName: string;
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
}: {
  binder: CollectionBinderDto;
  onSelect: (binderId: string) => void;
  onEdit: (binderId: string) => void;
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
          <div className="relative aspect-[62/100] overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] shadow-[0_22px_34px_rgba(0,0,0,0.28)] transition duration-500 ease-out [transform-style:preserve-3d] group-hover:[transform:rotateX(4deg)_rotateY(-7deg)_translateY(-4px)]">
            <Image
              src={binder.coverImageUrl}
              alt={binder.name}
              fill
              sizes="240px"
              loading={binder.isActive ? "eager" : undefined}
              draggable={false}
              className="pointer-events-none select-none object-cover object-center drop-shadow-[0_18px_30px_rgba(0,0,0,0.34)] transition duration-500 group-hover:scale-[1.03] [-webkit-user-drag:none]"
            />
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
      </div>
    </article>
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
        <div className="relative aspect-[62/100] overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.1)] bg-[#05070a] shadow-[0_28px_48px_rgba(0,0,0,0.42)]">
          <Image
            src={binder.coverImageUrl}
            alt={binder.name}
            fill
            sizes="260px"
            draggable={false}
            className="pointer-events-none select-none object-cover object-center [-webkit-user-drag:none]"
          />
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
            <BinderOpenSpread compact className="mx-auto max-w-[980px]" slots={activePage.slots} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function CollectionBinderConsole({
  binders,
  collectionProgress,
  initialEditorSnapshot = null,
}: CollectionBinderConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [binderOptions, setBinderOptions] = useState(binders);
  const [draftBinderName, setDraftBinderName] = useState("");
  const [draftCoverKey, setDraftCoverKey] = useState<BinderCoverKey>(binderCoverCatalog[0].key);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [activePreviewPageIndex, setActivePreviewPageIndex] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"binder" | null>(null);
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
  const activeBinder = binderOptions.find((binder) => binder.isActive) ?? binderOptions[0] ?? null;

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
        setCreatorOpen(false);
      });
      setFeedbackMessage(`Binder "${payload.binder.name}" wurde erstellt.`);
    } catch (error) {
      setFeedbackMessage(getApiErrorMessage(error, "Binder konnte nicht erstellt werden."));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />

      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <aside className="app-sidebar border-b border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,15,0.78),rgba(5,7,10,0.9))] shadow-[18px_0_46px_rgba(0,0,0,0.34)] backdrop-blur-[18px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[272px] lg:border-b-0 lg:border-r lg:border-r-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-0 lg:py-0">
            <div className="border-b border-[rgba(255,255,255,0.08)] lg:px-8 lg:pb-8 lg:pt-7">
              <ConsoleBrand size="lg" />
            </div>

            <nav className="hidden lg:block lg:pt-2">
              {consoleNavItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  iconName={item.iconName}
                  active={item.href === "/collection"}
                />
              ))}
            </nav>

            <ConsoleSidebarUtilityActions />
          </div>

          <div className="grid gap-2 border-t border-[rgba(255,255,255,0.08)] px-5 py-4 lg:hidden">
            {consoleNavItems.map((item) => (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                iconName={item.iconName}
                active={item.href === "/collection"}
              />
            ))}
          </div>
        </aside>

        <main className="min-w-0 lg:ml-[272px]">
          <div className="mx-auto w-full max-w-[1620px] px-5 pb-10 pt-4 sm:px-7 lg:px-8 xl:px-10">
            <div className="flex justify-end gap-3">
              <WindowChromeButton label="Minimieren" name="window-min" />
              <WindowChromeButton label="Fenster" name="window-max" />
              <WindowChromeButton label="Schließen" name="window-close" />
            </div>

            <header className="mt-8 grid gap-5 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1fr)] xl:items-end">
              <div>
                <p className="text-[0.8rem] uppercase tracking-[0.26em] text-[#cb5c44]">
                  Sammlung
                </p>
                <h1 className="font-display inscription-text mt-3 text-4xl leading-[0.92] tracking-[0.025em] sm:text-5xl xl:text-[3.9rem]">
                  Meine Binder
                </h1>
              </div>
              <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
                <div className="min-w-[150px] rounded-[10px] border border-[rgba(214,164,92,0.18)] bg-[rgba(8,10,14,0.72)] px-4 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.22)]">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[#9f8c77]">
                    Sammlung
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f2dfc8]">
                    {collectionProgress.copies} Karten
                  </p>
                </div>
                <div className="min-w-[150px] rounded-[10px] border border-[rgba(214,164,92,0.18)] bg-[rgba(8,10,14,0.72)] px-4 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.22)]">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[#9f8c77]">
                    Drucke
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f2dfc8]">
                    {collectionProgress.owned}
                  </p>
                </div>
                <StatusPill tone="slate">{binderOptions.length} Binder</StatusPill>
                <button
                  type="button"
                  onClick={() => setCreatorOpen(true)}
                  className="flex min-h-[42px] items-center gap-2 rounded-[4px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
                >
                  <AssetIcon name="plus" className="h-4 w-4 text-current" />
                  Neuer Binder
                </button>
              </div>
            </header>

            {feedbackMessage ? (
              <div className="mt-5 rounded-[16px] border border-[rgba(214,164,92,0.2)] bg-[rgba(150,97,33,0.12)] px-4 py-3 text-sm text-[#f6e0bc]">
                {feedbackMessage}
              </div>
            ) : null}

            {creatorOpen ? (
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

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {binderCoverCatalog.map((cover) => (
                      <button
                        key={cover.key}
                        type="button"
                        onClick={() => setDraftCoverKey(cover.key)}
                        className={classes(
                          "group rounded-[16px] border p-2 text-left transition",
                          draftCoverKey === cover.key
                            ? "border-[rgba(207,91,66,0.34)] bg-[rgba(255,255,255,0.05)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(207,91,66,0.18)]",
                        )}
                      >
                        <div className="relative mx-auto w-full max-w-[100px] [perspective:1200px]">
                          <div className="pointer-events-none absolute inset-x-[16%] bottom-1 h-6 rounded-full bg-[radial-gradient(circle,rgba(207,91,66,0.16),transparent_74%)] opacity-0 blur-xl transition duration-500 group-hover:opacity-100" />
                          <div className="relative aspect-[62/100] overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] transition duration-500 ease-out group-hover:[transform:rotateX(3deg)_rotateY(-6deg)_translateY(-2px)]">
                            <Image
                              src={cover.imageUrl}
                              alt={cover.name}
                              fill
                              sizes="120px"
                              draggable={false}
                              className="pointer-events-none select-none object-cover object-center drop-shadow-[0_16px_26px_rgba(0,0,0,0.28)] transition duration-500 group-hover:scale-[1.03] [-webkit-user-drag:none]"
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

            <div className="mt-7 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
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
                      />
                    ))}
                  </div>
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
          </div>
        </main>
      </div>

      {editorBinderId ? (
        <BinderCollectionEditor
          key={editorBinderId}
          binderId={editorBinderId}
          initialPageIndex={editorInitialPageIndex}
          initialSnapshot={initialEditorSnapshot}
          initialSlotIndex={editorInitialSlotIndex}
          isOpen
          onClose={() => updateEditorRoute(null)}
        />
      ) : null}
    </div>
  );
}
