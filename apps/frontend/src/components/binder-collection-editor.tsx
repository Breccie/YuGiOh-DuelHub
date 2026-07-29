"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type {
  CardCatalogItem,
  CardCatalogSort,
  CardOwnershipFilter,
} from "@ygo/contracts";
import { AppSidebar } from "@/components/app-sidebar";
import { AssetIcon } from "@/components/asset-icon";
import { ConsoleWindowChromeButton as WindowChromeButton } from "@/components/console-shell-primitives";
import { getApiErrorMessage } from "@/lib/api-client";
import { collectionClient } from "@/lib/collection-client";
import { BinderOpenSpread, type BinderEntryDragPayload } from "@/components/binder-open-spread";
import {
  binderCoverCatalog,
  getCollectionSortLabel,
  type BinderCoverKey,
  type CollectionSortModeValue,
} from "@/lib/collection-showcase-config";
import type {
  BinderEditorInventoryCardDto,
  BinderEditorPrintingDto,
  CollectionBinderEditorSnapshot,
  CollectionBinderPageDto,
  CollectionBinderSlotDto,
} from "@/lib/collection-showcase";
import { cardCatalogClient } from "@/lib/card-catalog-client";
import { wishlistClient } from "@/lib/wishlist-client";

type EditorKindFilter = "ALL" | "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
type EditorRarityFilter = "ALL" | string;

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

type InventoryTile = {
  availableNow: number;
  card: CardCatalogItem;
  disabled: boolean;
  isSelected: boolean;
  key: string;
  payload: BinderEntryDragPayload | null;
  printing: BinderEditorPrintingDto | null;
  printingCount: number;
};

function mapCollectionSortToCatalogSort(
  sort: CollectionSortModeValue,
): CardCatalogSort {
  if (sort === "MOST_COPIES") return "OWNED_DESC";
  if (sort === "NEWEST_ACQUIRED") return "NEWEST_SET";
  return "NAME_ASC";
}

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
) {
  return printing.selectableEntryIds.find((entryId) => !usedEntryIds.has(entryId)) ?? null;
}

function getAvailableCopies(
  printing: BinderEditorPrintingDto,
  usedEntryIds: Set<string>,
) {
  return printing.selectableEntryIds.filter((entryId) => !usedEntryIds.has(entryId)).length;
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
  const [inventoryRarity, setInventoryRarity] = useState<EditorRarityFilter>("ALL");
  const [inventorySort, setInventorySort] =
    useState<CollectionSortModeValue>("MOST_COPIES");
  const [selectedPrintingByCardId, setSelectedPrintingByCardId] =
    useState<Record<string, string>>({});
  const [ownershipFilter, setOwnershipFilter] = useState<CardOwnershipFilter>("ALL");
  const [catalogCards, setCatalogCards] = useState<CardCatalogItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedCatalogCard, setSelectedCatalogCard] = useState<CardCatalogItem | null>(null);
  const [wishlistFeedback, setWishlistFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isOpen && initialSnapshot === null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);

  useEffect(() => {
    const savedSort = window.localStorage.getItem("binder-editor-sort-mode");
    const frameId = window.requestAnimationFrame(() => {
      if (
        savedSort === "MOST_COPIES" ||
        savedSort === "NEWEST_ACQUIRED" ||
        savedSort === "ALPHABETICAL" ||
        savedSort === "RARITY"
      ) {
        setInventorySort(savedSort);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("binder-editor-sort-mode", inventorySort);
  }, [inventorySort]);
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
  const [closeWarning, setCloseWarning] = useState<string | null>(null);

  const saveSequenceRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const metadataSavePromiseRef = useRef<Promise<void> | null>(null);
  const metadataDirtyRef = useRef(false);
  const metadataEditRevisionRef = useRef(0);
  const failedSaveTargetsRef = useRef(new Set<string>());
  const latestSaveRequestByPageRef = useRef(new Map<string, number>());
  const pagesRef = useRef(pages);
  const activeDragRef = useRef<ActiveDragState | null>(null);
  const dragCandidateRef = useRef<DragCandidateState | null>(null);
  const suppressClickRef = useRef(false);
  const handleDropEntryRef = useRef<(slotIndex: number, payload: BinderEntryDragPayload) => void>(
    () => undefined,
  );
  const handleCloseEditorRef = useRef<() => void>(() => undefined);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeDragRef.current = activeDrag;
  }, [activeDrag]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

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

    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleMenuKeyDown);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [slotContextMenu]);

  useEffect(() => {
    if (!slotContextMenu) {
      return;
    }

    contextMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [slotContextMenu]);

  useEffect(() => {
    if (!isOpen || !binderId) {
      return;
    }

    let cancelled = false;

    async function loadSnapshot() {
      setIsLoading(true);
      setSnapshotError(null);

      try {
        let typedPayload = await collectionClient.getBinderEditor(binderId);

        if (typedPayload.binder.pages.length === 0) {
          await collectionClient.createBinderPage(binderId);
          typedPayload = await collectionClient.getBinderEditor(binderId);
        }

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
        setCloseWarning(null);
        metadataDirtyRef.current = false;
        metadataEditRevisionRef.current = 0;
        metadataSavePromiseRef.current = null;
        failedSaveTargetsRef.current.clear();
        latestSaveRequestByPageRef.current.clear();
        setLastSavedAt(typedPayload.binder.updatedAt);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSnapshotError(
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
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setCatalogLoading(true);
      void cardCatalogClient
        .search({
          q: inventorySearch.trim() || undefined,
          ownership: ownershipFilter,
          kind: inventoryKind === "ALL" ? undefined : inventoryKind,
          rarity: inventoryRarity === "ALL" ? undefined : inventoryRarity,
          sort: mapCollectionSortToCatalogSort(inventorySort),
          limit: 60,
        })
        .then((payload) => {
          if (cancelled) return;
          setCatalogError(null);
          setCatalogCards(payload.items);
          setCatalogTotal(payload.total);
          setCatalogCursor(payload.nextCursor);
          setSelectedCatalogCard((current) =>
            current ? payload.items.find((card) => card.cardId === current.cardId) ?? current : null,
          );
        })
        .catch((error) => {
          if (!cancelled) {
            setCatalogError(getApiErrorMessage(error, "Kartenkatalog konnte nicht geladen werden."));
          }
        })
        .finally(() => {
          if (!cancelled) setCatalogLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    catalogRevision,
    inventoryKind,
    inventoryRarity,
    inventorySearch,
    inventorySort,
    isOpen,
    ownershipFilter,
  ]);

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
  const usedEntryIds = new Set(
    pages.flatMap((page) =>
      page.slots
        .map((slot) => slot.collectionEntryId)
        .filter((collectionEntryId): collectionEntryId is string => Boolean(collectionEntryId)),
    ),
  );

  const inventoryByCardId = new Map(
    (snapshot?.inventoryCards ?? []).map((card) => [card.cardId, card]),
  );

  const inventoryRarities = Array.from(
    new Set(
      [
        ...(snapshot?.inventoryCards ?? []).flatMap((card) =>
          card.printings
            .map((printing) => printing.rarity)
            .filter((rarity): rarity is string => Boolean(rarity)),
        ),
        ...catalogCards.flatMap((card) => card.rarities),
      ],
    ),
  ).sort((left, right) => left.localeCompare(right, "de"));

  async function persistPage(nextPages: CollectionBinderPageDto[], pageIndex: number) {
    const page = nextPages[pageIndex];

    if (!page) {
      return false;
    }

    const requestId = saveSequenceRef.current + 1;
    saveSequenceRef.current = requestId;
    latestSaveRequestByPageRef.current.set(page.id, requestId);
    pendingSaveCountRef.current += 1;
    setSaveStatus("saving");
    if (failedSaveTargetsRef.current.size === 0) {
      setSaveError(null);
    }
    setCloseWarning(null);

    const saveOperation = saveQueueRef.current
      .catch(() => undefined)
      .then(() => collectionClient.saveBinderPage(binderId, page.id, {
          slots: page.slots.map(buildSlotSavePayload),
      }));
    saveQueueRef.current = saveOperation.then(() => undefined, () => undefined);

    try {
      const payload = await saveOperation;
      const savedPage = payload.page;
      failedSaveTargetsRef.current.delete(page.id);

      if (latestSaveRequestByPageRef.current.get(page.id) === requestId) {
        const nextPages = pagesRef.current.map((candidate) =>
          candidate.id === savedPage.id ? savedPage : candidate,
        );
        pagesRef.current = nextPages;
        setPages(nextPages);
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
      }

      setLastSavedAt(new Date().toISOString());
      return true;
    } catch (error) {
      const message = getApiErrorMessage(error, "Binder-Seite konnte nicht gespeichert werden.");
      failedSaveTargetsRef.current.add(page.id);
      setSaveError(`Seite ${pageIndex + 1}: ${message}`);
      return false;
    } finally {
      pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);

      if (pendingSaveCountRef.current > 0) {
        setSaveStatus("saving");
      } else if (failedSaveTargetsRef.current.size > 0) {
        setSaveStatus("error");
        setSaveError((current) => current ?? "Mindestens eine Binder-Seite konnte nicht gespeichert werden.");
      } else {
        setSaveStatus("saved");
        setSaveError(null);
      }
    }
  }

  async function handleCloseEditor() {
    if (metadataSavePromiseRef.current) {
      await metadataSavePromiseRef.current;
    }

    if (pendingSaveCountRef.current > 0) {
      await saveQueueRef.current;
    }

    if (metadataDirtyRef.current || failedSaveTargetsRef.current.size > 0) {
      setCloseWarning(
        metadataDirtyRef.current
          ? "Bindername oder Cover wurden noch nicht gespeichert. Speichere die Änderungen oder verwirf sie ausdrücklich."
          : "Mindestens eine Änderung wurde nicht gespeichert. Speichere erneut oder verwirf die lokalen Änderungen ausdrücklich.",
      );
      return;
    }

    onClose();
  }

  async function handleSaveAll() {
    if (!activePage) {
      return;
    }

    const nextName = draftBinderName.trim();

    if (!nextName) {
      failedSaveTargetsRef.current.add(`binder:${binderId}`);
      setSaveStatus("error");
      setSaveError("Bitte einen Binder-Namen angeben.");
      return;
    }

    setSaveStatus("saving");
    if (failedSaveTargetsRef.current.size === 0) {
      setSaveError(null);
    }
    setCloseWarning(null);
    const metadataRevision = metadataEditRevisionRef.current;

    const metadataSaveOperation = (async () => {
      try {
        const payload = await collectionClient.updateBinder(binderId, {
          name: nextName,
          coverKey: draftCoverKey,
        });

        failedSaveTargetsRef.current.delete(`binder:${binderId}`);
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
        if (metadataEditRevisionRef.current === metadataRevision) {
          metadataDirtyRef.current = false;
          setDraftBinderName(payload.binder.name);
          setDraftCoverKey(normalizeBinderCoverKey(payload.binder.coverKey));
        }
        setLastSavedAt(new Date().toISOString());
        return true;
      } catch (error) {
        failedSaveTargetsRef.current.add(`binder:${binderId}`);
        setSaveStatus("error");
        setSaveError(getApiErrorMessage(error, "Binder konnte nicht gespeichert werden."));
        return false;
      }
    })();
    const trackedMetadataSave = metadataSaveOperation.then(() => undefined);
    metadataSavePromiseRef.current = trackedMetadataSave;
    const metadataSaved = await metadataSaveOperation;

    if (metadataSavePromiseRef.current === trackedMetadataSave) {
      metadataSavePromiseRef.current = null;
    }

    if (metadataSaved) {
      await persistPage(pages, activePageIndex);
      if (metadataDirtyRef.current && failedSaveTargetsRef.current.size === 0) {
        setSaveStatus("idle");
      }
    }
  }

  async function handleRetryFailedSaves() {
    setCloseWarning(null);
    const failedTargets = new Set(failedSaveTargetsRef.current);

    if (metadataDirtyRef.current || failedTargets.has(`binder:${binderId}`)) {
      await handleSaveAll();
    }

    for (const [pageIndex, page] of pages.entries()) {
      if (failedTargets.has(page.id)) {
        await persistPage(pages, pageIndex);
      }
    }
  }

  function applyPageMutation(
    mutate: (currentPage: CollectionBinderPageDto) => CollectionBinderPageDto,
    options?: { skipHistory?: boolean },
  ) {
    if (!activePage) {
      return;
    }

    const currentPages = pagesRef.current;
    const nextPages = currentPages.map((page, index) =>
      index === activePageIndex ? mutate(page) : page,
    );

    if (!options?.skipHistory) {
      setHistoryPast((current) => [...current, currentPages]);
      setHistoryFuture([]);
    }

    pagesRef.current = nextPages;
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

  useEffect(() => {
    handleCloseEditorRef.current = () => {
      void handleCloseEditor();
    };
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (contextMenuRef.current) {
          return;
        }

        event.preventDefault();
        handleCloseEditorRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusableElements[0];
      const last = focusableElements.at(-1);

      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen]);

  function handleSelectPage(pageIndex: number) {
    if (pageIndex === activePageIndex) {
      return;
    }

    setActivePageIndex(pageIndex);
    setSelectedSlotIndex(null);
    setSlotContextMenu(null);
    setHistoryPast([]);
    setHistoryFuture([]);
  }

  async function handleCreatePage() {
    if (failedSaveTargetsRef.current.size === 0) {
      setSaveError(null);
    }

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
      setSaveStatus(failedSaveTargetsRef.current.size > 0 ? "error" : "saved");
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

  async function handleAddSelectedCardToWishlist() {
    if (!selectedCatalogCard) return;

    setWishlistFeedback(null);
    try {
      await wishlistClient.upsert({
        cardId: selectedCatalogCard.cardId,
        desiredQuantity: 1,
        priority: "NORMAL",
        note: `Aus Binder „${draftBinderName || "Unbenannt"}“`,
      });
      setWishlistFeedback(`${selectedCatalogCard.name} wurde zur Wunschliste hinzugefügt.`);
    } catch (error) {
      setWishlistFeedback(getApiErrorMessage(error, "Wunschliste konnte nicht aktualisiert werden."));
    }
  }

  async function handleLoadMoreCatalogCards() {
    if (!catalogCursor || catalogLoading) return;

    setCatalogLoading(true);
    try {
      const payload = await cardCatalogClient.search({
        q: inventorySearch.trim() || undefined,
        ownership: ownershipFilter,
        kind: inventoryKind === "ALL" ? undefined : inventoryKind,
        rarity: inventoryRarity === "ALL" ? undefined : inventoryRarity,
        sort: mapCollectionSortToCatalogSort(inventorySort),
        cursor: catalogCursor,
        limit: 60,
      });
      setCatalogError(null);
      setCatalogCards((current) => {
        const known = new Set(current.map((card) => card.cardId));
        return [...current, ...payload.items.filter((card) => !known.has(card.cardId))];
      });
      setCatalogCursor(payload.nextCursor);
      setCatalogTotal(payload.total);
    } catch (error) {
      setCatalogError(getApiErrorMessage(error, "Weitere Karten konnten nicht geladen werden."));
    } finally {
      setCatalogLoading(false);
    }
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
  const inventoryTiles = catalogCards.map<InventoryTile>((catalogCard) => {
    const inventoryCard = inventoryByCardId.get(catalogCard.cardId);

    if (!inventoryCard || inventoryCard.printings.length === 0) {
      return {
        availableNow: 0,
        card: catalogCard,
        disabled: true,
        isSelected: selectedCatalogCard?.cardId === catalogCard.cardId,
        key: `${catalogCard.cardId}-unowned`,
        payload: null,
        printing: null,
        printingCount: 0,
      };
    }

    const visiblePrintings = inventoryCard.printings.filter(
      (printing) => inventoryRarity === "ALL" || printing.rarity === inventoryRarity,
    );
    const selectedPrinting =
      visiblePrintings.find(
        (printing) => printing.key === selectedPrintingByCardId[catalogCard.cardId],
      ) ??
      visiblePrintings.find(
        (printing) =>
          getAvailableCopies(printing, usedEntryIds) > 0,
      ) ??
      visiblePrintings[0] ??
      null;
    const freeEntryId = selectedPrinting
      ? getFreeEntryId(selectedPrinting, usedEntryIds)
      : null;
    const availableNow = visiblePrintings.reduce(
      (sum, printing) =>
        sum + getAvailableCopies(printing, usedEntryIds),
      0,
    );
    const payload =
      selectedPrinting && freeEntryId
        ? buildDragPayload(inventoryCard, selectedPrinting, freeEntryId)
        : null;

    return {
      availableNow,
      card: catalogCard,
      disabled: !payload,
      isSelected:
        selectedCatalogCard?.cardId === catalogCard.cardId ||
        (Boolean(payload) && stagedPayload?.collectionEntryId === payload?.collectionEntryId),
      key: catalogCard.cardId,
      payload,
      printing: selectedPrinting,
      printingCount: visiblePrintings.length,
    };
  }).sort((left, right) => {
    const leftInventory = inventoryByCardId.get(left.card.cardId);
    const rightInventory = inventoryByCardId.get(right.card.cardId);
    if (inventorySort === "MOST_COPIES") {
      return right.card.totalCopies - left.card.totalCopies ||
        left.card.name.localeCompare(right.card.name, "de");
    }
    if (inventorySort === "NEWEST_ACQUIRED") {
      return (
        new Date(rightInventory?.latestAcquiredAt ?? 0).getTime() -
          new Date(leftInventory?.latestAcquiredAt ?? 0).getTime() ||
        left.card.name.localeCompare(right.card.name, "de")
      );
    }
    if (inventorySort === "RARITY") {
      return (
        (right.printing?.rarity ?? "").localeCompare(
          left.printing?.rarity ?? "",
          "de",
        ) || left.card.name.localeCompare(right.card.name, "de")
      );
    }
    return left.card.name.localeCompare(right.card.name, "de");
  });
  const inventoryCardCount = snapshot?.inventoryCards.length ?? 0;
  const selectedCatalogAvailableCopies = selectedCatalogCard
    ? inventoryTiles.find((tile) => tile.card.cardId === selectedCatalogCard.cardId)
        ?.availableNow ?? 0
    : 0;
  const totalOwnedCopies =
    snapshot?.inventoryCards.reduce((sum, card) => sum + card.totalCopies, 0) ?? 0;
  const totalBinderSlots = pages.length * 18;
  const totalFilledSlots = pages.reduce(
    (sum, page) => sum + page.slots.filter((slot) => slot.status === "filled").length,
    0,
  );

  return (
    <div
      className={classNames(
        "pointer-events-none fixed inset-0 z-[120] transition",
        isOpen ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="binder-editor-title"
        tabIndex={-1}
        className={classNames(
          "app-shell pointer-events-auto absolute inset-0 overflow-hidden bg-[#04060a] text-[#f2e5d1]",
          !isOpen && "hidden",
        )}
      >
        <div className="app-background" />

        <AppSidebar />

        <main className="app-main relative z-10 h-screen min-w-0 overflow-y-auto pb-20 lg:ml-[176px] lg:pb-0">
          <div className="flex min-h-full flex-col px-5 pb-5 pt-4 sm:px-7 xl:px-8">
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
                <h2 id="binder-editor-title" className="font-display inscription-text mt-2 text-4xl leading-[0.92] uppercase tracking-[0.025em] sm:text-[2.9rem] xl:text-[3.1rem]">
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
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => void handleCloseEditor()}
                  className="min-h-[42px] rounded-[4px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
                >
                  Schließen
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
                  onChange={(event) => {
                    metadataDirtyRef.current = true;
                    metadataEditRevisionRef.current += 1;
                    setCloseWarning(null);
                    if (!metadataSavePromiseRef.current && pendingSaveCountRef.current === 0) {
                      setSaveStatus("idle");
                    }
                    setDraftBinderName(event.target.value.slice(0, 40));
                  }}
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
                      onClick={() => {
                        if (cover.key === draftCoverKey) return;
                        metadataDirtyRef.current = true;
                        metadataEditRevisionRef.current += 1;
                        setCloseWarning(null);
                        if (!metadataSavePromiseRef.current && pendingSaveCountRef.current === 0) {
                          setSaveStatus("idle");
                        }
                        setDraftCoverKey(cover.key);
                      }}
                      className={classNames(
                        "relative h-[72px] w-[52px] overflow-hidden rounded-[5px] border bg-[rgba(255,255,255,0.03)] transition",
                        draftCoverKey === cover.key
                          ? "border-[#d05239] shadow-[0_0_0_1px_rgba(208,82,57,0.32),0_0_22px_rgba(208,82,57,0.24)]"
                          : "border-[rgba(255,255,255,0.1)] hover:border-[rgba(214,164,92,0.28)]",
                      )}
                      aria-label={`${cover.name} als Binder-Cover wählen`}
                      aria-pressed={draftCoverKey === cover.key}
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

            <div className="mt-4 min-h-[680px] flex-1 overflow-visible">
          {isLoading ? (
            <div className="mx-auto mt-24 max-w-md rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(6,9,14,0.8)] px-6 py-5 text-sm text-[#d7c7b3]">
              Binder-Editor wird geladen...
            </div>
          ) : snapshotError ? (
            <div role="alert" className="mx-auto mt-24 max-w-md rounded-[22px] border border-[rgba(214,100,74,0.2)] bg-[rgba(90,26,17,0.38)] px-6 py-5 text-sm text-[#ffd6c8]">
              {snapshotError}
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
                        onClick={() => handleSelectPage(index)}
                        aria-pressed={activePageIndex === index}
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
                      role="status"
                      aria-live="polite"
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
                  <div role="alert" className="mx-4 mt-3 rounded-[14px] border border-[rgba(214,100,74,0.2)] bg-[rgba(90,26,17,0.38)] px-3 py-2 text-sm text-[#ffd6c8]">
                    {saveError}
                  </div>
                ) : null}

                {closeWarning ? (
                  <div role="alert" className="mx-4 mt-3 rounded-[14px] border border-[rgba(214,164,92,0.28)] bg-[rgba(150,97,33,0.16)] px-3 py-3 text-sm text-[#ffe3bd]">
                    <p>{closeWarning}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ui-button-secondary !px-3 !py-2"
                        onClick={() => void handleRetryFailedSaves()}
                      >
                        Erneut speichern
                      </button>
                      <button
                        type="button"
                        className="ui-button-danger !px-3 !py-2"
                        onClick={onClose}
                      >
                        Änderungen verwerfen
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
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
                      {catalogLoading ? "Lädt…" : `${catalogCards.length} / ${catalogTotal} Karten`}
                    </span>
                  </div>
                </div>

                <>
                    <div className="space-y-3 border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
                      {catalogError ? (
                        <div role="alert" className="rounded-[14px] border border-[rgba(214,100,74,0.2)] bg-[rgba(90,26,17,0.38)] px-3 py-3 text-sm text-[#ffd6c8]">
                          <p>{catalogError}</p>
                          <button
                            type="button"
                            className="ui-button-neutral mt-2 !px-3 !py-2"
                            onClick={() => setCatalogRevision((revision) => revision + 1)}
                          >
                            Katalog erneut laden
                          </button>
                        </div>
                      ) : null}

                      {selectedCatalogCard ? (
                        <div className="rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.035)] p-3">
                          <div className="flex items-start gap-3">
                            <div className="relative aspect-[59/86] w-14 shrink-0 overflow-hidden rounded-[6px] border border-[rgba(255,255,255,0.08)]">
                              {selectedCatalogCard.imageUrl ? (
                                <Image src={selectedCatalogCard.imageUrl} alt={selectedCatalogCard.name} fill sizes="56px" unoptimized className="object-contain" />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[#f2dfc8]">{selectedCatalogCard.name}</p>
                              <p className="mt-1 text-xs text-[#aa9780]">
                                {selectedCatalogCard.owned
                                  ? `${selectedCatalogAvailableCopies} freie von ${selectedCatalogCard.totalCopies} Kopien`
                                  : "Nicht im Besitz · kann nicht in einen Binder gelegt werden"}
                              </p>
                              {!selectedCatalogCard.owned ? (
                                <button
                                  type="button"
                                  onClick={() => void handleAddSelectedCardToWishlist()}
                                  className="mt-2 rounded-[4px] border border-[rgba(214,164,92,0.28)] bg-[rgba(150,97,33,0.16)] px-3 py-1.5 text-xs font-semibold text-[#ffe3bd]"
                                >
                                  Zur Wunschliste
                                </button>
                              ) : null}
                            </div>
                          </div>
                          {inventoryByCardId.get(selectedCatalogCard.cardId) ? (
                            <div className="mt-3 space-y-1.5 border-t border-[rgba(255,255,255,0.08)] pt-3">
                              <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[#a9957b]">
                                Druckvariante wählen
                              </p>
                              {inventoryByCardId
                                .get(selectedCatalogCard.cardId)!
                                .printings.filter(
                                  (printing) =>
                                    inventoryRarity === "ALL" ||
                                    printing.rarity === inventoryRarity,
                                )
                                .map((printing) => {
                                  const available = getAvailableCopies(
                                    printing,
                                    usedEntryIds,
                                  );
                                  const freeEntryId = getFreeEntryId(
                                    printing,
                                    usedEntryIds,
                                  );
                                  const isSelected =
                                    selectedPrintingByCardId[selectedCatalogCard.cardId] ===
                                      printing.key ||
                                    (!selectedPrintingByCardId[selectedCatalogCard.cardId] &&
                                      inventoryTiles.find(
                                        (tile) =>
                                          tile.card.cardId === selectedCatalogCard.cardId,
                                      )?.printing?.key === printing.key);

                                  return (
                                    <button
                                      key={printing.key}
                                      type="button"
                                      disabled={!freeEntryId}
                                      onClick={() => {
                                        setSelectedPrintingByCardId((current) => ({
                                          ...current,
                                          [selectedCatalogCard.cardId]: printing.key,
                                        }));
                                        if (freeEntryId) {
                                          setStagedPayload(
                                            buildDragPayload(
                                              inventoryByCardId.get(
                                                selectedCatalogCard.cardId,
                                              )!,
                                              printing,
                                              freeEntryId,
                                            ),
                                          );
                                        }
                                      }}
                                      className={classNames(
                                        "flex w-full items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-left transition",
                                        isSelected
                                          ? "border-[rgba(214,164,92,0.42)] bg-[rgba(150,97,33,0.16)]"
                                          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] hover:border-[rgba(214,164,92,0.24)]",
                                        !freeEntryId && "cursor-not-allowed opacity-45",
                                      )}
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate text-[0.64rem] font-semibold text-[#ead9c3]">
                                          {printing.setLabel}
                                        </span>
                                        <span className="mt-0.5 block text-[0.54rem] text-[#a9957b]">
                                          {printing.setCode ?? "Ohne Setcode"} ·{" "}
                                          {printing.rarity ?? "Ohne Seltenheit"}
                                        </span>
                                      </span>
                                      <span className="shrink-0 text-[0.62rem] font-bold text-[#f3d5aa]">
                                        {available} frei / {printing.copies}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          ) : null}
                          {wishlistFeedback ? <p className="mt-2 text-xs text-[#c9b79f]">{wishlistFeedback}</p> : null}
                        </div>
                      ) : null}

                      {stagedPayload ? (
                        <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(214,164,92,0.24)] bg-[rgba(150,97,33,0.14)] px-4 py-3 text-sm text-[#f2dec1]">
                          <span className="truncate font-semibold text-[#ffe5bf]">
                            {stagedPayload.cardName}
                          </span>
                          <button
                            type="button"
                            onClick={() => setStagedPayload(null)}
                            aria-label={`${stagedPayload.cardName} nicht mehr zum Ablegen vormerken`}
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

                        <div className="grid grid-cols-3 gap-2" aria-label="Besitzfilter">
                          {([
                            ["ALL", "Alle Karten"],
                            ["OWNED", "Im Besitz"],
                            ["UNOWNED", "Nicht im Besitz"],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setOwnershipFilter(value)}
                              aria-pressed={ownershipFilter === value}
                              className={classNames(
                                "rounded-[6px] border px-2 py-2 text-[0.66rem] font-semibold transition",
                                ownershipFilter === value
                                  ? "border-[rgba(207,91,66,0.34)] bg-[rgba(207,91,66,0.16)] text-[#ffe3ca]"
                                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cbb79d]",
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(["ALL", "MONSTER", "SPELL", "TRAP", "TOKEN"] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => setInventoryKind(kind)}
                              aria-pressed={inventoryKind === kind}
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
                          <select
                            value={inventoryRarity}
                            onChange={(event) => setInventoryRarity(event.target.value)}
                            className="rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[#0b0f15] px-3 py-2 text-xs font-semibold text-[#e8d6c0] outline-none"
                            aria-label="Seltenheit filtern"
                          >
                            <option value="ALL">Alle Seltenheiten</option>
                            {inventoryRarities.map((rarity) => (
                              <option key={rarity} value={rarity}>{rarity}</option>
                            ))}
                          </select>
                          <select
                            value={inventorySort}
                            onChange={(event) =>
                              setInventorySort(
                                event.target.value as CollectionSortModeValue,
                              )
                            }
                            className="rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[#0b0f15] px-3 py-2 text-xs font-semibold text-[#e8d6c0] outline-none"
                            aria-label="Binder-Katalog sortieren"
                          >
                            {(
                              [
                                "MOST_COPIES",
                                "NEWEST_ACQUIRED",
                                "ALPHABETICAL",
                                "RARITY",
                              ] as const
                            ).map((sortMode) => (
                              <option key={sortMode} value={sortMode}>
                                {getCollectionSortLabel(sortMode)}
                              </option>
                            ))}
                          </select>
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
                              onClick={() => {
                                if (suppressClickRef.current) {
                                  suppressClickRef.current = false;
                                  return;
                                }

                                setSelectedCatalogCard(tile.card);
                                setWishlistFeedback(null);
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
                                  ? "cursor-pointer border-[rgba(255,255,255,0.05)] hover:border-[rgba(207,91,66,0.22)]"
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
                                    className={classNames(
                                      "pointer-events-none select-none object-contain object-center transition duration-200 group-hover:scale-[1.02] [-webkit-user-drag:none]",
                                      tile.disabled
                                        ? "opacity-65 group-hover:opacity-[0.82] group-focus-visible:opacity-[0.82]"
                                        : "opacity-100",
                                    )}
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-2 text-center text-[0.68rem] font-semibold text-[#eadbc7]">
                                    {tile.card.name}
                                  </div>
                                )}
                                <span className="absolute right-1 top-1 rounded-[3px] border border-[rgba(0,0,0,0.28)] bg-[rgba(123,72,23,0.86)] px-1 py-0.5 text-[0.48rem] font-bold uppercase tracking-[0.06em] text-[#ffe0a8]">
                                  {tile.printing?.rarity ?? tile.card.rarities[0] ?? "N"}
                                </span>
                                <span className="absolute bottom-1 right-1 rounded-[3px] bg-[rgba(4,6,10,0.78)] px-1 py-0.5 text-[0.54rem] font-bold text-[#f5e1c8]">
                                  {tile.availableNow}x
                                </span>
                                {tile.printingCount > 1 ? (
                                  <span className="absolute bottom-1 left-1 rounded-[3px] bg-[rgba(4,6,10,0.78)] px-1 py-0.5 text-[0.48rem] font-semibold text-[#d9c6ae]">
                                    {tile.printingCount} Varianten
                                  </span>
                                ) : null}
                              </div>
                              <p className="pointer-events-none mt-1.5 line-clamp-1 text-[0.62rem] font-semibold leading-4 text-[#f1deca]">
                                {tile.card.name}
                              </p>
                              <p className="pointer-events-none mt-0.5 truncate text-[0.52rem] uppercase tracking-[0.1em] text-[#9f8c77]">
                                {tile.printing?.setCode ?? tile.printing?.setLabel ?? "Nicht im Besitz"}
                              </p>
                              {(tile.printing?.reservedCopies ?? 0) > 0 ? (
                                <p className="pointer-events-none mt-0.5 truncate text-[0.5rem] uppercase tracking-[0.1em] text-[#d6a45c]">
                                  Reserviert
                                </p>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                      {catalogCursor ? (
                        <button
                          type="button"
                          onClick={() => void handleLoadMoreCatalogCards()}
                          disabled={catalogLoading}
                          className="mt-3 w-full rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-xs font-semibold text-[#d5c4af] disabled:opacity-50"
                        >
                          {catalogLoading ? "Lädt…" : "Weitere Karten laden"}
                        </button>
                      ) : null}
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
          ref={contextMenuRef}
          role="menu"
          aria-label={`Aktionen für Slot ${slotContextMenu.slotIndex + 1}`}
          className="pointer-events-auto fixed z-[170] min-w-[190px] overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.12)] bg-[rgba(8,11,16,0.96)] py-2 shadow-[0_22px_50px_rgba(0,0,0,0.48)] backdrop-blur-xl"
          style={{
            left: contextMenuLeft,
            top: contextMenuTop,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
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
            role="menuitem"
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
          <div className="pointer-events-none relative aspect-[59/86] w-[72px] overflow-hidden rounded-[8px] border border-[rgba(214,164,92,0.52)] bg-[#090c11] shadow-[0_18px_38px_rgba(0,0,0,0.52)]">
              {activeDrag.payload.imageUrl ? (
                <Image
                  src={activeDrag.payload.imageUrl}
                  alt={activeDrag.payload.cardName}
                  fill
                  sizes="72px"
                  unoptimized
                  draggable={false}
                  className="object-contain object-center"
                />
              ) : (
                <span className="flex h-full items-center justify-center px-2 text-center text-[0.6rem] text-[#eadbc7]">{activeDrag.payload.cardName}</span>
              )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
