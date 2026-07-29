"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CardCatalogItem, CustomPackEra } from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { cardCatalogClient } from "@/lib/card-catalog-client";
import {
  customPackClient,
  type CustomPackRecord,
  type CustomPackTemplateRecord,
} from "@/lib/custom-pack-client";

const ERA_LABELS: Record<CustomPackEra, string> = {
  EARLY_TCG: "Frühes TCG",
  GX_5DS: "GX / 5D's",
  MODERN_CORE: "Modernes Core-Set",
  PROMO_CUSTOM: "Promo / freie Slots",
};
const PACK_RARITIES = ["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Promo"] as const;

type CustomPackPoolItem = {
  cardId: string;
  setCardId: string | null;
  rarity: string;
  weight: number;
  name: string;
};

type CustomPackSlotItem = {
  slotIndex: number;
  count: number;
  allowedRarities: string[];
  weight: number;
};

type PendingPackAction =
  | { type: "select"; packId: string }
  | { type: "create" };

function getDraftSignature(
  pool: CustomPackPoolItem[],
  slots: CustomPackSlotItem[],
) {
  return JSON.stringify({
    pool: pool
      .map(({ cardId, setCardId, rarity, weight }) => ({ cardId, setCardId, rarity, weight }))
      .sort((left, right) => left.cardId.localeCompare(right.cardId)),
    slots: slots
      .map((slot) => ({
        ...slot,
        allowedRarities: [...slot.allowedRarities].sort(),
      }))
      .sort((left, right) => left.slotIndex - right.slotIndex),
  });
}

function getVersionFromPack(pack: CustomPackRecord | null) {
  return pack?.versions.find((item) => item.status === "DRAFT")
    ?? pack?.versions[0]
    ?? null;
}

function getPoolFromPack(
  pack: CustomPackRecord | null,
  catalogCards: CardCatalogItem[],
): CustomPackPoolItem[] {
  const currentVersion = getVersionFromPack(pack);
  return currentVersion?.poolEntries.map((entry) => ({
    cardId: entry.cardId,
    setCardId: entry.setCardId,
    rarity: entry.rarity,
    weight: entry.weight,
    name: entry.card?.name
      ?? catalogCards.find((card) => card.cardId === entry.cardId)?.name
      ?? "Unbekannte Karte",
  })) ?? [];
}

export function CustomPackStudio({ session, activeRun }: { session: ViewerSession; activeRun: PlayGroupRunDto }) {
  const canEdit =
    activeRun.viewerRole === "OWNER" || activeRun.viewerRole === "ORGANIZER";
  const [packs, setPacks] = useState<CustomPackRecord[]>([]);
  const [templates, setTemplates] = useState<CustomPackTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("Duel Hub Custom Set");
  const [code, setCode] = useState("DHC-01");
  const [era, setEra] = useState<CustomPackEra>("EARLY_TCG");
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<CardCatalogItem[]>([]);
  const [pool, setPool] = useState<CustomPackPoolItem[]>([]);
  const [slots, setSlots] = useState<CustomPackSlotItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Array<{ rarity: string; count: number; probability: number }>>([]);
  const [pending, setPending] = useState(false);
  const [pendingPackAction, setPendingPackAction] = useState<PendingPackAction | null>(null);
  const catalogRequestRef = useRef(0);
  const openIntentRef = useRef<{ versionId: string; idempotencyKey: string } | null>(null);
  const packSwitchDialogRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => packs.find((pack) => pack.id === selectedId) ?? null, [packs, selectedId]);
  const version = canEdit
    ? selected?.versions.find((item) => item.status === "DRAFT") ?? selected?.versions[0] ?? null
    : selected?.versions.find((item) => item.status === "PUBLISHED") ?? null;
  const savedDraftSignature = useMemo(() => {
    if (!selected || !version || version.status !== "DRAFT") return null;
    return getDraftSignature(getPoolFromPack(selected, cards), version.slots);
  }, [cards, selected, version]);
  const isDraftDirty = Boolean(
    savedDraftSignature && savedDraftSignature !== getDraftSignature(pool, slots),
  );

  function selectPack(pack: CustomPackRecord) {
    setSelectedId(pack.id);
    setPool(getPoolFromPack(pack, cards));
    setSlots(getVersionFromPack(pack)?.slots ?? []);
    setSimulation([]);
    openIntentRef.current = null;
  }

  function requestSelectPack(pack: CustomPackRecord) {
    if (pack.id === selectedId || pending) return;
    if (isDraftDirty) {
      setPendingPackAction({ type: "select", packId: pack.id });
      return;
    }
    selectPack(pack);
  }

  async function refreshPacks(preferredSelectedId = selectedId) {
    const listed = await customPackClient.list(activeRun.id);
    const data = canEdit
      ? listed
      : listed.filter((pack) =>
          pack.versions.some((item) => item.status === "PUBLISHED"),
        );
    setPacks(data);
    const next = data.find((pack) => pack.id === preferredSelectedId) ?? data[0] ?? null;
    setSelectedId(next?.id ?? null);
    setPool(getPoolFromPack(next, cards));
    setSlots(getVersionFromPack(next)?.slots ?? []);
  }

  useEffect(() => {
    if (!pendingPackAction) return;
    packSwitchDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [pendingPackAction]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [listed, templateData] = await Promise.all([
        customPackClient.list(activeRun.id),
        canEdit ? customPackClient.listTemplates() : Promise.resolve([]),
      ]);
      if (!mounted) return;
      const data = canEdit
        ? listed
        : listed.filter((pack) =>
            pack.versions.some((item) => item.status === "PUBLISHED"),
          );
      const first = data[0] ?? null;
      setPacks(data);
      setSelectedId(first?.id ?? null);
      setPool(getPoolFromPack(first, []));
      setSlots(getVersionFromPack(first)?.slots ?? []);
      setTemplates(templateData);
    }
    void load().catch((error) => setFeedback(getApiErrorMessage(error, "Custom Packs konnten nicht geladen werden.")));
    return () => { mounted = false; };
  }, [activeRun.id, canEdit]);

  useEffect(() => {
    if (!canEdit) return;
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    const timeout = window.setTimeout(() => {
      void cardCatalogClient.search({ q: search, ownership: "ALL", limit: 24 })
        .then((result) => {
          if (catalogRequestRef.current !== requestId) return;
          setCards(result.items);
        })
        .catch((error) => {
          if (catalogRequestRef.current === requestId) {
            setFeedback(getApiErrorMessage(error, "Kartenkatalog konnte nicht geladen werden."));
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      if (catalogRequestRef.current === requestId) catalogRequestRef.current += 1;
    };
  }, [activeRun.id, canEdit, search]);

  function requestCreatePack() {
    if (pending) return;
    if (isDraftDirty) {
      setPendingPackAction({ type: "create" });
      return;
    }
    void createPack();
  }

  async function createPack() {
    setPending(true);
    setFeedback(null);
    try {
      const created = await customPackClient.create(activeRun.id, {
        name,
        code,
        era,
        packSize: era === "PROMO_CUSTOM" ? 1 : 9,
        displaySize: 24,
        price: 100,
      });
      await refreshPacks();
      setSelectedId(created.id);
      setPool(getPoolFromPack(created, cards));
      setSlots(getVersionFromPack(created)?.slots ?? []);
      setFeedback("Custom-Pack-Entwurf erstellt. Füge jetzt Karten zum Rarity-Pool hinzu.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Custom Pack konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  function addCard(card: CardCatalogItem) {
    setPool((current) => current.some((entry) => entry.cardId === card.cardId)
      ? current
      : [...current, {
          cardId: card.cardId,
          setCardId: null,
          rarity: card.rarities[0] ?? "Common",
          weight: 1,
          name: card.name,
        }]);
  }

  async function persistDraft(preferredSelectedId = selectedId) {
    if (!version || version.status !== "DRAFT") {
      throw new Error("Es ist kein bearbeitbarer Entwurf ausgewählt.");
    }
    await customPackClient.update(activeRun.id, version.id, {
      poolEntries: pool.map(({ cardId, setCardId, rarity, weight }) => ({ cardId, setCardId, rarity, weight })),
      slots,
    });
    await refreshPacks(preferredSelectedId);
  }

  async function saveAndContinuePackAction() {
    const action = pendingPackAction;
    if (!action) return;
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft(action.type === "select" ? action.packId : selectedId);
      setPendingPackAction(null);
      if (action.type === "create") {
        await createPack();
      } else {
        setFeedback("Entwurf gespeichert und Pack gewechselt.");
      }
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Entwurf konnte vor dem Packwechsel nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  function discardAndContinuePackAction() {
    const action = pendingPackAction;
    if (!action || pending) return;
    setPendingPackAction(null);
    if (action.type === "create") {
      void createPack();
      return;
    }
    const target = packs.find((pack) => pack.id === action.packId);
    if (target) selectPack(target);
  }

  async function saveDraft() {
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft();
      setFeedback("Entwurf gespeichert.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Entwurf konnte nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  async function simulate() {
    if (!version) return;
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft();
      const result = await customPackClient.simulate(activeRun.id, version.id, { iterations: 10_000, seed: "duel-hub-preview" });
      setSimulation(result.rarityDistribution);
      setFeedback("10.000 Packs deterministisch simuliert.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Simulation konnte nicht ausgeführt werden."));
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (!version || version.status !== "DRAFT") return;
    setPending(true);
    setFeedback(null);
    try {
      await persistDraft();
      await customPackClient.publish(activeRun.id, version.id);
      await refreshPacks();
      setFeedback("Packversion veröffentlicht und für diese Kampagne freigeschaltet.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Packversion konnte nicht veröffentlicht werden."));
    } finally {
      setPending(false);
    }
  }

  async function openPublishedPack() {
    if (!version || version.status !== "PUBLISHED") return;
    setPending(true);
    setFeedback(null);
    try {
      const intent = openIntentRef.current?.versionId === version.id
        ? openIntentRef.current
        : { versionId: version.id, idempotencyKey: window.crypto.randomUUID() };
      openIntentRef.current = intent;
      const result = await customPackClient.open(activeRun.id, version.id, {
        idempotencyKey: intent.idempotencyKey,
      });
      openIntentRef.current = null;
      setFeedback(`Pack geöffnet: ${result.pulls.length} Karten wurden deiner Kampagnensammlung hinzugefügt.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Pack konnte nicht geöffnet werden."));
    } finally {
      setPending(false);
    }
  }

  async function createNextDraft() {
    if (!version || version.status !== "PUBLISHED") return;
    setPending(true);
    setFeedback(null);
    try {
      await customPackClient.nextDraft(activeRun.id, version.id);
      await refreshPacks();
      setFeedback("Neue bearbeitbare Packversion erstellt.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Neue Packversion konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  async function saveAsTemplate() {
    if (!selected) return;
    setPending(true);
    setFeedback(null);
    try {
      const created = await customPackClient.createTemplate(
        activeRun.id,
        selected.id,
        selected.name,
      );
      setTemplates((current) => [
        created,
        ...current.filter((template) => template.id !== created.id),
      ]);
      setFeedback(`„${created.name}“ wurde als private Vorlage gespeichert.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Packvorlage konnte nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  async function copyTemplate(template: CustomPackTemplateRecord) {
    setPending(true);
    setFeedback(null);
    try {
      const copied = await customPackClient.copyTemplate(activeRun.id, template.id);
      await refreshPacks(copied.id);
      setFeedback(`Vorlage „${template.name}“ wurde in diese Kampagne kopiert.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Packvorlage konnte nicht kopiert werden."));
    } finally {
      setPending(false);
    }
  }

  if (!canEdit) {
    return (
      <DuelConsoleScaffold
        activePath="/packs"
        viewer={{ displayName: session.displayName, duelistId: session.duelistId }}
        metrics={[
          { icon: "package", label: "Verfügbare Packs", value: String(packs.length) },
          { icon: "shield", label: "Kampagne", value: activeRun.name },
        ]}
      >
        <Panel kicker="Kampagnen-Packs" title="Veröffentlichte Custom Packs">
          <p className="max-w-2xl text-sm leading-6 text-[#aab6bd]">
            Hier siehst du nur veröffentlichte Packs. Entwürfe und
            Bearbeitungswerkzeuge sind Ownern und Organizern vorbehalten.
          </p>
          {feedback ? (
            <p role="status" className="mt-4 rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-[#dce5e8]">
              {feedback}
            </p>
          ) : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {packs.length ? (
              packs.map((pack) => {
                const publishedVersion = pack.versions.find(
                  (item) => item.status === "PUBLISHED",
                );
                return (
                  <button
                    key={pack.id}
                    type="button"
                    className={`rounded-[8px] border p-4 text-left transition ${
                      selectedId === pack.id
                        ? "border-[rgba(88,163,169,0.48)] bg-[rgba(58,118,124,0.15)]"
                        : "border-white/10 bg-white/[0.025] hover:border-white/20"
                    }`}
                    onClick={() => selectPack(pack)}
                    disabled={pending}
                  >
                    <span className="block text-sm font-semibold text-[#f1e9df]">
                      {pack.name}
                    </span>
                    <span className="mt-1 block text-xs text-[#98a7b0]">
                      {pack.code} · {publishedVersion?.packSize ?? 0} Karten ·{" "}
                      {publishedVersion?.price ?? 0} Credits
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="ui-empty rounded-[8px] p-4 text-sm">
                Noch keine veröffentlichten Custom Packs.
              </div>
            )}
          </div>
          {version ? (
            <button
              type="button"
              className="ui-button-primary mt-5"
              disabled={pending}
              onClick={() => void openPublishedPack()}
            >
              {pending ? "Pack wird geöffnet…" : `Pack für ${version.price} Credits öffnen`}
            </button>
          ) : null}
        </Panel>
      </DuelConsoleScaffold>
    );
  }

  return (
    <DuelConsoleScaffold
      activePath="/packs"
      viewer={{ displayName: session.displayName, duelistId: session.duelistId }}
      metrics={[
        { icon: "package", label: "Custom Packs", value: String(packs.length) },
        { icon: "shield", label: "Kampagne", value: activeRun.name },
        { icon: "grid", label: "Pool", value: String(pool.length) },
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.45fr_1fr]">
        <Panel kicker="Sandbox" title="Pack anlegen">
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm font-semibold text-[#f0dfcc]">
              Packname
              <input className="ui-input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#f0dfcc]">
              Setcode
              <input className="ui-input" value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#f0dfcc]">
              Era-Vorlage
              <select className="ui-input" value={era} onChange={(event) => setEra(event.target.value as CustomPackEra)}>
                {Object.entries(ERA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="ui-button-primary" type="button" disabled={pending} onClick={requestCreatePack}>Entwurf erstellen</button>
          </div>
          <div className="mt-6 space-y-2">
            {packs.map((pack) => (
              <button key={pack.id} type="button" disabled={pending} onClick={() => requestSelectPack(pack)} className={`w-full rounded-[16px] border px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${selectedId === pack.id ? "border-[#d0aa6e] bg-[rgba(208,170,110,0.1)]" : "border-white/10 bg-white/[0.025]"}`}>
                <span className="block font-semibold text-[#f0dfcc]">{pack.name}</span>
                <span className="mt-1 block text-xs text-[#baa58a]">{pack.code} · {pack.status}</span>
              </button>
            ))}
          </div>
          {pendingPackAction ? (
            <div
              ref={packSwitchDialogRef}
              role="alertdialog"
              aria-labelledby="pack-switch-title"
              aria-describedby="pack-switch-description"
              className="mt-4 rounded-[16px] border border-[rgba(214,164,92,0.32)] bg-[rgba(150,97,33,0.16)] p-4"
            >
              <p id="pack-switch-title" className="font-semibold text-[#ffe3bd]">
                Ungespeicherte Packänderungen
              </p>
              <p id="pack-switch-description" className="mt-1 text-sm leading-6 text-[#d8c1a3]">
                Speichere den aktuellen Entwurf, bevor du {pendingPackAction.type === "create" ? "ein neues Pack erstellst" : "zu einem anderen Pack wechselst"}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="ui-button-secondary" disabled={pending} onClick={() => void saveAndContinuePackAction()}>
                  Speichern und fortfahren
                </button>
                <button type="button" className="ui-button-danger" disabled={pending} onClick={discardAndContinuePackAction}>
                  Verwerfen und fortfahren
                </button>
                <button type="button" className="ui-button-neutral" disabled={pending} onClick={() => setPendingPackAction(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#f0dfcc]">Private Vorlagen</p>
                <p className="mt-1 text-xs text-[#baa58a]">Accountgebunden und in andere Kampagnen kopierbar.</p>
              </div>
              <button
                type="button"
                className="ui-button-neutral"
                disabled={!selected || pending}
                onClick={() => void saveAsTemplate()}
              >
                Aktuelles Pack speichern
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-white/10 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#f0dfcc]">{template.name}</p>
                    <p className="mt-1 text-xs text-[#baa58a]">{template.era}</p>
                  </div>
                  <button
                    type="button"
                    className="ui-button-secondary !px-3 !py-2"
                    disabled={pending}
                    onClick={() => void copyTemplate(template)}
                  >
                    Kopieren
                  </button>
                </div>
              ))}
              {templates.length === 0 ? (
                <p className="text-xs text-[#baa58a]">Noch keine private Vorlage gespeichert.</p>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel kicker="Gemeinsamer Katalog" title="Kartenpool">
          <label className="mb-4 grid gap-2 text-sm font-semibold text-[#f0dfcc]">
            Karten suchen
            <input className="ui-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name oder Setcode …" />
          </label>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {cards.map((card) => (
              <button key={card.cardId} type="button" className="group text-left" onClick={() => addCard(card)} disabled={!version || version.status !== "DRAFT"}>
                <div className="relative aspect-[59/86] overflow-hidden rounded-[8px] border border-white/10 bg-black/30">
                  {card.imageUrl ? <Image src={card.imageUrl} alt={card.name} fill sizes="120px" className="object-cover transition group-hover:scale-[1.03]" /> : null}
                </div>
                <span className="mt-1 block truncate text-xs text-[#d8c9b5]">{card.name}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel kicker="Packversion" title={selected?.name ?? "Entwurf wählen"}>
          {version ? (
            <>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={version.status === "PUBLISHED" ? "teal" : "gold"}>v{version.version} {version.status}</StatusPill>
                <StatusPill>{version.packSize} Karten</StatusPill>
              </div>
              <div className="mt-5 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                {pool.map((entry) => (
                  <div key={entry.cardId} className="grid grid-cols-[minmax(0,1fr)_112px_76px_auto] items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.025] px-3 py-2">
                    <span className="truncate text-sm text-[#f0dfcc]">{entry.name}</span>
                    <select aria-label={`Seltenheit für ${entry.name}`} className="ui-input !py-2 text-xs" value={entry.rarity} onChange={(event) => setPool((current) => current.map((item) => item.cardId === entry.cardId ? { ...item, rarity: event.target.value } : item))} disabled={version.status !== "DRAFT"}>
                      {PACK_RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}
                    </select>
                    <input
                      aria-label={`Gewicht für ${entry.name}`}
                      className="ui-input !px-2 !py-2 text-xs"
                      type="number"
                      min={1}
                      max={1_000_000}
                      value={entry.weight}
                      onChange={(event) => setPool((current) => current.map((item) => item.cardId === entry.cardId
                        ? { ...item, weight: Math.max(1, Number.parseInt(event.target.value, 10) || 1) }
                        : item))}
                      disabled={version.status !== "DRAFT"}
                    />
                    <button type="button" aria-label={`${entry.name} aus dem Kartenpool entfernen`} className="ui-button-neutral !px-3 !py-2" onClick={() => setPool((current) => current.filter((item) => item.cardId !== entry.cardId))} disabled={version.status !== "DRAFT"}>×</button>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-3 rounded-[16px] border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#f0dfcc]">Slotkonfiguration</p>
                    <p className="mt-1 text-xs leading-5 text-[#baa58a]">Die erste Seltenheit hat Basisgewicht 100; das Upgrade-Gewicht gilt jeweils für alle weiteren Seltenheiten.</p>
                  </div>
                  <StatusPill tone={slots.reduce((sum, slot) => sum + slot.count, 0) === version.packSize ? "teal" : "ember"}>
                    {slots.reduce((sum, slot) => sum + slot.count, 0)}/{version.packSize} Karten
                  </StatusPill>
                </div>
                {slots.map((slot) => (
                  <div key={slot.slotIndex} className="rounded-[14px] border border-white/10 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="grid gap-1 text-xs text-[#baa58a]">
                        Anzahl
                        <input className="ui-input !py-2" type="number" min={1} max={100} value={slot.count} disabled={version.status !== "DRAFT"} onChange={(event) => setSlots((current) => current.map((item) => item.slotIndex === slot.slotIndex ? { ...item, count: Math.max(1, Number.parseInt(event.target.value, 10) || 1) } : item))} />
                      </label>
                      <label className="grid gap-1 text-xs text-[#baa58a]">
                        Upgrade-Gewicht
                        <input className="ui-input !py-2" type="number" min={1} max={1_000_000} value={slot.weight} disabled={version.status !== "DRAFT"} onChange={(event) => setSlots((current) => current.map((item) => item.slotIndex === slot.slotIndex ? { ...item, weight: Math.max(1, Number.parseInt(event.target.value, 10) || 1) } : item))} />
                      </label>
                      <button type="button" className="ui-button-neutral self-end !px-3 !py-2" aria-label={`Slot ${slot.slotIndex + 1} entfernen`} disabled={version.status !== "DRAFT" || slots.length === 1} onClick={() => setSlots((current) => current.filter((item) => item.slotIndex !== slot.slotIndex))}>×</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {PACK_RARITIES.map((rarity) => {
                        const selected = slot.allowedRarities.includes(rarity);
                        return (
                          <button
                            key={rarity}
                            type="button"
                            aria-pressed={selected}
                            disabled={version.status !== "DRAFT" || (selected && slot.allowedRarities.length === 1)}
                            className={`rounded-full border px-2.5 py-1 text-[0.68rem] ${selected ? "border-[rgba(88,163,169,0.34)] bg-[rgba(58,118,124,0.2)] text-[#d5f5f3]" : "border-white/10 text-[#baa58a]"}`}
                            onClick={() => setSlots((current) => current.map((item) => item.slotIndex === slot.slotIndex
                              ? { ...item, allowedRarities: selected ? item.allowedRarities.filter((value) => value !== rarity) : [...item.allowedRarities, rarity] }
                              : item))}
                          >
                            {rarity}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {version.status === "DRAFT" ? (
                  <button type="button" className="ui-button-neutral w-full" onClick={() => setSlots((current) => [...current, { slotIndex: Math.max(-1, ...current.map((slot) => slot.slotIndex)) + 1, count: 1, allowedRarities: ["Common"], weight: 1 }])}>
                    Slot hinzufügen
                  </button>
                ) : null}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {version.status === "DRAFT" ? (
                  <>
                    <button className="ui-button-neutral disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={pending} onClick={() => void saveDraft()}>Speichern</button>
                    <button className="ui-button-secondary disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={pending} onClick={() => void simulate()}>10.000 simulieren</button>
                    <button className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={pending} onClick={() => void publish()}>Veröffentlichen</button>
                  </>
                ) : (
                  <>
                    <button className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={pending} onClick={() => void openPublishedPack()}>Pack für {version.price} Credits öffnen</button>
                    <button className="ui-button-secondary disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={pending} onClick={() => void createNextDraft()}>Neue Version bearbeiten</button>
                  </>
                )}
              </div>
              {simulation.length > 0 ? (
                <div className="mt-5 space-y-2">
                  {simulation.map((item) => <div key={item.rarity} className="flex justify-between text-sm text-[#d8c9b5]"><span>{item.rarity}</span><span>{(item.probability * 100).toFixed(2)}%</span></div>)}
                </div>
              ) : null}
            </>
          ) : <p className="text-sm leading-7 text-[#baa58a]">Erstelle links einen Entwurf. Danach kannst du alle Karten über den gemeinsamen Katalog hinzufügen.</p>}
          {feedback ? <p role="status" aria-live="polite" className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[#f0dfcc]">{feedback}</p> : null}
        </Panel>
      </div>
    </DuelConsoleScaffold>
  );
}
