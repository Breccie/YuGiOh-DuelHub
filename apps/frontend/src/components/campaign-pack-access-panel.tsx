"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type {
  CampaignPackAccessDto,
  PackAvailabilityStatus,
} from "@ygo/contracts";
import { getApiErrorMessage } from "@/lib/api-client";
import { runClient } from "@/lib/run-client";

type Draft = {
  availabilityStatus: PackAvailabilityStatus;
  price: string;
  displaySize: string;
  rewardOnly: boolean;
  availableFrom: string;
  availableUntil: string;
  reason: string;
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toDraft(item: CampaignPackAccessDto): Draft {
  return {
    availabilityStatus: item.availabilityStatus,
    price: item.price === null ? "" : String(item.price),
    displaySize: item.displaySize === null ? "" : String(item.displaySize),
    rewardOnly: item.rewardOnly,
    availableFrom: toLocalDateTime(item.availableFrom),
    availableUntil: toLocalDateTime(item.availableUntil),
    reason: item.statusReason ?? "Manuelle Kampagnensteuerung.",
  };
}

function statusLabel(item: CampaignPackAccessDto) {
  if (item.rewardOnly) return "Nur Belohnung";
  if (item.isAvailableNow) return "Verfügbar";
  if (item.availabilityStatus === "SCHEDULED") return "Geplant";
  return "Gesperrt";
}

export function CampaignPackAccessPanel({
  runId,
  canManage,
  onFeedback,
}: {
  runId: string;
  canManage: boolean;
  onFeedback: (message: string) => void;
}) {
  const [items, setItems] = useState<CampaignPackAccessDto[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"ALL" | "SET" | "CUSTOM">("ALL");
  const [status, setStatus] = useState<"ALL" | "AVAILABLE" | "LOCKED" | "SCHEDULED">("ALL");
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void runClient.listPackAccess(runId).then((payload) => {
      if (!mounted) return;
      setItems(payload.items);
      setDrafts(Object.fromEntries(payload.items.map((item) => [
        `${item.kind}:${item.productId}`,
        toDraft(item),
      ])));
      setLoading(false);
    }).catch((error) => {
      if (!mounted) return;
      setLoading(false);
      onFeedback(getApiErrorMessage(error, "Packzugriffe konnten nicht geladen werden."));
    });
    return () => { mounted = false; };
  }, [onFeedback, runId]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("de");
    return items.filter((item) => {
      if (kind !== "ALL" && item.kind !== kind) return false;
      if (status !== "ALL" && item.availabilityStatus !== status) return false;
      return !normalized
        || item.name.toLocaleLowerCase("de").includes(normalized)
        || item.code.toLocaleLowerCase("de").includes(normalized);
    });
  }, [items, kind, query, status]);
  const displayedItems = visibleItems.slice(0, visibleLimit);

  function updateDraft(key: string, update: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));
  }

  async function save(item: CampaignPackAccessDto) {
    const key = `${item.kind}:${item.productId}`;
    const draft = drafts[key];
    if (!draft?.reason.trim()) {
      onFeedback("Bitte gib eine kurze Begründung für die Änderung an.");
      return;
    }
    if (draft.availabilityStatus === "LOCKED"
      && item.availabilityStatus !== "LOCKED"
      && !window.confirm(`${item.name} für neue Öffnungen sperren? Bestehende Karten bleiben erhalten.`)) {
      return;
    }
    setPendingKey(key);
    try {
      const payload = await runClient.updatePackAccess(runId, {
        kind: item.kind,
        productId: item.productId,
        availabilityStatus: draft.availabilityStatus,
        availableFrom: draft.availableFrom
          ? new Date(draft.availableFrom).toISOString()
          : null,
        availableUntil: draft.availableUntil
          ? new Date(draft.availableUntil).toISOString()
          : null,
        price: draft.price === "" ? null : Number(draft.price),
        displaySize: null,
        rewardOnly: draft.rewardOnly,
        reason: draft.reason.trim(),
      });
      setItems(payload.items);
      setDrafts(Object.fromEntries(payload.items.map((nextItem) => [
        `${nextItem.kind}:${nextItem.productId}`,
        toDraft(nextItem),
      ])));
      onFeedback(`${item.name} wurde aktualisiert.`);
    } catch (error) {
      onFeedback(getApiErrorMessage(error, "Packzugriff konnte nicht gespeichert werden."));
    } finally {
      setPendingKey(null);
    }
  }

  if (loading) {
    return <div className="campaign-skeleton-list" aria-label="Packzugriffe werden geladen" />;
  }

  return (
    <div className="campaign-pack-manager">
      <div className="campaign-toolbar-grid">
        <label>
          <span>Pack suchen</span>
          <input
            className="ui-input mt-2"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setVisibleLimit(20); }}
            placeholder="Name oder Setcode"
          />
        </label>
        <label>
          <span>Typ</span>
          <select className="ui-input mt-2" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setVisibleLimit(20); }}>
            <option value="ALL">Alle Packs</option>
            <option value="SET">Offizielle Sets</option>
            <option value="CUSTOM">Custom Packs</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select className="ui-input mt-2" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setVisibleLimit(20); }}>
            <option value="ALL">Alle Zustände</option>
            <option value="AVAILABLE">Verfügbar</option>
            <option value="SCHEDULED">Geplant</option>
            <option value="LOCKED">Gesperrt</option>
          </select>
        </label>
      </div>

      <div className="campaign-pack-list">
        {displayedItems.map((item) => {
          const key = `${item.kind}:${item.productId}`;
          const draft = drafts[key] ?? toDraft(item);
          return (
            <article key={key} className="campaign-pack-row">
              <div className="campaign-pack-identity">
                <div className="campaign-pack-thumb">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-contain" unoptimized />
                  ) : null}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{item.name}</h3>
                    <span className={`campaign-status campaign-status-${item.availabilityStatus.toLowerCase()}`}>
                      {statusLabel(item)}
                    </span>
                  </div>
                  <p>{item.code} · {item.kind === "CUSTOM" ? "Custom Pack" : "Offizielles Set"}</p>
                </div>
              </div>

              <div className="campaign-pack-controls">
                <label>
                  <span>Zugriff</span>
                  <select disabled={!canManage} className="ui-input" value={draft.availabilityStatus} onChange={(event) => updateDraft(key, { availabilityStatus: event.target.value as PackAvailabilityStatus })}>
                    <option value="AVAILABLE">Sofort verfügbar</option>
                    <option value="SCHEDULED">Geplant</option>
                    <option value="LOCKED">Gesperrt</option>
                  </select>
                </label>
                <label>
                  <span>Preis</span>
                  <input disabled={!canManage} className="ui-input" inputMode="numeric" value={draft.price} onChange={(event) => updateDraft(key, { price: event.target.value })} placeholder="Standard" />
                </label>
                {item.kind === "SET" ? (
                  <label>
                    <span>Display (fest)</span>
                    <input disabled className="ui-input" value="24 Packs" readOnly />
                  </label>
                ) : null}
                <label className="campaign-pack-checkbox">
                  <input disabled={!canManage} type="checkbox" checked={draft.rewardOnly} onChange={(event) => updateDraft(key, { rewardOnly: event.target.checked })} />
                  <span>Nur Belohnung</span>
                </label>
              </div>

              {draft.availabilityStatus === "SCHEDULED" ? (
                <div className="campaign-pack-controls campaign-pack-schedule">
                  <label><span>Verfügbar ab</span><input disabled={!canManage} className="ui-input" type="datetime-local" value={draft.availableFrom} onChange={(event) => updateDraft(key, { availableFrom: event.target.value })} /></label>
                  <label><span>Optional bis</span><input disabled={!canManage} className="ui-input" type="datetime-local" value={draft.availableUntil} onChange={(event) => updateDraft(key, { availableUntil: event.target.value })} /></label>
                </div>
              ) : null}

              {canManage ? (
                <div className="campaign-pack-footer">
                  <input className="ui-input" value={draft.reason} onChange={(event) => updateDraft(key, { reason: event.target.value })} placeholder="Begründung" />
                  <button type="button" className="ui-button-primary" disabled={pendingKey === key} onClick={() => void save(item)}>
                    {pendingKey === key ? "Speichert…" : "Übernehmen"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {visibleItems.length === 0 ? (
          <div className="ui-empty p-6">Keine Packs für diese Filter gefunden.</div>
        ) : null}
        {visibleItems.length > displayedItems.length ? (
          <button type="button" className="ui-button-secondary justify-self-center" onClick={() => setVisibleLimit((current) => current + 20)}>
            Weitere {Math.min(20, visibleItems.length - displayedItems.length)} Packs anzeigen
          </button>
        ) : null}
      </div>
    </div>
  );
}
