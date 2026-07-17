"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { CardCatalogItem, CustomPackEra } from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { cardCatalogClient } from "@/lib/card-catalog-client";
import { customPackClient, type CustomPackRecord } from "@/lib/custom-pack-client";

const ERA_LABELS: Record<CustomPackEra, string> = {
  EARLY_TCG: "Frühes TCG",
  GX_5DS: "GX / 5D's",
  MODERN_CORE: "Modernes Core-Set",
  PROMO_CUSTOM: "Promo / freie Slots",
};

export function CustomPackStudio({ session, activeRun }: { session: ViewerSession; activeRun: PlayGroupRunDto }) {
  const [packs, setPacks] = useState<CustomPackRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("Duel Hub Custom Set");
  const [code, setCode] = useState("DHC-01");
  const [era, setEra] = useState<CustomPackEra>("EARLY_TCG");
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<CardCatalogItem[]>([]);
  const [pool, setPool] = useState<Array<{ cardId: string; setCardId: null; rarity: string; weight: number; name: string }>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Array<{ rarity: string; count: number; probability: number }>>([]);
  const [pending, setPending] = useState(false);

  const selected = useMemo(() => packs.find((pack) => pack.id === selectedId) ?? null, [packs, selectedId]);
  const version = selected?.versions.find((item) => item.status === "DRAFT") ?? selected?.versions[0] ?? null;

  function poolFromPack(pack: CustomPackRecord | null) {
    const currentVersion = pack?.versions.find((item) => item.status === "DRAFT") ?? pack?.versions[0];
    return currentVersion?.poolEntries.map((entry) => ({
      ...entry,
      setCardId: null as null,
      name: cards.find((card) => card.cardId === entry.cardId)?.name ?? entry.cardId,
    })) ?? [];
  }

  function selectPack(pack: CustomPackRecord) {
    setSelectedId(pack.id);
    setPool(poolFromPack(pack));
    setSimulation([]);
  }

  async function refreshPacks() {
    const data = await customPackClient.list(activeRun.id);
    setPacks(data);
    const next = data.find((pack) => pack.id === selectedId) ?? data[0] ?? null;
    setSelectedId(next?.id ?? null);
    setPool(poolFromPack(next));
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await customPackClient.list(activeRun.id);
      if (!mounted) return;
      const first = data[0] ?? null;
      setPacks(data);
      setSelectedId(first?.id ?? null);
      setPool(first?.versions[0]?.poolEntries.map((entry) => ({
        ...entry,
        setCardId: null as null,
        name: entry.cardId,
      })) ?? []);
    }
    void load().catch((error) => setFeedback(getApiErrorMessage(error, "Custom Packs konnten nicht geladen werden.")));
    return () => { mounted = false; };
  }, [activeRun.id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void cardCatalogClient.search({ q: search, ownership: "ALL", limit: 24 })
        .then((result) => setCards(result.items))
        .catch((error) => setFeedback(getApiErrorMessage(error, "Kartenkatalog konnte nicht geladen werden.")));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [activeRun.id, search]);

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
      setPool(poolFromPack(created));
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

  async function saveDraft() {
    if (!version || version.status !== "DRAFT") return;
    setPending(true);
    setFeedback(null);
    try {
      await customPackClient.update(activeRun.id, version.id, {
        poolEntries: pool.map(({ cardId, setCardId, rarity, weight }) => ({ cardId, setCardId, rarity, weight })),
        slots: version.slots,
      });
      await refreshPacks();
      setFeedback("Entwurf gespeichert.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Entwurf konnte nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  async function simulate() {
    if (!version) return;
    await saveDraft();
    try {
      const result = await customPackClient.simulate(activeRun.id, version.id, { iterations: 10_000, seed: "duel-hub-preview" });
      setSimulation(result.rarityDistribution);
      setFeedback("10.000 Packs deterministisch simuliert.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Simulation konnte nicht ausgeführt werden."));
    }
  }

  async function publish() {
    if (!version || version.status !== "DRAFT") return;
    await saveDraft();
    setPending(true);
    try {
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
    try {
      const result = await customPackClient.open(activeRun.id, version.id);
      setFeedback(`Pack geöffnet: ${result.pulls.length} Karten wurden deiner Kampagnensammlung hinzugefügt.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Pack konnte nicht geöffnet werden."));
    } finally {
      setPending(false);
    }
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
            <input className="ui-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Packname" />
            <input className="ui-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Setcode" />
            <select className="ui-input" value={era} onChange={(event) => setEra(event.target.value as CustomPackEra)}>
              {Object.entries(ERA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="ui-button-primary" type="button" disabled={pending} onClick={() => void createPack()}>Entwurf erstellen</button>
          </div>
          <div className="mt-6 space-y-2">
            {packs.map((pack) => (
              <button key={pack.id} type="button" onClick={() => selectPack(pack)} className={`w-full rounded-[16px] border px-4 py-3 text-left ${selectedId === pack.id ? "border-[#d0aa6e] bg-[rgba(208,170,110,0.1)]" : "border-white/10 bg-white/[0.025]"}`}>
                <span className="block font-semibold text-[#f0dfcc]">{pack.name}</span>
                <span className="mt-1 block text-xs text-[#baa58a]">{pack.code} · {pack.status}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel kicker="Gemeinsamer Katalog" title="Kartenpool">
          <input className="ui-input mb-4" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Karten suchen …" />
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
                  <div key={entry.cardId} className="grid grid-cols-[1fr_118px_auto] items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.025] px-3 py-2">
                    <span className="truncate text-sm text-[#f0dfcc]">{entry.name}</span>
                    <select className="ui-input !py-2 text-xs" value={entry.rarity} onChange={(event) => setPool((current) => current.map((item) => item.cardId === entry.cardId ? { ...item, rarity: event.target.value } : item))} disabled={version.status !== "DRAFT"}>
                      {["Common", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Promo"].map((rarity) => <option key={rarity}>{rarity}</option>)}
                    </select>
                    <button type="button" className="ui-button-neutral !px-3 !py-2" onClick={() => setPool((current) => current.filter((item) => item.cardId !== entry.cardId))} disabled={version.status !== "DRAFT"}>×</button>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="ui-button-neutral" type="button" disabled={pending || version.status !== "DRAFT"} onClick={() => void saveDraft()}>Speichern</button>
                <button className="ui-button-secondary" type="button" disabled={pending || version.status !== "DRAFT"} onClick={() => void simulate()}>10.000 simulieren</button>
                <button className="ui-button-primary" type="button" disabled={pending || version.status !== "DRAFT"} onClick={() => void publish()}>Veröffentlichen</button>
                {version.status === "PUBLISHED" ? (
                  <button className="ui-button-primary" type="button" disabled={pending} onClick={() => void openPublishedPack()}>Pack für {version.price} Credits öffnen</button>
                ) : null}
              </div>
              {simulation.length > 0 ? (
                <div className="mt-5 space-y-2">
                  {simulation.map((item) => <div key={item.rarity} className="flex justify-between text-sm text-[#d8c9b5]"><span>{item.rarity}</span><span>{(item.probability * 100).toFixed(2)}%</span></div>)}
                </div>
              ) : null}
            </>
          ) : <p className="text-sm leading-7 text-[#baa58a]">Erstelle links einen Entwurf. Danach kannst du alle Karten über den gemeinsamen Katalog hinzufügen.</p>}
          {feedback ? <p className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[#f0dfcc]">{feedback}</p> : null}
        </Panel>
      </div>
    </DuelConsoleScaffold>
  );
}
