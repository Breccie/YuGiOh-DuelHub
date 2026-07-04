"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import { consoleNavItems } from "@/components/console-nav-items";
import {
  ConsoleSidebarUtilityActions,
  ConsoleWindowChromeButton as WindowChromeButton,
} from "@/components/console-shell-primitives";
import { getApiErrorMessage } from "@/lib/api-client";
import { collectionClient } from "@/lib/collection-client";
import { BinderOpenSpread, type BinderEntryDragPayload } from "@/components/binder-open-spread";
import {
  binderCoverCatalog,
  type BinderCoverKey,
} from "@/lib/collection-showcase-config";
import type {
  BinderEditorInventoryCardDto,
  BinderEditorPrintingDto,
  CollectionBinderEditorSnapshot,
  CollectionBinderPageDto,
  CollectionBinderSlotDto,
} from "@/lib/collection-showcase";

type EditorKindFilter = "ALL" | "MONSTER" | "SPELL" | "TRAP" | "TOKEN";

type ActiveDragState = {
  clientX: number;
  clientY: number;
  payload: BinderEntryDragPayload;
};

type DragCandidateState = {
  startX: number;
  startY: number;
  payload: BinderEntryDragPayload;
};

type SlotContextMenuState = {
  slotIndex: number;
  x: number;
  y: number;
};

type BinderCollectionEditorProps = {
  binderId: string;
  initialPageIndex?: number;
  initialSnapshot?: CollectionBinderEditorSnapshot | null;
  initialSlotIndex?: number | null;
  isOpen: boolean;
  onClose: () => void;
  showDebugGuides?: boolean;
};

function classNames(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function EditorSidebarNavItem({
  href,
  label,
  active,
  iconName,
}: {
  href: string;
  label: string;
  active?: boolean;
  iconName: (typeof consoleNavItems)[number]["iconName"];
}) {
  return (
    <Link
      href={href}
      className={classNames(
        "group relative flex items-center gap-4 border-y border-transparent px-8 py-7 text-sm uppercase tracking-[0.2em] transition",
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

function formatGermanDateTime(value: string | null) {
  if (!value) {
    return "Noch nicht synchronisiert";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function getStatusLabel(slot: CollectionBinderSlotDto | null) {
  if (!slot) {
    return "Kein Slot";
  }

  if (slot.status === "missing") {
    return "Fehlend";
  }

  if (slot.status === "filled") {
    return "Belegt";
  }

  return "Leer";
}

function normalizeBinderCoverKey(coverKey: string | null | undefined): BinderCoverKey {
  const match = binderCoverCatalog.find((cover) => cover.key === coverKey);

  return match?.key ?? binderCoverCatalog[0].key;
}

function buildSlotSavePayload(slot: CollectionBinderSlotDto) {
  return {
    slotIndex: slot.slotIndex,
    collectionEntryId: slot.status === "filled" ? slot.collectionEntryId : null,
    entryReferenceId: slot.status !== "empty" ? slot.entryReferenceId : null,
    cardId: slot.status !== "empty" ? slot.cardId : null,
    cardName: slot.status !== "empty" ? slot.cardName : null,
    imageUrl: slot.status !== "empty" ? slot.imageUrl : null,
    printingLabel: slot.status !== "empty" ? slot.printingLabel : null,
    setCode: slot.status !== "empty" ? slot.setCode : null,
    rarity: slot.status !== "empty" ? slot.rarity : null,
  };
}

function findHoveredSlotIndex(clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY);
  const slotElement =
    target instanceof Element ? target.closest("[data-binder-slot-index]") : null;

  if (!slotElement) {
    return null;
  }

  const rawIndex = slotElement.getAttribute("data-binder-slot-index");
  const parsedIndex = rawIndex ? Number.parseInt(rawIndex, 10) : Number.NaN;

  return Number.isFinite(parsedIndex) ? parsedIndex : null;
}

function getFreeEntryId(
  printing: BinderEditorPrintingDto,
  usedEntryIds: Set<string>,
  activeSlotEntryId: string | null,
) {
  return (
    printing.selectableEntryIds.find((entryId) => {
      if (!usedEntryIds.has(entryId)) {
        return true;
      }

      return entryId === activeSlotEntryId;
    }) ??
    (activeSlotEntryId && printing.entryIds.includes(activeSlotEntryId)
      ? activeSlotEntryId
      : null)
  );
}

function getAvailableCopies(
  printing: BinderEditorPrintingDto,
  usedEntryIds: Set<string>,
  activeSlotEntryId: string | null,
) {
  const selectableCount = printing.selectableEntryIds.filter(
    (entryId) => !usedEntryIds.has(entryId) || entryId === activeSlotEntryId,
  ).length;

  if (activeSlotEntryId && printing.entryIds.includes(activeSlotEntryId)) {
    return Math.max(1, selectableCount);
  }

  return selectableCount;
}

function buildDragPayload(
  card: BinderEditorInventoryCardDto,
  printing: BinderEditorPrintingDto,
  collectionEntryId: string,
): BinderEntryDragPayload {
  return {
    cardId: card.cardId,
    cardName: card.name,
    collectionEntryId,
    entryReferenceId: collectionEntryId,
    imageUrl: card.imageUrl,
    printingLabel: printing.setLabel,
    rarity: printing.rarity,
    setCode: printing.setCode,
    kind: card.kind,
  };
}

export function BinderCollectionEditor({
  binderId,
  initialPageIndex = 0,
  initialSnapshot = null,
  initialSlotIndex = null,
  isOpen,
  onClose,
  showDebugGuides = false,
}: BinderCollectionEditorProps) {
  const initialPages = initialSnapshot?.binder.pages ?? [];
  const initialSelectedSlotIndex =
    initialSlotIndex ??
    initialPages[initialPageIndex]?.slots.find((slot) => slot.status !== "empty")?.slotIndex ??
    null;

  const [snapshot, setSnapshot] = useState<CollectionBinderEditorSnapshot | null>(initialSnapshot);
  const [pages, setPages] = useState<CollectionBinderPageDto[]>(initialPages);
  const [draftBinderName, setDraftBinderName] = useState(initialSnapshot?.binder.name ?? "");
  const [draftCoverKey, setDraftCoverKey] = useState<BinderCoverKey>(
    normalizeBinderCoverKey(initialSnapshot?.binder.coverKey),
  );
  const [activePageIndex, setActivePageIndex] = useState(
    initialPages[initialPageIndex] ? initialPageIndex : 0,
  );
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(initialSelectedSlotIndex);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryKind, setInventoryKind] = useState<EditorKindFilter>("ALL");
  const [isLoading, setIsLoading] = useState(isOpen && initialSnapshot === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initialSnapshot?.binder.updatedAt ?? null,
  );
  const [historyPast, setHistoryPast] = useState<CollectionBinderPageDto[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<CollectionBinderPageDto[][]>([]);
  const [dragCandidate, setDragCandidate] = useState<DragCandidateState | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const [hoverSlotIndex, setHoverSlotIndex] = useState<number | null>(null);
  const [stagedPayload, setStagedPayload] = useState<BinderEntryDragPayload | null>(null);
  const [slotContextMenu, setSlotContextMenu] = useState<SlotContextMenuState | null>(null);

  const saveSequenceRef = useRef(0);
  const activeDragRef = useRef<ActiveDragState | null>(null);
  const dragCandidateRef = useRef<DragCandidateState | null>(null);
  const suppressClickRef = useRef(false);
  const handleDropEntryRef = useRef<(slotIndex: number, payload: BinderEntryDragPayload) => void>(
    () => undefined,
  );

  useEffect(() => {
    activeDragRef.current = activeDrag;
  }, [activeDrag]);

  useEffect(() => {
    dragCandidateRef.current = dragCandidate;
  }, [dragCandidate]);

  useEffect(() => {
    if (!slotContextMenu) {
      return;
    }

    function closeMenu() {
      setSlotContextMenu(null);
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [slotContextMenu]);

  useEffect(() => {
    if (!isOpen || !binderId) {
      return;
    }

    let cancelled = false;

    async function loadSnapshot() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const typedPayload = await collectionClient.getBinderEditor(binderId);

        if (cancelled) {
          return;
        }

        setSnapshot(typedPayload);
        setPages(typedPayload.binder.pages);
        setDraftBinderName(typedPayload.binder.name);
        setDraftCoverKey(normalizeBinderCoverKey(typedPayload.binder.coverKey));
        const nextPageIndex = typedPayload.binder.pages[initialPageIndex] ? initialPageIndex : 0;
        setActivePageIndex(nextPageIndex);
        setSelectedSlotIndex(
          initialSlotIndex ??
            typedPayload.binder.pages[nextPageIndex]?.slots.find((slot) => slot.status !== "empty")
              ?.slotIndex ??
            null,
        );
        setHistoryPast([]);
        setHistoryFuture([]);
        setSaveStatus("idle");
        setSaveError(null);
        setLastSavedAt(typedPayload.binder.updatedAt);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(
          getApiErrorMessage(error, "Binder-Editor konnte nicht geladen werden."),
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [binderId, initialPageIndex, initialSlotIndex, initialSnapshot, isOpen]);

  useEffect(() => {
    if (!dragCandidate && !activeDrag) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = activeDrag ? "grabbing" : previousCursor;

    function handlePointerMove(event: PointerEvent) {
      const currentDrag = activeDragRef.current;

      if (currentDrag) {
        event.preventDefault();
        setActiveDrag({
          ...currentDrag,
          clientX: event.clientX,
          clientY: event.clientY,
        });
        setHoverSlotIndex(findHoveredSlotIndex(event.clientX, event.clientY));
        return;
      }

      const candidate = dragCandidateRef.current;

      if (!candidate) {
        return;
      }

      const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);

      if (distance < 8) {
        return;
      }

      event.preventDefault();
      suppressClickRef.current = true;
      setActiveDrag({
        payload: candidate.payload,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      setHoverSlotIndex(findHoveredSlotIndex(event.clientX, event.clientY));
    }

    function clearPointerState() {
      setActiveDrag(null);
      setDragCandidate(null);
      setHoverSlotIndex(null);
    }

    function finishPointer(event: PointerEvent) {
      const currentDrag = activeDragRef.current;
      const targetSlotIndex = findHoveredSlotIndex(event.clientX, event.clientY);

      if (currentDrag && targetSlotIndex !== null) {
        handleDropEntryRef.current(targetSlotIndex, currentDrag.payload);
      } else if (currentDrag) {
        setStagedPayload(currentDrag.payload);
      }

      clearPointerState();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", finishPointer);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", finishPointer);
    };
  }, [activeDrag, dragCandidate]);

  const activePage = pages[activePageIndex] ?? null;
  const selectedSlot = activePage?.slots.find((slot) => slot.slotIndex === selectedSlotIndex) ?? null;
  const contextSlot =
    activePage?.slots.find((slot) => slot.slotIndex === slotContextMenu?.slotIndex) ?? null;
  const activeSlotEntryId = selectedSlot?.collectionEntryId ?? null;
  const usedEntryIds = new Set(
    pages.flatMap((page) =>
      page.slots
        .map((slot) => slot.collectionEntryId)
        .filter((collectionEntryId): collectionEntryId is string => Boolean(collectionEntryId)),
    ),
  );

  const inventoryCards = (snapshot?.inventoryCards ?? [])
    .filter((card) => {
      if (inventoryKind !== "ALL" && card.kind !== inventoryKind) {
        return false;
      }

      if (!inventorySearch.trim()) {
        return true;
      }

      const normalizedSearch = inventorySearch.trim().toLowerCase();
      const printingText = card.printings.map((printing) => printing.setLabel).join(" ");

      return `${card.name} ${card.slug} ${printingText}`.toLowerCase().includes(normalizedSearch);
    })
    .sort((left, right) => {
      if (right.totalCopies !== left.totalCopies) {
        return right.totalCopies - left.totalCopies;
      }

      return left.name.localeCompare(right.name, "de");
    });

  async function persistPage(nextPages: CollectionBinderPageDto[], pageIndex: number) {
    const page = nextPages[pageIndex];

    if (!page) {
      return;
    }

    const requestId = saveSequenceRef.current + 1;
    saveSequenceRef.current = requestId;
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const payload = await collectionClient.saveBinderPage(binderId, page.id, {
          slots: page.slots.map(buildSlotSavePayload),
      });

      if (saveSequenceRef.current !== requestId) {
        return;
      }

      const savedPage = payload.page;

      setPages((current) =>
        current.map((candidate) => (candidate.id === savedPage.id ? savedPage : candidate)),
      );
      setSnapshot((current) =>
        current
          ? {
              ...current,
              binder: {
                ...current.binder,
                pages: current.binder.pages.map((candidate) =>
                  candidate.id === savedPage.id ? savedPage : candidate,
                ),
              },
            }
          : current,
      );
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
    } catch (error) {
      if (saveSequenceRef.current !== requestId) {
        return;
      }

      setSaveStatus("error");
      setSaveError(getApiErrorMessage(error, "Binder-Seite konnte nicht gespeichert werden."));
    }
  }

  async function handleSaveAll() {
    if (!activePage) {
      return;
    }

    const nextName = draftBinderName.trim();

    if (!nextName) {
      setSaveStatus("error");
      setSaveError("Bitte einen Binder-Namen angeben.");
      return;
    }

    const requestId = saveSequenceRef.current + 1;
    saveSequenceRef.current = requestId;
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const payload = await collectionClient.updateBinder(binderId, {
        name: nextName,
        coverKey: draftCoverKey,
      });

      if (saveSequenceRef.current !== requestId) {
        return;
      }

      setSnapshot((current) =>
        current
          ? {
              ...current,
              binder: {
                ...payload.binder,
                pages,
              },
            }
          : current,
      );
      setDraftBinderName(payload.binder.name);
      setDraftCoverKey(normalizeBinderCoverKey(payload.binder.coverKey));
      setLastSavedAt(new Date().toISOString());

      await persistPage(pages, activePageIndex);
    } catch (error) {
      if (saveSequenceRef.current !== requestId) {
        return;
      }

      setSaveStatus("error");
      setSaveError(getApiErrorMessage(error, "Binder konnte nicht gespeichert werden."));
    }
  }

  function applyPageMutation(
    mutate: (currentPage: CollectionBinderPageDto) => CollectionBinderPageDto,
    options?: { skipHistory?: boolean },
  ) {
    if (!activePage) {
      return;
    }

    const nextPages = pages.map((page, index) => (index === activePageIndex ? mutate(page) : page));

    if (!options?.skipHistory) {
      setHistoryPast((current) => [...current, pages]);
      setHistoryFuture([]);
    }

    setPages(nextPages);
    void persistPage(nextPages, activePageIndex);
  }

  function handleClearSlot(slotIndex: number) {
    setSlotContextMenu(null);
    applyPageMutation((currentPage) => ({
      ...currentPage,
      slots: currentPage.slots.map((slot) =>
        slot.slotIndex === slotIndex
          ? {
              ...slot,
              status: "empty",
              collectionEntryId: null,
              entryReferenceId: null,
              cardId: null,
              cardName: null,
              imageUrl: null,
              printingLabel: null,
              setCode: null,
              rarity: null,
              kind: null,
              lockState: null,
            }
          : slot,
      ),
    }));
  }

  function handleDropEntry(slotIndex: number, payload: BinderEntryDragPayload) {
    setSlotContextMenu(null);
    const currentSlot = activePage?.slots.find((slot) => slot.slotIndex === slotIndex) ?? null;

    if (
      usedEntryIds.has(payload.collectionEntryId) &&
      currentSlot?.collectionEntryId !== payload.collectionEntryId
    ) {
      setSaveStatus("error");
      setSaveError("Dieselbe Sammlungskopie darf innerhalb eines Binders nur einmal vorkommen.");
      return;
    }

    applyPageMutation((currentPage) => ({
      ...currentPage,
      slots: currentPage.slots.map((slot) =>
        slot.slotIndex === slotIndex
          ? {
              ...slot,
              status: "filled",
              collectionEntryId: payload.collectionEntryId,
              entryReferenceId: payload.entryReferenceId,
              cardId: payload.cardId,
              cardName: payload.cardName,
              imageUrl: payload.imageUrl,
              printingLabel: payload.printingLabel,
              setCode: payload.setCode,
              rarity: payload.rarity,
              kind: payload.kind,
              lockState: "AVAILABLE",
            }
          : slot,
      ),
    }));

    setSelectedSlotIndex(slotIndex);
    setStagedPayload(null);
  }

  useEffect(() => {
    handleDropEntryRef.current = handleDropEntry;
  });

  async function handleCreatePage() {
    setSaveError(null);

    try {
      const payload = await collectionClient.createBinderPage(binderId);
      const page = payload.page;
      const nextPageIndex = pages.length;

      setPages((current) => [...current, page]);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              binder: {
                ...current.binder,
                pageCount: current.binder.pageCount + 1,
                pages: [...current.binder.pages, page],
              },
            }
          : current,
      );
      setActivePageIndex(nextPageIndex);
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedSlotIndex(null);
      setSaveStatus("saved");
      setLastSavedAt(new Date().toISOString());
    } catch (error) {
      setSaveStatus("error");
      setSaveError(getApiErrorMessage(error, "Neue Binder-Seite konnte nicht erstellt werden."));
    }
  }

  function handleUndo() {
    const previous = historyPast.at(-1);

    if (!previous) {
      return;
    }

    setHistoryPast((current) => current.slice(0, -1));
    setHistoryFuture((current) => [pages, ...current]);
    setPages(previous);
    void persistPage(previous, activePageIndex);
  }

  function handleRedo() {
    const [next, ...rest] = historyFuture;

    if (!next) {
      return;
    }

    setHistoryFuture(rest);
    setHistoryPast((current) => [...current, pages]);
    setPages(next);
    void persistPage(next, activePageIndex);
  }

  function handleBeginDragCandidate(
    payload: BinderEntryDragPayload,
    clientX: number,
    clientY: number,
  ) {
    setDragCandidate({
      payload,
      startX: clientX,
      startY: clientY,
    });
  }

  const selectedSlotLabel =
    selectedSlot !== null ? `Slot ${selectedSlot.slotIndex + 1}` : "Kein Slot";
  const filledSlotCount = activePage?.slots.filter((slot) => slot.status === "filled").length ?? 0;
  const contextMenuLeft =
    slotContextMenu && typeof window !== "undefined"
      ? Math.min(slotContextMenu.x, window.innerWidth - 210)
      : (slotContextMenu?.x ?? 0);
  const contextMenuTop =
    slotContextMenu && typeof window !== "undefined"
      ? Math.min(slotContextMenu.y, window.innerHeight - 120)
      : (slotContextMenu?.y ?? 0);
  const compactSaveLabel =
    saveStatus === "saving"
      ? "Speichert..."
      : saveStatus === "error"
        ? "Sync-Fehler"
        : lastSavedAt
          ? `Gespeichert · ${formatGermanDateTime(lastSavedAt)}`
          : "Bereit";
  const inventoryTiles = inventoryCards.flatMap((card) =>
    card.printings.map((printing) => {
      const freeEntryId = getFreeEntryId(printing, usedEntryIds, activeSlotEntryId);
      const availableNow = getAvailableCopies(printing, usedEntryIds, activeSlotEntryId);
      const payload = freeEntryId ? buildDragPayload(card, printing, freeEntryId) : null;

      return {
        availableNow,
        card,
        disabled: !freeEntryId,
        isSelected:
          Boolean(payload) && stagedPayload?.collectionEntryId === payload?.collectionEntryId,
        key: `${card.cardId}-${printing.key}`,
        payload,
        printing,
      };
    }),
  );
  const inventoryCardCount = snapshot?.inventoryCards.length ?? 0;
  const totalOwnedCopies =
    snapshot?.inventoryCards.reduce((sum, card) => sum + card.totalCopies, 0) ?? 0;
  const totalBinderSlots = pages.length * 18;
  const totalFilledSlots = pages.reduce((sum, page) => sum + page.filledSlots, 0);

  return (
    <div
      className={classNames(
        "pointer-events-none fixed inset-0 z-[120] transition",
        isOpen ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={classNames(
          "app-shell pointer-events-auto absolute inset-0 overflow-hidden bg-[#04060a] text-[#f2e5d1]",
          !isOpen && "hidden",
        )}
      >
        <div className="app-background" />

        <aside className="hidden border-r border-r-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,15,0.82),rgba(5,7,10,0.94))] shadow-[18px_0_46px_rgba(0,0,0,0.34)] backdrop-blur-[18px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[272px] lg:flex-col">
          <div className="border-b border-[rgba(255,255,255,0.08)] px-8 pb-8 pt-7">
            <ConsoleBrand size="lg" />
          </div>

          <nav className="pt-2">
            {consoleNavItems.map((item) => (
              <EditorSidebarNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                iconName={item.iconName}
                active={item.href === "/collection"}
              />
            ))}
          </nav>

          <ConsoleSidebarUtilityActions />
        </aside>

        <main className="relative z-10 flex h-screen min-w-0 flex-col overflow-hidden lg:ml-[272px]">
          <div className="flex h-full min-h-0 flex-col px-5 pb-5 pt-4 sm:px-7 xl:px-8">
            <div className="flex justify-end gap-3">
              <WindowChromeButton label="Minimieren" name="window-min" />
              <WindowChromeButton label="Fenster" name="window-max" />
              <WindowChromeButton label="Schließen" name="window-close" />
            </div>

            <header className="mt-3 grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1fr)] xl:items-start">
              <div>
                <p className="text-[0.78rem] uppercase tracking-[0.26em] text-[#cb5c44]">
                  Sammlung
                </p>
                <h2 className="font-display inscription-text mt-2 text-4xl leading-[0.92] uppercase tracking-[0.025em] sm:text-[2.9rem] xl:text-[3.1rem]">
                  Binder-Editor
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#cbb79d]">
                  {snapshot?.binder.name ?? "Binder wird geladen"}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
                <div className="min-w-[148px] rounded-[10px] border border-[rgba(214,164,92,0.18)] bg-[rgba(8,10,14,0.72)] px-4 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.22)]">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[#9f8c77]">
                    Sammlung
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f2dfc8]">
                    {inventoryCardCount} / {totalOwnedCopies} Karten
                  </p>
                </div>
                <div className="min-w-[148px] rounded-[10px] border border-[rgba(214,164,92,0.18)] bg-[rgba(8,10,14,0.72)] px-4 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.22)]">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[#9f8c77]">
                    Binder
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f2dfc8]">
                    {totalFilledSlots} / {Math.max(18, totalBinderSlots)} Slots
                  </p>
                </div>
                <div className="min-w-[148px] rounded-[10px] border border-[rgba(214,164,92,0.18)] bg-[rgba(8,10,14,0.72)] px-4 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.22)]">
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[#9f8c77]">
                    Seite
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f2dfc8]">
                    {activePageIndex + 1} / {Math.max(1, pages.length)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] rounded-[4px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveAll();
                  }}
                  disabled={!activePage || saveStatus === "saving"}
                  className="flex min-h-[42px] items-center gap-2 rounded-[4px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff0e1] shadow-[0_0_26px_rgba(151,29,20,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Speichern
                  <AssetIcon name="edit" className="h-4 w-4 text-current" />
                </button>
              </div>
            </header>

            <section className="mt-4 grid gap-4 border-b border-[rgba(255,255,255,0.08)] pb-4 xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] xl:items-end">
              <label className="block">
                <span className="flex items-center justify-between gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#cb5c44]">
                  Titel
                  <span className="text-[#9f8c77]">{draftBinderName.length} / 40</span>
                </span>
                <input
                  value={draftBinderName}
                  onChange={(event) => setDraftBinderName(event.target.value.slice(0, 40))}
                  type="text"
                  className="mt-2 h-10 w-full rounded-[4px] border border-[rgba(214,164,92,0.16)] bg-[rgba(5,7,10,0.5)] px-4 text-sm text-[#f2e5d1] outline-none transition focus:border-[rgba(214,164,92,0.34)]"
                />
              </label>

              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#cb5c44]">
                  Cover
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {binderCoverCatalog.map((cover) => (
                    <button
                      key={cover.key}
                      type="button"
                      onClick={() => setDraftCoverKey(cover.key)}
                      className={classNames(
                        "relative h-[72px] w-[52px] overflow-hidden rounded-[5px] border bg-[rgba(255,255,255,0.03)] transition",
                        draftCoverKey === cover.key
                          ? "border-[#d05239] shadow-[0_0_0_1px_rgba(208,82,57,0.32),0_0_22px_rgba(208,82,57,0.24)]"
                          : "border-[rgba(255,255,255,0.1)] hover:border-[rgba(214,164,92,0.28)]",
                      )}
                      aria-label={`${cover.name} als Binder-Cover wählen`}
                    >
                      <Image
                        src={cover.imageUrl}
                        alt={cover.name}
                        fill
                        sizes="52px"
                        draggable={false}
                        className="pointer-events-none select-none object-cover object-center [-webkit-user-drag:none]"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div className="mt-4 min-h-0 flex-1 overflow-visible">
          {isLoading ? (
            <div className="mx-auto mt-24 max-w-md rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(6,9,14,0.8)] px-6 py-5 text-sm text-[#d7c7b3]">
              Binder-Editor wird geladen...
            </div>
          ) : loadError ? (
            <div className="mx-auto mt-24 max-w-md rounded-[22px] border border-[rgba(214,100,74,0.2)] bg-[rgba(90,26,17,0.38)] px-6 py-5 text-sm text-[#ffd6c8]">
              {loadError}
            </div>
          ) : activePage ? (
            <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1.48fr)_minmax(340px,0.58fr)]">
              <aside className="order-1 flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,16,0.86)] shadow-[0_22px_54px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.22em] text-[#cb5c44]">
                      Binder
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#f2e1cd]">
                      {selectedSlotLabel} · {getStatusLabel(selectedSlot)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {pages.map((page, index) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => {
                          setActivePageIndex(index);
                          setSelectedSlotIndex(null);
                        }}
                        className={classNames(
                          "min-h-[34px] rounded-[4px] border px-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] transition",
                          activePageIndex === index
                            ? "border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.86),rgba(95,14,9,0.9))] text-[#fff0e1] shadow-[0_0_22px_rgba(151,29,20,0.18)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d] hover:border-[rgba(207,91,66,0.18)]",
                        )}
                      >
                        Seite {index + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleCreatePage}
                      className="grid h-[34px] w-[34px] place-items-center rounded-[4px] border border-[rgba(214,164,92,0.22)] bg-[rgba(150,97,33,0.14)] text-[#ffe3bd] transition hover:border-[rgba(214,164,92,0.34)]"
                      aria-label="Seite hinzufügen"
                    >
                      <AssetIcon name="plus" className="h-4 w-4 text-current" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#d5c4af]">
                      {filledSlotCount}/18
                    </span>
                    <span
                      className={classNames(
                        "text-xs",
                        saveStatus === "error"
                          ? "text-[#ffd6c8]"
                          : saveStatus === "saving"
                            ? "text-[#ffe2b8]"
                            : "text-[#bfae9a]",
                      )}
                    >
                      {compactSaveLabel}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={historyPast.length === 0}
                      className="grid h-9 w-9 place-items-center rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#ecdcc7] transition hover:border-[rgba(207,91,66,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Rückgängig"
                    >
                      <AssetIcon name="chevron-left" className="h-4 w-4 text-current" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={historyFuture.length === 0}
                      className="grid h-9 w-9 place-items-center rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#ecdcc7] transition hover:border-[rgba(207,91,66,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Wiederholen"
                    >
                      <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                    </button>
                    {stagedPayload && selectedSlot ? (
                      <button
                        type="button"
                        onClick={() => handleDropEntry(selectedSlot.slotIndex, stagedPayload)}
                        className="flex min-h-[36px] items-center gap-2 rounded-[4px] border border-[rgba(214,164,92,0.28)] bg-[rgba(150,97,33,0.16)] px-3 text-sm font-semibold text-[#ffe3bd] transition hover:border-[rgba(214,164,92,0.42)]"
                      >
                        <AssetIcon name="plus" className="h-4 w-4 text-current" />
                        Ablegen
                      </button>
                    ) : null}
                    {selectedSlot && selectedSlot.status !== "empty" ? (
                      <button
                        type="button"
                        onClick={() => handleClearSlot(selectedSlot.slotIndex)}
                        className="flex min-h-[36px] items-center gap-2 rounded-[4px] border border-[rgba(214,100,74,0.22)] bg-[rgba(90,26,17,0.3)] px-3 text-sm font-semibold text-[#ffd6c8] transition hover:border-[rgba(214,100,74,0.34)]"
                      >
                        <AssetIcon name="window-close" className="h-4 w-4 text-current" />
                        Leeren
                      </button>
                    ) : null}
                  </div>
                </div>

                {saveError ? (
                  <div className="mx-4 mt-3 rounded-[14px] border border-[rgba(214,100,74,0.2)] bg-[rgba(90,26,17,0.38)] px-3 py-2 text-sm text-[#ffd6c8]">
                    {saveError}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
                  <BinderOpenSpread
                    compact
                    editable
                    className="mx-auto w-full max-w-full"
                    dragPreviewActive={Boolean(activeDrag || stagedPayload)}
                    hoverSlotIndex={hoverSlotIndex}
                    slots={activePage.slots}
                    selectedSlotIndex={selectedSlotIndex}
                    showDebugGuides={showDebugGuides}
                    onSelectSlot={(slotIndex) => {
                      setSlotContextMenu(null);
                      if (stagedPayload) {
                        handleDropEntry(slotIndex, stagedPayload);
                        return;
                      }

                      setSelectedSlotIndex(slotIndex);
                    }}
                    onSlotContextMenu={(slotIndex, event) => {
                      setSelectedSlotIndex(slotIndex);
                      setSlotContextMenu({
                        slotIndex,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  />
                </div>
              </aside>

              <section className="order-2 flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(12,16,23,0.9),rgba(6,8,12,0.95))] shadow-[0_30px_70px_rgba(0,0,0,0.34)] xl:-mt-[92px] xl:h-[calc(100%+92px)]">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.24em] text-[#cb5c44]">
                      Sammlung
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#d5c4af]">
                      {inventoryTiles.length} Drucke
                    </span>
                  </div>
                </div>

                <>
                    <div className="space-y-3 border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
                      {stagedPayload ? (
                        <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(214,164,92,0.24)] bg-[rgba(150,97,33,0.14)] px-4 py-3 text-sm text-[#f2dec1]">
                          <span className="truncate font-semibold text-[#ffe5bf]">
                            {stagedPayload.cardName}
                          </span>
                          <button
                            type="button"
                            onClick={() => setStagedPayload(null)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[#f1ddc4] transition hover:border-[rgba(255,255,255,0.22)]"
                          >
                            <AssetIcon name="window-close" className="h-3.5 w-3.5 text-current" />
                          </button>
                        </div>
                      ) : null}

                      <div className="grid gap-3">
                        <label className="flex items-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                          <AssetIcon name="search" className="h-4 w-4 text-[#b9a894]" />
                          <input
                            value={inventorySearch}
                            onChange={(event) => setInventorySearch(event.target.value)}
                            type="text"
                            aria-label="Sammlung durchsuchen"
                            className="w-full bg-transparent text-sm text-[#f2e5d1] outline-none"
                          />
                        </label>

                        <div className="flex flex-wrap gap-2">
                          {(["ALL", "MONSTER", "SPELL", "TRAP", "TOKEN"] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setInventoryKind(kind)}
                              className={classNames(
                                "rounded-[6px] border px-3 py-2 text-xs font-semibold transition",
                                inventoryKind === kind
                                  ? "border-[rgba(207,91,66,0.28)] bg-[rgba(207,91,66,0.14)] text-[#ffe3ca]"
                                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d] hover:border-[rgba(207,91,66,0.18)]",
                              )}
                            >
                              {kind === "ALL"
                                ? "Alle"
                                : kind === "MONSTER"
                                  ? "Monster"
                                  : kind === "SPELL"
                                    ? "Zauber"
                                    : kind === "TRAP"
                                      ? "Falle"
                                      : "Token"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                      {inventoryTiles.length === 0 ? (
                        <div className="rounded-[22px] border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.03)] px-5 py-8 text-sm text-[#d3c3af]">
                          Keine Treffer.
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 min-[1380px]:grid-cols-4">
                          {inventoryTiles.map((tile) => (
                            <button
                              key={tile.key}
                              type="button"
                              disabled={tile.disabled}
                              onClick={() => {
                                if (suppressClickRef.current) {
                                  suppressClickRef.current = false;
                                  return;
                                }

                                if (tile.payload) {
                                  setStagedPayload(tile.payload);
                                }
                              }}
                              onDragStart={(event) => event.preventDefault()}
                              onPointerDown={(event) => {
                                if (!tile.payload) {
                                  return;
                                }

                                event.preventDefault();
                                handleBeginDragCandidate(
                                  tile.payload,
                                  event.clientX,
                                  event.clientY,
                                );
                              }}
                              className={classNames(
                                "group rounded-[10px] border bg-[rgba(255,255,255,0.035)] p-1.5 text-left transition select-none touch-none",
                                tile.disabled
                                  ? "cursor-not-allowed border-[rgba(255,255,255,0.05)] opacity-55"
                                  : tile.isSelected
                                    ? "cursor-grab border-[rgba(214,164,92,0.48)] bg-[rgba(150,97,33,0.18)] shadow-[0_0_0_1px_rgba(214,164,92,0.12),0_0_22px_rgba(151,29,20,0.16)] active:cursor-grabbing"
                                    : "cursor-grab border-[rgba(255,255,255,0.08)] hover:border-[rgba(207,91,66,0.22)] active:cursor-grabbing",
                                )}
                            >
                              <div className="pointer-events-none relative aspect-[59/86] overflow-hidden rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                                {tile.card.imageUrl ? (
                                  <Image
                                    src={tile.card.imageUrl}
                                    alt={tile.card.name}
                                    fill
                                    sizes="86px"
                                    unoptimized
                                    draggable={false}
                                    className="pointer-events-none select-none object-contain object-center transition duration-200 group-hover:scale-[1.02] [-webkit-user-drag:none]"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-2 text-center text-[0.68rem] font-semibold text-[#eadbc7]">
                                    {tile.card.name}
                                  </div>
                                )}
                                <span className="absolute right-1 top-1 rounded-[3px] border border-[rgba(0,0,0,0.28)] bg-[rgba(123,72,23,0.86)] px-1 py-0.5 text-[0.48rem] font-bold uppercase tracking-[0.06em] text-[#ffe0a8]">
                                  {tile.printing.rarity ?? "N"}
                                </span>
                                <span className="absolute bottom-1 right-1 rounded-[3px] bg-[rgba(4,6,10,0.78)] px-1 py-0.5 text-[0.54rem] font-bold text-[#f5e1c8]">
                                  {tile.availableNow}x
                                </span>
                              </div>
                              <p className="pointer-events-none mt-1.5 line-clamp-1 text-[0.62rem] font-semibold leading-4 text-[#f1deca]">
                                {tile.card.name}
                              </p>
                              <p className="pointer-events-none mt-0.5 truncate text-[0.52rem] uppercase tracking-[0.1em] text-[#9f8c77]">
                                {tile.printing.setCode ?? tile.printing.setLabel}
                              </p>
                              {tile.printing.reservedCopies > 0 ? (
                                <p className="pointer-events-none mt-0.5 truncate text-[0.5rem] uppercase tracking-[0.1em] text-[#d6a45c]">
                                  Reserviert
                                </p>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                </>
              </section>
            </div>
          ) : null}
            </div>
          </div>
        </main>
        </div>

      {slotContextMenu ? (
        <div
          className="pointer-events-auto fixed z-[170] min-w-[190px] overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.12)] bg-[rgba(8,11,16,0.96)] py-2 shadow-[0_22px_50px_rgba(0,0,0,0.48)] backdrop-blur-xl"
          style={{
            left: contextMenuLeft,
            top: contextMenuTop,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedSlotIndex(slotContextMenu.slotIndex);
              setSlotContextMenu(null);
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#f2dfc8] transition hover:bg-[rgba(255,255,255,0.06)]"
          >
            <AssetIcon name="nav-collection" className="h-4 w-4 text-[#d6a45c]" />
            Ersetzen
          </button>
          <button
            type="button"
            disabled={!contextSlot || contextSlot.status === "empty"}
            onClick={() => handleClearSlot(slotContextMenu.slotIndex)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-[#ffd6c8] transition hover:bg-[rgba(214,100,74,0.1)] disabled:cursor-not-allowed disabled:text-[#77685b]"
          >
            <AssetIcon name="window-close" className="h-4 w-4 text-current" />
            Slot leeren
          </button>
        </div>
      ) : null}

      {activeDrag ? (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[160]"
          style={{
            transform: `translate(${activeDrag.clientX - 44}px, ${activeDrag.clientY - 58}px)`,
          }}
        >
          <div className="pointer-events-none flex min-w-[210px] items-center gap-3 rounded-[18px] border border-[rgba(255,255,255,0.12)] bg-[rgba(6,9,14,0.94)] px-3 py-3 shadow-[0_20px_44px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <div className="relative aspect-[59/86] w-[58px] shrink-0 overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)]">
              {activeDrag.payload.imageUrl ? (
                <Image
                  src={activeDrag.payload.imageUrl}
                  alt={activeDrag.payload.cardName}
                  fill
                  sizes="58px"
                  unoptimized
                  draggable={false}
                  className="object-contain object-center"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-[#f4e4cf]">
                {activeDrag.payload.cardName}
              </p>
              <p className="mt-1 truncate text-[0.68rem] uppercase tracking-[0.14em] text-[#b19b83]">
                {activeDrag.payload.printingLabel ??
                  activeDrag.payload.setCode ??
                  "Druckversion"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
