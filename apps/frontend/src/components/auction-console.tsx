"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuctionOverviewDto } from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import {
  apiGetJson,
  apiPostJson,
  getApiErrorMessage,
} from "@/lib/api-client";

function formatCredits(value: number) {
  return `${new Intl.NumberFormat("de-DE").format(value)} Credits`;
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDeadline(value: string, now: number) {
  const remaining = new Date(value).getTime() - now;
  if (remaining <= 0) return "Beendet";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `noch ${minutes} Min.`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `noch ${hours} Std.`;
  return `noch ${Math.ceil(hours / 24)} Tage`;
}

export function AuctionConsole() {
  const [data, setData] = useState<AuctionOverviewDto | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [startingBid, setStartingBid] = useState("100");
  const [minIncrement, setMinIncrement] = useState("10");
  const [endsAt, setEndsAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000))
  );
  const [bidDrafts, setBidDrafts] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    const payload = await apiGetJson<AuctionOverviewDto>("/api/auctions", {
      cache: "no-store",
    });
    setData(payload);
    setSelectedEntryId((current) =>
      payload.availableCards.some((card) => card.collectionEntryId === current)
        ? current
        : payload.availableCards[0]?.collectionEntryId ?? ""
    );
    setBidDrafts((current) => {
      const next = { ...current };
      for (const auction of payload.auctions) {
        next[auction.id] ??= String(auction.minimumNextBid);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setNow(Date.now());
      void refresh().catch((cause) =>
        setError(getApiErrorMessage(cause, "Auktionen konnten nicht geladen werden."))
      );
    });
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const openAuctions = useMemo(
    () => data?.auctions.filter((auction) => auction.status === "OPEN") ?? [],
    [data],
  );
  const historyAuctions = useMemo(
    () => data?.auctions.filter((auction) => auction.status !== "OPEN") ?? [],
    [data],
  );

  async function runMutation(key: string, operation: () => Promise<unknown>, success: string) {
    setPendingKey(key);
    setError(null);
    setMessage(null);
    try {
      await operation();
      await refresh();
      setMessage(success);
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Auktion konnte nicht aktualisiert werden."));
    } finally {
      setPendingKey(null);
    }
  }

  async function createListing() {
    const parsedStart = Number(startingBid);
    const parsedIncrement = Number(minIncrement);
    if (!selectedEntryId || !Number.isInteger(parsedStart) || !Number.isInteger(parsedIncrement)) {
      setError("Bitte Karte, Startgebot und Mindestschritt vollständig angeben.");
      return;
    }
    await runMutation(
      "create",
      () => apiPostJson("/api/auctions", {
        collectionEntryId: selectedEntryId,
        startingBid: parsedStart,
        minIncrement: parsedIncrement,
        endsAt: new Date(endsAt).toISOString(),
      }),
      "Auktion wurde eröffnet und die Kartenkopie reserviert.",
    );
  }

  const viewer = data?.viewer ?? {
    userId: "loading",
    displayName: "Wird geladen",
    duelistId: "",
  };

  return (
    <DuelConsoleScaffold
      activePath="/trade"
      viewer={{ displayName: viewer.displayName, duelistId: viewer.duelistId }}
      metrics={[
        { icon: "cart", label: "Frei", value: data ? formatCredits(data.wallet.availableBalance) : "…" },
        { icon: "hourglass", label: "Offen", value: String(openAuctions.length) },
        { icon: "nav-trade", label: "Reserviert", value: data ? formatCredits(data.wallet.reservedBalance) : "…" },
      ]}
    >
      <section className="pt-4">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="ui-kicker">Kampagnenhandel</p>
            <h1 className="mt-3 font-display text-4xl text-[#f2dfc5] sm:text-5xl">Kartenauktionen</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c9b59c]">
              Physische Kartenkopien werden während der Laufzeit gesperrt. Gebote reservieren
              Credits und werden beim Abschluss gemeinsam mit der Karte atomar übertragen.
            </p>
          </div>
          <Link href="/trade" className="ui-button ui-button-secondary">Direkte Trades</Link>
        </div>

        {error ? <div role="alert" className="mt-5 rounded-lg border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        {message ? <div role="status" className="mt-5 rounded-lg border border-teal-400/25 bg-teal-950/45 px-4 py-3 text-sm text-teal-100">{message}</div> : null}

        {data && !data.auctionsEnabled ? (
          <Panel className="mt-6" kicker="Kampagnenregel" title="Auktionen sind deaktiviert">
            <p className="text-sm leading-7 text-[#c9b59c]">
              Owner können unter Kampagneneinstellungen Credit-Trades und den Modus
              „AUCTION“ aktivieren.
            </p>
          </Panel>
        ) : null}

        {data?.auctionsEnabled ? (
          <Panel className="mt-6" kicker="Neue Auktion" title="Kartenkopie anbieten">
            <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_160px_160px_220px_auto] lg:items-end">
              <label>
                <span className="ui-label">Karte</span>
                <select className="ui-input mt-2" value={selectedEntryId} onChange={(event) => setSelectedEntryId(event.target.value)}>
                  {data.availableCards.length === 0 ? <option value="">Keine freie Kartenkopie</option> : null}
                  {data.availableCards.map((card) => (
                    <option key={card.collectionEntryId} value={card.collectionEntryId}>
                      {card.name}{card.rarity ? ` · ${card.rarity}` : ""}{card.setCode ? ` · ${card.setCode}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label><span className="ui-label">Startgebot</span><input className="ui-input mt-2" type="number" min={1} value={startingBid} onChange={(event) => setStartingBid(event.target.value)} /></label>
              <label><span className="ui-label">Gebotsschritt</span><input className="ui-input mt-2" type="number" min={1} value={minIncrement} onChange={(event) => setMinIncrement(event.target.value)} /></label>
              <label><span className="ui-label">Endet am</span><input className="ui-input mt-2" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
              <button type="button" className="ui-button ui-button-primary" disabled={pendingKey !== null || !selectedEntryId} onClick={() => void createListing()}>
                {pendingKey === "create" ? "Erstelle …" : "Auktion starten"}
              </button>
            </div>
          </Panel>
        ) : null}

        <Panel className="mt-6" kicker="Marktplatz" title="Offene Auktionen">
          {data === null ? <p className="text-sm text-[#bca990]">Auktionen werden geladen …</p> : null}
          {data && openAuctions.length === 0 ? <p className="text-sm text-[#bca990]">Aktuell gibt es keine offenen Auktionen.</p> : null}
          <div className="grid gap-4 xl:grid-cols-2">
            {openAuctions.map((auction) => (
              <article key={auction.id} className="grid gap-4 rounded-xl border border-white/10 bg-black/25 p-4 sm:grid-cols-[112px_1fr]">
                <div className="aspect-[59/86] rounded-lg border border-white/10 bg-cover bg-center shadow-xl" style={{ backgroundImage: auction.card.imageUrl ? `url("${auction.card.imageUrl}")` : undefined }} aria-label={`Kartenbild ${auction.card.name}`} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h2 className="text-lg font-semibold text-[#f3e2cc]">{auction.card.name}</h2><p className="mt-1 text-xs text-[#a9957d]">{auction.card.setCode ?? "Unbekanntes Set"} · {auction.card.rarity ?? "Standard"}</p></div>
                    <StatusPill tone={new Date(auction.endsAt).getTime() <= now ? "ember" : "gold"}>{formatDeadline(auction.endsAt, now)}</StatusPill>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="block text-xs text-[#9e8a72]">Aktuelles Gebot</span><strong className="text-[#f0d4a3]">{formatCredits(auction.currentBid ?? auction.startingBid)}</strong></div>
                    <div><span className="block text-xs text-[#9e8a72]">Gebote</span><strong className="text-[#eadac5]">{auction.bidCount}</strong></div>
                    <div className="col-span-2"><span className="block text-xs text-[#9e8a72]">Verkäufer</span><span className="text-[#d8c4aa]">{auction.seller.displayName}</span></div>
                  </div>
                  {auction.canBid ? (
                    <div className="mt-4 flex gap-2">
                      <input className="ui-input min-w-0 flex-1" type="number" min={auction.minimumNextBid} value={bidDrafts[auction.id] ?? auction.minimumNextBid} onChange={(event) => setBidDrafts((current) => ({ ...current, [auction.id]: event.target.value }))} aria-label={`Gebot für ${auction.card.name}`} />
                      <button type="button" className="ui-button ui-button-primary" disabled={pendingKey !== null} onClick={() => void runMutation(`bid:${auction.id}`, () => apiPostJson(`/api/auctions/${auction.id}/bids`, { amount: Number(bidDrafts[auction.id] ?? auction.minimumNextBid) }), "Gebot wurde reserviert.")}>{pendingKey === `bid:${auction.id}` ? "Biete …" : "Bieten"}</button>
                    </div>
                  ) : null}
                  {auction.isHighestBidder ? <p className="mt-3 text-xs font-semibold text-teal-200">Du führst diese Auktion.</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {auction.canSettle ? <button type="button" className="ui-button ui-button-primary" disabled={pendingKey !== null} onClick={() => void runMutation(`settle:${auction.id}`, () => apiPostJson(`/api/auctions/${auction.id}/decision`, { action: "settle" }), "Auktion wurde atomar abgeschlossen.")}>Abschließen</button> : null}
                    {auction.canCancel ? <button type="button" className="ui-button ui-button-danger" disabled={pendingKey !== null} onClick={() => void runMutation(`cancel:${auction.id}`, () => apiPostJson(`/api/auctions/${auction.id}/decision`, { action: "cancel" }), "Auktion wurde abgebrochen; die Karte ist wieder frei.")}>Abbrechen</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        {historyAuctions.length > 0 ? (
          <Panel className="mt-6" kicker="Verlauf" title="Abgeschlossene Auktionen">
            <div className="divide-y divide-white/10">
              {historyAuctions.map((auction) => (
                <div key={auction.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div><strong className="text-[#ead9c1]">{auction.card.name}</strong><span className="ml-2 text-[#9f8d77]">{auction.seller.displayName}</span></div>
                  <div className="flex items-center gap-3"><StatusPill tone={auction.status === "SETTLED" ? "teal" : "slate"}>{auction.status === "SETTLED" ? "Verkauft" : auction.status === "NO_SALE" ? "Ohne Gebot" : "Abgebrochen"}</StatusPill><span className="text-[#c8b397]">{auction.currentBid ? formatCredits(auction.currentBid) : "—"}</span></div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </section>
    </DuelConsoleScaffold>
  );
}
