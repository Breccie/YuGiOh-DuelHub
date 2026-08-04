"use client";

import {
  IconAdjustments,
  IconCopy,
  IconFlask,
  IconPackage,
  IconPlus,
  IconRestore,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CardCatalogItem,
  CardCatalogSort,
  CustomPackEra,
} from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { FieldHelp } from "@/components/field-help";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { cardCatalogClient } from "@/lib/card-catalog-client";
import {
  getCustomPackEraPreset,
  getCustomPackRarityPercentage,
  normalizeCustomPackRarityOptions,
  toPersistedCustomPackSlot,
  type CustomPackSlotDraft,
} from "@/lib/custom-pack-config";
import {
  customPackClient,
  type CustomPackRecord,
  type CustomPackTemplateRecord,
} from "@/lib/custom-pack-client";

const ERA_LABELS: Record<CustomPackEra, string> = {
  EARLY_TCG: "Frühes TCG",
  GX_5DS: "GX / 5D’s",
  MODERN_CORE: "Modernes Core-Set",
  PROMO_CUSTOM: "Promo / freie Slots",
};

const PACK_RARITIES = [
  "Common",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Ultimate Rare",
  "Collector Rare",
  "Ghost Rare",
  "Starlight Rare",
  "Quarter Century Secret Rare",
  "Promo",
] as const;

const packCardDragMime = "application/x-ygo-custom-pack-card";
type PackCardDragPayload = { source: "catalog" | "pool"; cardId: string; rarity?: string };

type PoolItem = {
  cardId: string;
  setCardId: string | null;
  rarity: string;
  weight: number;
  name: string;
  imageUrl: string | null;
};

type MobileEditorView = "PACK" | "POOL" | "CATALOG";
type CatalogCardKind = CardCatalogItem["kind"];
type SimulationResult = Awaited<ReturnType<typeof customPackClient.simulate>>;

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getVersion(pack: CustomPackRecord | null, canEdit = true) {
  if (!pack) return null;
  return canEdit
    ? pack.versions.find((version) => version.status === "DRAFT") ?? pack.versions[0] ?? null
    : pack.versions.find((version) => version.status === "PUBLISHED") ?? null;
}

function getPool(pack: CustomPackRecord | null): PoolItem[] {
  return getVersion(pack)?.poolEntries.map((entry) => ({
    cardId: entry.cardId,
    setCardId: entry.setCardId,
    rarity: entry.rarity,
    weight: entry.weight,
    name: entry.card?.name ?? "Unbekannte Karte",
    imageUrl: getCardAssetUrl(entry.card?.externalCardId ?? null),
  })) ?? [];
}

function getSlots(pack: CustomPackRecord | null): CustomPackSlotDraft[] {
  return getVersion(pack)?.slots.map((slot) => ({
    slotIndex: slot.slotIndex,
    count: slot.count,
    allowedRarities: slot.allowedRarities,
    weight: slot.weight,
    rarityOptions: normalizeCustomPackRarityOptions({
      ...slot,
      rarityWeights: slot.rarityWeights,
    }),
  })) ?? [];
}

function draftSignature(input: {
  pool: PoolItem[];
  slots: CustomPackSlotDraft[];
  packSize: number;
  displaySize: number;
  price: number;
}) {
  return JSON.stringify({
    pool: input.pool
      .map(({ cardId, setCardId, rarity, weight }) => ({ cardId, setCardId, rarity, weight }))
      .sort((left, right) => `${left.rarity}:${left.cardId}`.localeCompare(`${right.rarity}:${right.cardId}`)),
    slots: input.slots.map(toPersistedCustomPackSlot).sort((left, right) => left.slotIndex - right.slotIndex),
    packSize: input.packSize,
    displaySize: input.displaySize,
    price: input.price,
  });
}

function encodeDragPayload(payload: PackCardDragPayload) {
  return JSON.stringify(payload);
}

function setDragPayload(
  dataTransfer: DataTransfer,
  payload: PackCardDragPayload,
) {
  const encoded = encodeDragPayload(payload);
  dataTransfer.setData(packCardDragMime, encoded);
  dataTransfer.setData("text/plain", encoded);
}

function decodeDragPayload(event: React.DragEvent) {
  try {
    const encoded = event.dataTransfer.getData(packCardDragMime) || event.dataTransfer.getData("text/plain");
    return JSON.parse(encoded) as PackCardDragPayload;
  } catch {
    return null;
  }
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
}

function RarityTone({ rarity }: { rarity: string }) {
  const normalized = rarity.toLowerCase();
  const tone = normalized.includes("secret") || normalized.includes("ghost")
    ? "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100"
    : normalized.includes("ultra") || normalized.includes("ultimate") || normalized.includes("collector")
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : normalized.includes("super")
        ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
        : normalized === "rare"
          ? "border-sky-300/20 bg-sky-300/10 text-sky-100"
          : "border-white/10 bg-white/[0.035] text-[#d7c9b8]";
  return <span className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold ${tone}`}>{rarity}</span>;
}

export function CustomPackEditorWorkspace({
  session,
  activeRun,
}: {
  session: ViewerSession;
  activeRun: PlayGroupRunDto;
}) {
  const canEdit = activeRun.viewerRole === "OWNER" || activeRun.viewerRole === "ORGANIZER";
  const [packs, setPacks] = useState<CustomPackRecord[]>([]);
  const [templates, setTemplates] = useState<CustomPackTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [slots, setSlots] = useState<CustomPackSlotDraft[]>([]);
  const [packSize, setPackSize] = useState(9);
  const [displaySize, setDisplaySize] = useState(24);
  const [price, setPrice] = useState(100);
  const [savedSignature, setSavedSignature] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newName, setNewName] = useState("Duel Hub Custom Set");
  const [newCode, setNewCode] = useState("DHC-01");
  const [newEra, setNewEra] = useState<CustomPackEra>("EARLY_TCG");
  const [mobileView, setMobileView] = useState<MobileEditorView>("POOL");
  const [activeRarity, setActiveRarity] = useState("Common");
  const [selectedPoolKey, setSelectedPoolKey] = useState<string | null>(null);
  const [selectedCatalogCard, setSelectedCatalogCard] = useState<CardCatalogItem | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | CatalogCardKind>("ALL");
  const [catalogSort, setCatalogSort] = useState<CardCatalogSort>("NAME_ASC");
  const [cards, setCards] = useState<CardCatalogItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const saveRevisionRef = useRef(0);
  const catalogRevisionRef = useRef(0);
  const dragPayloadRef = useRef<PackCardDragPayload | null>(null);
  const dragTargetRarityRef = useRef<string | null>(null);
  const openIntentRef = useRef<{ versionId: string; key: string } | null>(null);

  const selected = useMemo(
    () => packs.find((pack) => pack.id === selectedId) ?? null,
    [packs, selectedId],
  );
  const version = getVersion(selected, canEdit);
  const canMutate = Boolean(version?.status === "DRAFT");

  const currentSignature = useMemo(
    () => draftSignature({ pool, slots, packSize, displaySize, price }),
    [displaySize, packSize, pool, price, slots],
  );
  const isDirty = Boolean(version && savedSignature && savedSignature !== currentSignature);

  const validation = useMemo(() => {
    const messages: string[] = [];
    const poolRarities = new Set(pool.map((entry) => entry.rarity));
    const reachable = new Set(slots.flatMap((slot) => slot.rarityOptions.map((option) => option.rarity)));
    const missingPools = [...reachable].filter((rarity) => !poolRarities.has(rarity));
    const unreachablePools = [...poolRarities].filter((rarity) => !reachable.has(rarity));
    const total = slots.reduce((sum, slot) => sum + slot.count, 0);
    if (pool.length === 0) messages.push("Füge mindestens eine Karte zu einem Seltenheitspool hinzu.");
    if (total !== packSize) messages.push(`Der Booster-Aufbau erzeugt ${total} statt ${packSize} Karten.`);
    if (missingPools.length) messages.push(`Ohne Kartenpool: ${missingPools.join(", ")}.`);
    if (unreachablePools.length) messages.push(`Nicht über eine Ziehgruppe erreichbar: ${unreachablePools.join(", ")}.`);
    if (slots.some((slot) => slot.rarityOptions.length === 0)) messages.push("Jede Ziehgruppe benötigt mindestens eine Seltenheit.");
    return { messages, missingPools: new Set(missingPools), reachable, valid: messages.length === 0 };
  }, [packSize, pool, slots]);

  const rarities = useMemo(() => {
    const used = new Set([
      ...pool.map((entry) => entry.rarity),
      ...slots.flatMap((slot) => slot.rarityOptions.map((option) => option.rarity)),
    ]);
    return [
      ...PACK_RARITIES.filter((rarity) => used.has(rarity) || ["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare"].includes(rarity)),
      ...[...used].filter((rarity) => !PACK_RARITIES.includes(rarity as (typeof PACK_RARITIES)[number])),
    ];
  }, [pool, slots]);

  const selectedPoolItem = useMemo(
    () => pool.find((entry) => `${entry.cardId}:${entry.rarity}` === selectedPoolKey) ?? null,
    [pool, selectedPoolKey],
  );

  function applySelectedPack(pack: CustomPackRecord | null) {
    const nextVersion = getVersion(pack, canEdit);
    const nextPool = getPool(pack);
    const nextSlots = getSlots(pack);
    const nextPackSize = nextVersion?.packSize ?? 9;
    const nextDisplaySize = nextVersion?.displaySize ?? 24;
    const nextPrice = nextVersion?.price ?? 100;
    setSelectedId(pack?.id ?? null);
    setPool(nextPool);
    setSlots(nextSlots);
    setPackSize(nextPackSize);
    setDisplaySize(nextDisplaySize);
    setPrice(nextPrice);
    setSavedSignature(draftSignature({
      pool: nextPool,
      slots: nextSlots,
      packSize: nextPackSize,
      displaySize: nextDisplaySize,
      price: nextPrice,
    }));
    setSelectedPoolKey(null);
    setSimulation(null);
    const configuredRarities = nextSlots.flatMap((slot) => slot.rarityOptions.map((option) => option.rarity));
    setActiveRarity(configuredRarities.includes("Common") ? "Common" : configuredRarities[0] ?? "Common");
  }

  async function loadPacks(preferredId?: string | null) {
    const [listed, listedTemplates] = await Promise.all([
      customPackClient.list(activeRun.id),
      canEdit ? customPackClient.listTemplates() : Promise.resolve([]),
    ]);
    const visible = canEdit
      ? listed
      : listed.filter((pack) => pack.versions.some((item) => item.status === "PUBLISHED"));
    setPacks(visible);
    setTemplates(listedTemplates);
    const next = visible.find((pack) => pack.id === (preferredId ?? selectedId)) ?? visible[0] ?? null;
    applySelectedPack(next);
  }

  useEffect(() => {
    let mounted = true;
    Promise.all([
      customPackClient.list(activeRun.id),
      canEdit ? customPackClient.listTemplates() : Promise.resolve([]),
    ])
      .then(([listed, listedTemplates]) => {
        if (!mounted) return;
        const visible = canEdit
          ? listed
          : listed.filter((pack) => pack.versions.some((item) => item.status === "PUBLISHED"));
        setPacks(visible);
        setTemplates(listedTemplates);
        applySelectedPack(visible[0] ?? null);
      })
      .catch((error) => setFeedback(getApiErrorMessage(error, "Custom Packs konnten nicht geladen werden.")))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  // The active campaign is the lifecycle boundary for this editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun.id, canEdit]);

  useEffect(() => {
    if (!canEdit) return;
    const revision = ++catalogRevisionRef.current;
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      void cardCatalogClient.search({
        q: search,
        ownership: "ALL",
        kind: kindFilter === "ALL" ? undefined : kindFilter,
        sort: catalogSort,
        limit: 48,
      }).then((result) => {
        if (catalogRevisionRef.current !== revision) return;
        setCards(result.items);
        setCatalogTotal(result.total);
      }).catch((error) => {
        if (catalogRevisionRef.current === revision) {
          setFeedback(getApiErrorMessage(error, "Kartenkatalog konnte nicht geladen werden."));
        }
      }).finally(() => {
        if (catalogRevisionRef.current === revision) setCatalogLoading(false);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [canEdit, catalogSort, kindFilter, search]);

  function selectPack(pack: CustomPackRecord) {
    if (pack.id === selectedId || pending) return;
    if (isDirty && !window.confirm("Ungespeicherte Packänderungen verwerfen und Pack wechseln?")) return;
    applySelectedPack(pack);
  }

  function addCard(card: CardCatalogItem, rarity = activeRarity) {
    if (!canMutate) return;
    const key = `${card.cardId}:${rarity}`;
    setSelectedCatalogCard(card);
    setSelectedPoolKey(key);
    setPool((current) => current.some((entry) => `${entry.cardId}:${entry.rarity}` === key)
      ? current
      : [...current, {
          cardId: card.cardId,
          setCardId: null,
          rarity,
          weight: 1,
          name: card.name,
          imageUrl: card.imageUrl,
        }]);
  }

  function movePoolCard(cardId: string, fromRarity: string, toRarity: string) {
    if (!canMutate || fromRarity === toRarity) return;
    setPool((current) => {
      if (current.some((entry) => entry.cardId === cardId && entry.rarity === toRarity)) {
        return current.filter((entry) => !(entry.cardId === cardId && entry.rarity === fromRarity));
      }
      return current.map((entry) => entry.cardId === cardId && entry.rarity === fromRarity
        ? { ...entry, rarity: toRarity }
        : entry);
    });
    setSelectedPoolKey(`${cardId}:${toRarity}`);
  }

  function handleDrop(event: React.DragEvent, rarity: string) {
    event.preventDefault();
    const payload = decodeDragPayload(event) ?? dragPayloadRef.current;
    dragPayloadRef.current = null;
    dragTargetRarityRef.current = null;
    if (!payload) return;
    if (payload.source === "catalog") {
      const card = cards.find((entry) => entry.cardId === payload.cardId);
      if (card) addCard(card, rarity);
    } else if (payload.rarity) {
      movePoolCard(payload.cardId, payload.rarity, rarity);
    }
  }

  function handleDragEnd() {
    const payload = dragPayloadRef.current;
    const rarity = dragTargetRarityRef.current;
    dragPayloadRef.current = null;
    dragTargetRarityRef.current = null;
    if (!payload || !rarity) return;
    if (payload.source === "catalog") {
      const card = cards.find((entry) => entry.cardId === payload.cardId);
      if (card) addCard(card, rarity);
    } else if (payload.rarity) {
      movePoolCard(payload.cardId, payload.rarity, rarity);
    }
  }

  function removePoolItem(item: PoolItem) {
    setPool((current) => current.filter((entry) => !(entry.cardId === item.cardId && entry.rarity === item.rarity)));
    if (selectedPoolKey === `${item.cardId}:${item.rarity}`) setSelectedPoolKey(null);
  }

  function updatePercentage(slotIndex: number, rarity: string, percentage: number) {
    setSlots((current) => current.map((slot) => {
      if (slot.slotIndex !== slotIndex) return slot;
      if (slot.rarityOptions.length === 1) return slot;
      const target = Math.max(1, Math.min(999, Math.round(percentage * 10)));
      const others = slot.rarityOptions.filter((option) => option.rarity !== rarity);
      const otherTotal = others.reduce((sum, option) => sum + option.weight, 0) || others.length;
      const remaining = 1000 - target;
      const rarityOptions = slot.rarityOptions.map((option) => option.rarity === rarity
        ? { ...option, weight: target }
        : { ...option, weight: Math.max(1, Math.round((option.weight / otherTotal) * remaining)) });
      return { ...slot, rarityOptions };
    }));
  }

  function toggleSlotRarity(slotIndex: number, rarity: string) {
    setSlots((current) => current.map((slot) => {
      if (slot.slotIndex !== slotIndex) return slot;
      const exists = slot.rarityOptions.some((option) => option.rarity === rarity);
      if (exists && slot.rarityOptions.length === 1) return slot;
      return {
        ...slot,
        rarityOptions: exists
          ? slot.rarityOptions.filter((option) => option.rarity !== rarity)
          : [...slot.rarityOptions, { rarity, weight: 1 }],
      };
    }));
  }

  function resetEraPreset() {
    if (!selected || !canMutate) return;
    if (!window.confirm(`Booster-Aufbau auf „${ERA_LABELS[selected.era as CustomPackEra]}“ zurücksetzen?`)) return;
    const preset = getCustomPackEraPreset(selected.era as CustomPackEra);
    setSlots(preset);
    setPackSize(preset.reduce((sum, slot) => sum + slot.count, 0));
    const presetRarities = preset.flatMap((slot) => slot.rarityOptions.map((option) => option.rarity));
    setActiveRarity(presetRarities.includes("Common") ? "Common" : presetRarities[0] ?? "Common");
  }

  async function persistDraft() {
    if (!version || version.status !== "DRAFT") throw new Error("Kein bearbeitbarer Entwurf ausgewählt.");
    const revision = ++saveRevisionRef.current;
    const signature = currentSignature;
    const updated = await customPackClient.update(activeRun.id, version.id, {
      poolEntries: pool.map(({ cardId, setCardId, rarity, weight }) => ({ cardId, setCardId, rarity, weight })),
      slots: slots.map(toPersistedCustomPackSlot),
      packSize,
      displaySize,
      price,
    });
    setPacks((current) => current.map((pack) => pack.id !== selectedId
      ? pack
      : { ...pack, versions: pack.versions.map((entry) => entry.id === updated.id ? updated : entry) }));
    if (saveRevisionRef.current === revision) setSavedSignature(signature);
  }

  async function saveDraft() {
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft();
      setFeedback("Packentwurf gespeichert.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Packentwurf konnte nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  async function simulate() {
    if (!version || !validation.valid) return;
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft();
      const result = await customPackClient.simulate(activeRun.id, version.id, {
        iterations: 10_000,
        seed: "duel-hub-preview",
      });
      setSimulation(result);
      setFeedback("10.000 Packöffnungen wurden simuliert.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Simulation konnte nicht ausgeführt werden."));
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (!version || version.status !== "DRAFT" || !validation.valid) return;
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft();
      await customPackClient.publish(activeRun.id, version.id);
      await loadPacks(selectedId);
      setFeedback("Packversion veröffentlicht. Die Spielerfreigabe erfolgt in den Kampagneneinstellungen.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Packversion konnte nicht veröffentlicht werden."));
    } finally {
      setPending(false);
    }
  }

  async function createPack() {
    setPending(true);
    setFeedback(null);
    try {
      const created = await customPackClient.create(activeRun.id, {
        name: newName,
        code: newCode,
        era: newEra,
        packSize: newEra === "PROMO_CUSTOM" ? 1 : 9,
        displaySize: 24,
        price: 100,
      });
      setCreateOpen(false);
      await loadPacks(created.id);
      setFeedback("Neuer Packentwurf mit passender Ära-Verteilung erstellt.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Custom Pack konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  async function saveAsTemplate() {
    if (!selected) return;
    setPending(true);
    try {
      if (isDirty) await persistDraft();
      const template = await customPackClient.createTemplate(activeRun.id, selected.id, selected.name);
      setTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
      setFeedback(`„${template.name}“ als private Vorlage gespeichert.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Vorlage konnte nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  async function copyTemplate(template: CustomPackTemplateRecord) {
    setPending(true);
    try {
      const copied = await customPackClient.copyTemplate(activeRun.id, template.id);
      setTemplatesOpen(false);
      await loadPacks(copied.id);
      setFeedback(`Vorlage „${template.name}“ in die Kampagne kopiert.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Vorlage konnte nicht kopiert werden."));
    } finally {
      setPending(false);
    }
  }

  async function createNextDraft() {
    if (!version || version.status !== "PUBLISHED") return;
    setPending(true);
    try {
      await customPackClient.nextDraft(activeRun.id, version.id);
      await loadPacks(selectedId);
      setFeedback("Neue bearbeitbare Version erstellt.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Neue Version konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  async function openPublishedPack() {
    if (!version || version.status !== "PUBLISHED") return;
    setPending(true);
    try {
      const intent = openIntentRef.current?.versionId === version.id
        ? openIntentRef.current
        : { versionId: version.id, key: crypto.randomUUID() };
      openIntentRef.current = intent;
      const result = await customPackClient.open(activeRun.id, version.id, { idempotencyKey: intent.key });
      openIntentRef.current = null;
      setFeedback(`${result.pulls.length} Karten wurden deiner Sammlung hinzugefügt.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Pack konnte nicht geöffnet werden."));
    } finally {
      setPending(false);
    }
  }

  if (!canEdit) {
    return (
      <DuelConsoleScaffold activePath="/packs" viewer={{ displayName: session.displayName, duelistId: session.duelistId }} metrics={[]}>
        <Panel kicker="Kampagnen-Packs" title="Veröffentlichte Custom Packs">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => (
              <button key={pack.id} type="button" onClick={() => applySelectedPack(pack)} className={classes("rounded-[9px] border p-4 text-left", selectedId === pack.id ? "border-teal-300/35 bg-teal-300/10" : "border-white/10 bg-white/[0.025]")}>
                <span className="block font-semibold">{pack.name}</span>
                <span className="mt-1 block text-xs text-[#98a7b0]">{pack.code}</span>
              </button>
            ))}
          </div>
          {version ? <button type="button" className="ui-button-primary mt-5" disabled={pending} onClick={() => void openPublishedPack()}>Pack für {version.price} Credits öffnen</button> : null}
          {feedback ? <p role="status" className="mt-4 text-sm text-[#d5e5e7]">{feedback}</p> : null}
        </Panel>
      </DuelConsoleScaffold>
    );
  }

  return (
    <DuelConsoleScaffold activePath="/packs" viewer={{ displayName: session.displayName, duelistId: session.duelistId }} metrics={[]}>
      <section className="custom-pack-workspace flex h-[calc(100dvh-164px)] min-h-[620px] flex-col overflow-hidden rounded-[12px] border border-[rgba(144,174,198,0.14)] bg-[rgba(5,8,13,0.96)] text-[#f2e5d1] lg:h-[calc(100dvh-100px)]">
        <header className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#080d13] px-3 py-2.5">
          <div className="flex min-w-[190px] flex-1 items-center gap-2">
            <IconPackage size={19} className="text-[#d6a45c]" />
            <select
              value={selectedId ?? ""}
              onChange={(event) => {
                const pack = packs.find((item) => item.id === event.target.value);
                if (pack) selectPack(pack);
              }}
              className="ui-input h-9 min-w-0 max-w-[300px] flex-1 py-1.5"
              aria-label="Custom Pack auswählen"
            >
              {packs.length === 0 ? <option value="">Noch kein Pack</option> : null}
              {packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
            </select>
            {selected ? <span className="hidden text-xs text-[#8b9aa3] min-[1380px]:inline">{selected.code} · {ERA_LABELS[selected.era as CustomPackEra]}</span> : null}
          </div>
          {version ? <StatusPill tone={version.status === "DRAFT" ? "gold" : "teal"}>v{version.version} {version.status}</StatusPill> : null}
          {isDirty ? <span className="text-xs font-semibold text-[#f0c98d]">Ungespeichert</span> : null}
          <button type="button" className="ui-button-neutral" onClick={() => setCreateOpen(true)} disabled={pending}><IconPlus size={16} /> Neues Pack</button>
          <div className="relative">
            <button type="button" className="ui-button-neutral" aria-expanded={templatesOpen} onClick={() => setTemplatesOpen((current) => !current)}><IconCopy size={16} /> Vorlagen</button>
            {templatesOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(340px,calc(100vw-2rem))] rounded-[9px] border border-white/12 bg-[#0b1117] p-3 shadow-2xl">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Private Vorlagen</p><button type="button" className="text-[#9cabb3]" onClick={() => setTemplatesOpen(false)} aria-label="Vorlagen schließen"><IconX size={17} /></button></div>
                <button type="button" className="ui-button-secondary mt-3 w-full" disabled={!selected || pending} onClick={() => void saveAsTemplate()}>Aktuelles Pack speichern</button>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">
                  {templates.map((template) => <button key={template.id} type="button" className="rounded-[7px] border border-white/8 px-3 py-2 text-left text-sm hover:border-teal-300/25" onClick={() => void copyTemplate(template)}><span className="block font-semibold">{template.name}</span><span className="text-xs text-[#8e9aa2]">{ERA_LABELS[template.era as CustomPackEra] ?? template.era}</span></button>)}
                  {templates.length === 0 ? <p className="text-xs leading-5 text-[#8e9aa2]">Noch keine private Vorlage gespeichert.</p> : null}
                </div>
              </div>
            ) : null}
          </div>
          {canMutate ? (
            <>
              <button type="button" className="ui-button-neutral" disabled={pending || !isDirty} onClick={() => void saveDraft()}>Speichern</button>
              <button type="button" className="ui-button-secondary" disabled={pending || !validation.valid} onClick={() => void simulate()}><IconFlask size={16} /> Simulieren</button>
              <button type="button" className="ui-button-primary" disabled={pending || !validation.valid} onClick={() => void publish()}>Veröffentlichen</button>
            </>
          ) : version ? (
            <button type="button" className="ui-button-primary" disabled={pending} onClick={() => void createNextDraft()}>Neue Version bearbeiten</button>
          ) : null}
        </header>

        <nav className="grid grid-cols-3 gap-1.5 border-b border-white/8 p-2 xl:hidden" aria-label="Packeditor-Bereich wählen">
          {([['PACK', 'Pack'], ['POOL', 'Kartenpool'], ['CATALOG', 'Katalog']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mobileView === value} onClick={() => setMobileView(value)} className={classes("ui-segment-button border px-3 py-2.5", mobileView === value ? "border-teal-300/35 bg-teal-300/12 text-[#d7f3f2]" : "border-white/8 bg-white/[0.025] text-[#adbac0]")}>{label}</button>
          ))}
        </nav>

        <div className="grid min-h-0 flex-1 gap-2 p-2 xl:grid-cols-[220px_minmax(520px,1fr)_340px]">
          <Panel kicker="Packdetails" title={selected?.name ?? "Pack auswählen"} className={classes("custom-pack-panel order-1 !rounded-[9px] !p-3 xl:flex xl:min-h-0 xl:flex-col", mobileView !== "PACK" && "!hidden xl:!flex")}>
            {loading ? <div className="ui-skeleton h-48 rounded-[8px]" /> : selected && version ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                <div className="rounded-[8px] border border-white/8 bg-white/[0.025] p-3">
                  <div className="flex items-center gap-2 text-xs text-[#9aa8af]">Setcode <FieldHelp label="Setcode">Eine eindeutige Kennung für dieses Pack in der Kampagne, zum Beispiel DHC-01. Beim Veröffentlichen erzeugt das System daraus eigene Kartendrucke; es ist nicht der Setcode einer Originalkarte.</FieldHelp></div>
                  <p className="mt-1 font-semibold text-[#e7d8c7]">{selected.code}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-[#9aa8af]">Era-Vorlage <FieldHelp label="Era-Vorlage">Die Ära bestimmt nur die anfängliche, TCG-nahe Packverteilung. Sie begrenzt weder Kartenalter noch Kartenpool und überschreibt spätere Anpassungen nicht.</FieldHelp></div>
                  <p className="mt-1 text-sm">{ERA_LABELS[selected.era as CustomPackEra]}</p>
                </div>
                <label className="text-xs font-semibold text-[#aebbc1]">Karten pro Pack <input className="ui-input mt-1.5" type="number" min={1} max={100} value={packSize} disabled={!canMutate} onChange={(event) => setPackSize(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label className="text-xs font-semibold text-[#aebbc1]">Packs pro Display <FieldHelp label="Displaygröße">Legt fest, wie viele Booster ein vollständiges Display enthält. Die Einstellung verändert nicht die Karten pro Booster.</FieldHelp><input className="ui-input mt-1.5" type="number" min={1} max={100} value={displaySize} disabled={!canMutate} onChange={(event) => setDisplaySize(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label className="text-xs font-semibold text-[#aebbc1]">Standardpreis <FieldHelp label="Standardpreis">Grundpreis eines Boosters in Credits. Kampagneneinstellungen können diesen Preis später überschreiben.</FieldHelp><input className="ui-input mt-1.5" type="number" min={0} value={price} disabled={!canMutate} onChange={(event) => setPrice(Math.max(0, Number(event.target.value) || 0))} /></label>
                {canMutate ? <button type="button" className="ui-button-neutral w-full" onClick={resetEraPreset}><IconRestore size={16} /> Auf Ära-Standard zurücksetzen</button> : <Link href="/campaigns/settings" className="ui-button-secondary">Spielerfreigabe einstellen</Link>}
                <div className="border-t border-white/8 pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#aebbc1]">Ausgewählte Karte <FieldHelp label="Kartengewicht">Das Kartengewicht bestimmt, wie häufig diese Karte im Vergleich zu anderen Karten derselben Seltenheit gezogen wird. Gleiche Gewichte bedeuten gleiche Chancen.</FieldHelp></div>
                  {selectedPoolItem || selectedCatalogCard ? (
                    <div className="mt-2 grid grid-cols-[66px_1fr] gap-3">
                      <div className="relative aspect-[59/86] overflow-hidden rounded-[6px] border border-white/10 bg-black/30">
                        {(selectedPoolItem?.imageUrl ?? selectedCatalogCard?.imageUrl) ? <Image src={(selectedPoolItem?.imageUrl ?? selectedCatalogCard?.imageUrl)!} alt={selectedPoolItem?.name ?? selectedCatalogCard?.name ?? "Karte"} fill sizes="66px" className="object-cover" /> : null}
                      </div>
                      <div className="min-w-0"><p className="text-sm font-semibold leading-5">{selectedPoolItem?.name ?? selectedCatalogCard?.name}</p>{selectedPoolItem ? <><div className="mt-1"><RarityTone rarity={selectedPoolItem.rarity} /></div><label className="mt-2 block text-xs text-[#9aa8af]">Gewicht<input className="ui-input mt-1 h-8 py-1" type="number" min={1} value={selectedPoolItem.weight} disabled={!canMutate} onChange={(event) => setPool((current) => current.map((entry) => entry.cardId === selectedPoolItem.cardId && entry.rarity === selectedPoolItem.rarity ? { ...entry, weight: Math.max(1, Number(event.target.value) || 1) } : entry))} /></label><button type="button" className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#e6a79c]" onClick={() => removePoolItem(selectedPoolItem)}><IconTrash size={14} /> Entfernen</button></> : <button type="button" className="ui-button-secondary mt-2 w-full" onClick={() => selectedCatalogCard && addCard(selectedCatalogCard)}>Zu {activeRarity}</button>}</div>
                    </div>
                  ) : <p className="mt-2 text-xs leading-5 text-[#839198]">Wähle eine Karte im Pool oder Katalog.</p>}
                </div>
              </div>
            ) : <div className="ui-empty rounded-[8px] p-4 text-sm">Erstelle zuerst ein Custom Pack.</div>}
          </Panel>

          <Panel kicker="Packinhalt" title="Seltenheitspools" className={classes("custom-pack-panel order-2 !rounded-[9px] !p-3 xl:flex xl:min-h-0 xl:flex-col", mobileView !== "POOL" && "!hidden xl:!flex")}>
            <div className="custom-pack-panel-scroll flex min-h-0 flex-1 flex-col gap-2 pr-1">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-white/8 bg-white/[0.02] p-2.5">
                <div><div className="flex items-center gap-2 text-xs font-semibold text-[#d9ccbc]">Booster-Aufbau <FieldHelp label="Ziehgruppen">Eine Ziehgruppe ist keine einzelne Kartenposition. Sie bündelt Karten mit derselben Seltenheitsregel. Beispiel: Eine Common-Ziehgruppe mit der Anzahl 7 erzeugt sieben einzelne Karten im Booster.</FieldHelp></div><p className="mt-1 text-[0.68rem] text-[#84939b]">{slots.length} {slots.length === 1 ? "Ziehgruppe erzeugt" : "Ziehgruppen erzeugen"} zusammen {slots.reduce((sum, slot) => sum + slot.count, 0)} von {packSize} Karten</p></div>
                {validation.messages.length ? <details className="relative"><summary className="cursor-pointer list-none rounded-[5px] border border-red-300/20 bg-red-300/8 px-2.5 py-1 text-xs font-semibold text-[#efb0a6]">{validation.messages.length} Hinweise</summary><div className="absolute right-0 top-[calc(100%+0.4rem)] z-40 w-[min(360px,80vw)] rounded-[8px] border border-red-300/20 bg-[#171013] p-3 shadow-2xl">{validation.messages.map((message) => <p key={message} className="text-xs leading-5 text-[#dfb7b0]">{message}</p>)}</div></details> : <StatusPill tone="teal">Bereit</StatusPill>}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {slots.map((slot, index) => (
                  <div key={slot.slotIndex} className="rounded-[8px] border border-white/8 bg-black/20 p-2.5">
                    <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[#d9ccbc]">Ziehgruppe {index + 1}</p><label className="mt-1.5 flex items-center gap-2 text-[0.68rem] font-semibold text-[#8fa0a8]">Karten pro Booster <input aria-label={`Karten aus Ziehgruppe ${index + 1} pro Booster`} className="ui-input inline-block h-8 w-16 py-1" type="number" min={1} max={100} value={slot.count} disabled={!canMutate} onChange={(event) => setSlots((current) => current.map((entry) => entry.slotIndex === slot.slotIndex ? { ...entry, count: Math.max(1, Number(event.target.value) || 1) } : entry))} /></label></div>{canMutate && slots.length > 1 ? <button type="button" aria-label={`Ziehgruppe ${index + 1} entfernen`} className="mt-0.5 text-[#c88e84]" onClick={() => setSlots((current) => current.filter((entry) => entry.slotIndex !== slot.slotIndex))}><IconX size={16} /></button> : null}</div>
                    <div className="mt-2 grid gap-1.5">
                      {slot.rarityOptions.map((option) => (
                        <label key={option.rarity} className="grid grid-cols-[1fr_74px_auto] items-center gap-2 text-xs"><span className="truncate text-[#d8cabc]">{option.rarity}</span><span className="relative"><input className="ui-input h-8 pr-6 py-1 text-right" type="number" min={0.1} max={100} step={0.1} disabled={!canMutate || slot.rarityOptions.length === 1} defaultValue={formatPercentage(getCustomPackRarityPercentage(slot.rarityOptions, option.rarity))} key={`${slot.slotIndex}:${option.rarity}:${option.weight}`} onBlur={(event) => updatePercentage(slot.slotIndex, option.rarity, Number(event.target.value) || 0.1)} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#718088]">%</span></span><span className="text-[0.62rem] tabular-nums text-[#718088]">W {option.weight}</span></label>
                      ))}
                    </div>
                    <details className="mt-2 border-t border-white/6 pt-2"><summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.68rem] font-semibold text-[#8fa3aa]"><IconAdjustments size={14} /> Expertenmodus und Rohgewichte <FieldHelp label="Rohgewichte">Rohgewichte sind relative Werte. 8 zu 2 zu 1 entspricht etwa 72,7 %, 18,2 % und 9,1 %. Der alte Upgrade-Wert gab allen Seltenheiten nach der ersten dasselbe Gewicht.</FieldHelp></summary><div className="mt-2 flex flex-wrap gap-1.5">{PACK_RARITIES.map((rarity) => { const included = slot.rarityOptions.some((option) => option.rarity === rarity); return <button key={rarity} type="button" aria-pressed={included} disabled={!canMutate || (included && slot.rarityOptions.length === 1)} onClick={() => toggleSlotRarity(slot.slotIndex, rarity)} className={classes("rounded-full border px-2 py-1 text-[0.62rem]", included ? "border-teal-300/25 bg-teal-300/10 text-teal-100" : "border-white/8 text-[#7e8c93]")}>{rarity}</button>; })}</div><div className="mt-2 grid gap-1">{slot.rarityOptions.map((option) => <label key={option.rarity} className="grid grid-cols-[1fr_90px] items-center gap-2 text-xs text-[#96a4aa]"><span>{option.rarity}</span><input className="ui-input h-8 py-1" type="number" min={1} value={option.weight} disabled={!canMutate} onChange={(event) => setSlots((current) => current.map((entry) => entry.slotIndex !== slot.slotIndex ? entry : { ...entry, rarityOptions: entry.rarityOptions.map((item) => item.rarity === option.rarity ? { ...item, weight: Math.max(1, Number(event.target.value) || 1) } : item) }))} /></label>)}</div></details>
                  </div>
                ))}
                {canMutate ? <button type="button" className="min-h-28 rounded-[8px] border border-dashed border-white/12 text-sm font-semibold text-[#8da0a8] hover:border-teal-300/25 hover:text-teal-100" onClick={() => setSlots((current) => [...current, { slotIndex: Math.max(-1, ...current.map((slot) => slot.slotIndex)) + 1, count: 1, allowedRarities: ["Common"], weight: 1, rarityOptions: [{ rarity: "Common", weight: 100 }] }])}><IconPlus size={17} className="mr-1 inline" /> Ziehgruppe hinzufügen</button> : null}
              </div>
              <div>
                <div className="grid gap-2 2xl:grid-cols-2">
                  {rarities.map((rarity) => {
                    const entries = pool.filter((entry) => entry.rarity === rarity);
                    const missing = validation.missingPools.has(rarity);
                    return (
                      <section key={rarity} onDragOver={(event) => { event.preventDefault(); dragTargetRarityRef.current = rarity; event.dataTransfer.dropEffect = "move"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && dragTargetRarityRef.current === rarity) dragTargetRarityRef.current = null; }} onDrop={(event) => handleDrop(event, rarity)} onClick={() => setActiveRarity(rarity)} className={classes("min-h-36 rounded-[9px] border p-2.5 transition", activeRarity === rarity ? "border-teal-300/30 bg-teal-300/[0.055]" : "border-white/8 bg-white/[0.018]", missing && "border-red-300/25")}>
                        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><RarityTone rarity={rarity} /><FieldHelp label={`${rarity}-Pool`}>Alle Karten in diesem Bereich können gezogen werden, wenn eine Ziehgruppe die Seltenheit {rarity} auswählt.</FieldHelp></div><span className="text-[0.65rem] tabular-nums text-[#7f8e95]">{entries.length} Karten</span></div>
                        {entries.length ? <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-7 xl:grid-cols-6 2xl:grid-cols-8">{entries.map((entry) => <button key={`${entry.cardId}:${entry.rarity}`} type="button" draggable={canMutate} onDragStart={(event) => { const payload: PackCardDragPayload = { source: "pool", cardId: entry.cardId, rarity: entry.rarity }; dragPayloadRef.current = payload; setDragPayload(event.dataTransfer, payload); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={handleDragEnd} onClick={(event) => { event.stopPropagation(); setSelectedPoolKey(`${entry.cardId}:${entry.rarity}`); setSelectedCatalogCard(null); }} onContextMenu={(event) => { event.preventDefault(); removePoolItem(entry); }} className={classes("group relative aspect-[59/86] overflow-hidden rounded-[5px] border bg-black/30", selectedPoolKey === `${entry.cardId}:${entry.rarity}` ? "border-teal-200/70 ring-1 ring-teal-200/35" : "border-white/10 hover:border-white/25")} aria-label={`${entry.name}, ${entry.rarity}, Gewicht ${entry.weight}`}>{entry.imageUrl ? <Image src={entry.imageUrl} alt={entry.name} fill sizes="90px" draggable={false} className="pointer-events-none object-cover" /> : null}<span className="absolute bottom-0 right-0 rounded-tl bg-black/75 px-1 text-[0.55rem] font-semibold text-white">×{entry.weight}</span></button>)}</div> : <div className="mt-3 grid min-h-20 place-items-center rounded-[7px] border border-dashed border-white/8 px-3 text-center text-xs leading-5 text-[#708087]">Karte aus dem Katalog hierher ziehen oder {rarity} aktivieren und anklicken.</div>}
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <Panel kicker="Kartendatenbank" title="Katalog" className={classes("custom-pack-panel order-3 !rounded-[9px] !p-3 xl:flex xl:min-h-0 xl:flex-col", mobileView !== "CATALOG" && "!hidden xl:!flex")}>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <label className="block"><span className="sr-only">Karte suchen</span><input className="ui-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name oder Setcode …" /></label>
              <div className="grid grid-cols-2 gap-1.5"><select className="ui-input h-9 py-1" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} aria-label="Kartentyp filtern"><option value="ALL">Alle Kartentypen</option><option value="MONSTER">Monster</option><option value="SPELL">Zauber</option><option value="TRAP">Fallen</option><option value="TOKEN">Token</option></select><select className="ui-input h-9 py-1" value={catalogSort} onChange={(event) => setCatalogSort(event.target.value as CardCatalogSort)} aria-label="Katalog sortieren"><option value="NAME_ASC">Name A–Z</option><option value="NAME_DESC">Name Z–A</option><option value="ATK_DESC">ATK absteigend</option><option value="NEWEST_SET">Neueste Sets</option></select></div>
              <div className="flex items-center justify-between text-[0.65rem] text-[#7f8e95]"><span>{catalogLoading ? "Lädt…" : `${catalogTotal} Ergebnisse`}</span><span>Aktiv: <strong className="text-teal-100">{activeRarity}</strong></span></div>
              <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-1.5 overflow-y-auto pr-1">
                {cards.map((card) => {
                  const assigned = pool.filter((entry) => entry.cardId === card.cardId).map((entry) => entry.rarity);
                  return <button key={card.cardId} type="button" draggable={canMutate} onDragStart={(event) => { const payload: PackCardDragPayload = { source: "catalog", cardId: card.cardId }; dragPayloadRef.current = payload; setDragPayload(event.dataTransfer, payload); event.dataTransfer.effectAllowed = "copyMove"; }} onDragEnd={handleDragEnd} onClick={() => addCard(card)} onContextMenu={(event) => { event.preventDefault(); setSelectedCatalogCard(card); setSelectedPoolKey(null); }} className="group min-w-0 text-left" disabled={!canMutate}><span className="relative block aspect-[59/86] overflow-hidden rounded-[5px] border border-white/10 bg-black/30 transition group-hover:border-teal-300/35">{card.imageUrl ? <Image src={card.imageUrl} alt={card.name} fill sizes="90px" draggable={false} className="pointer-events-none object-cover" /> : null}{assigned.length ? <span className="absolute bottom-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-teal-700 px-1 text-[0.58rem] font-bold text-white">{assigned.length}</span> : null}</span><span className="mt-1 block truncate text-[0.63rem] text-[#c3ced2]">{card.name}</span></button>;
                })}
              </div>
            </div>
          </Panel>
        </div>

        {(feedback || simulation) ? <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 bg-[#080d13] px-3 py-2 text-xs"><p role="status" aria-live="polite" className="text-[#c7d4d7]">{feedback}</p>{simulation ? <details className="relative"><summary className="cursor-pointer list-none font-semibold text-teal-100">Simulation anzeigen</summary><div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-50 grid max-h-[420px] w-[min(520px,90vw)] grid-cols-2 gap-4 overflow-y-auto rounded-[9px] border border-white/12 bg-[#0b1117] p-4 shadow-2xl"><div><p className="font-semibold">Seltenheiten</p>{simulation.rarityDistribution.map((item) => <div key={item.rarity} className="mt-2 flex justify-between gap-3 text-[#aebbc1]"><span>{item.rarity}</span><span>{formatPercentage(item.probability * 100)} %</span></div>)}</div><div><p className="font-semibold">Häufigste Karten</p>{simulation.cardDistribution.slice(0, 8).map((item) => <div key={item.cardId} className="mt-2 flex justify-between gap-3 text-[#aebbc1]"><span className="truncate">{item.name}</span><span>{formatPercentage(item.probability * 100)} %</span></div>)}</div></div></details> : null}</footer> : null}
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="create-pack-title" className="w-full max-w-md rounded-[11px] border border-white/12 bg-[#0b1117] p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h2 id="create-pack-title" className="text-lg font-semibold">Neues Custom Pack</h2><button type="button" onClick={() => setCreateOpen(false)} aria-label="Dialog schließen"><IconX size={19} /></button></div>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-semibold">Packname<input className="ui-input mt-1.5" value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
              <label className="text-sm font-semibold"><span className="flex items-center gap-1">Setcode <FieldHelp label="Setcode">Kurze, kampagnenweit eindeutige Kennung des Packs, zum Beispiel DHC-01.</FieldHelp></span><input className="ui-input mt-1.5 uppercase" value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} /></label>
              <label className="text-sm font-semibold"><span className="flex items-center gap-1">Era-Vorlage <FieldHelp label="Era-Vorlage">Lädt eine historische TCG-nahe Startverteilung. Alle Ziehgruppen und Chancen bleiben danach anpassbar.</FieldHelp></span><select className="ui-input mt-1.5" value={newEra} onChange={(event) => setNewEra(event.target.value as CustomPackEra)}>{Object.entries(ERA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="ui-button-neutral" onClick={() => setCreateOpen(false)}>Abbrechen</button><button type="button" className="ui-button-primary" disabled={pending || !newName.trim() || !newCode.trim()} onClick={() => void createPack()}>Entwurf erstellen</button></div>
          </div>
        </div>
      ) : null}
    </DuelConsoleScaffold>
  );
}
