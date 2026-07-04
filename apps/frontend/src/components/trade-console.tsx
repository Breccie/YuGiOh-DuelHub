"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";

type TradeCard = {
  id: string;
  name: string;
};

type TradeEntry = {
  id: string;
  partnerName: string;
  partnerRank: string;
  partnerDuelistId: string;
  statusLabel: string;
  summaryLabel: string;
  infoLabel: string;
  offered: TradeCard[];
  wanted: TradeCard[];
};

type PartnerCard = {
  id: string;
  duelistId: string;
  name: string;
  era: string;
  openTradeCount: number;
};

type TradeConsoleProps = {
  viewer: {
    displayName: string;
  };
  collectionValue: string;
  latestBanlistName: string;
  activeEra: string;
  incomingTrades: TradeEntry[];
  outgoingTrades: TradeEntry[];
  partnerCards: PartnerCard[];
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function TradeSummaryBadge({ value }: { value: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[rgba(208,170,110,0.18)] bg-[rgba(208,170,110,0.08)] px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#f3debb]">
      {value}
    </div>
  );
}

function CardNameChip({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-[30px] items-center rounded-full border border-[rgba(184,142,89,0.14)] bg-[rgba(255,255,255,0.035)] px-3 text-xs text-[#e7d4bc]">
      {label}
    </span>
  );
}

function EmptyPanelState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-[rgba(184,142,89,0.16)] bg-[rgba(255,255,255,0.02)] px-5 py-8 text-center">
      <p className="font-display text-[1.35rem] text-[#f0dcc0]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[#cdb79c]">{detail}</p>
    </div>
  );
}

function TradeEntryCard({
  trade,
  direction,
}: {
  trade: TradeEntry;
  direction: "incoming" | "outgoing";
}) {
  const heading =
    direction === "incoming" ? trade.partnerName : `Angebot an ${trade.partnerName}`;

  return (
    <article className="rounded-[22px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-[#f2dfc8]">{heading}</p>
          <p className="mt-1 text-sm text-[#baa58a]">{trade.partnerRank}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={direction === "incoming" ? "ember" : "slate"}>
            {trade.statusLabel}
          </StatusPill>
          <span className="text-[0.72rem] uppercase tracking-[0.18em] text-[#a9967f]">
            {trade.infoLabel}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto_1fr] xl:items-start">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#cb5c44]">
            {direction === "incoming" ? "Bietet" : "Du bietest"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {trade.offered.length > 0 ? (
              trade.offered.map((card) => <CardNameChip key={card.id} label={card.name} />)
            ) : (
              <CardNameChip label="Keine Karten" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-center pt-2 text-[#d8bc91]">
          <AssetIcon name="nav-trade" className="h-5 w-5 text-current" />
        </div>

        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#cb5c44]">
            {direction === "incoming" ? "Sucht" : "Du suchst"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {trade.wanted.length > 0 ? (
              trade.wanted.map((card) => <CardNameChip key={card.id} label={card.name} />)
            ) : (
              <CardNameChip label="Keine Karten" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <TradeSummaryBadge value={trade.summaryLabel} />

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trade/${trade.id}`}
            className="inline-flex min-h-[42px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-4 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#ead6b4] transition hover:border-[rgba(255,255,255,0.18)]"
          >
            Thread öffnen
          </Link>
          <Link
            href={`/profiles/${trade.partnerDuelistId}`}
            className="inline-flex min-h-[42px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#ccb899] transition hover:border-[rgba(255,255,255,0.18)]"
          >
            Profil
          </Link>
        </div>
      </div>
    </article>
  );
}

function PartnerMatchCard({ partner }: { partner: PartnerCard }) {
  return (
    <article className="rounded-[22px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-5 py-5">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[rgba(210,168,108,0.24)] bg-[radial-gradient(circle,rgba(91,67,32,0.42),rgba(21,17,12,0.94))] text-sm font-semibold text-[#f3dfbf]">
          {partner.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold text-[#f2dfc8]">{partner.name}</p>
            <StatusPill tone="gold">{partner.openTradeCount} Threads</StatusPill>
          </div>
          <p className="mt-1 text-sm text-[#baa58a]">{partner.duelistId}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-3">
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#cb5c44]">
            Bevorzugte Ära
          </p>
          <p className="mt-2 text-sm text-[#ead6b4]">{partner.era}</p>
        </div>
      </div>

      <Link
        href={`/profiles/${partner.duelistId}`}
        className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-4 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#ead6b4] transition hover:border-[rgba(255,255,255,0.18)]"
      >
        Profil ansehen
      </Link>
    </article>
  );
}

function HistoryRow({
  item,
  direction,
}: {
  item: TradeEntry;
  direction: "incoming" | "outgoing";
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-[#f2dfc8]">
            {direction === "incoming" ? item.partnerName : `Du ↔ ${item.partnerName}`}
          </p>
          <p className="mt-1 text-sm text-[#baa58a]">{item.partnerRank}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={direction === "incoming" ? "ember" : "slate"}>
            {item.statusLabel}
          </StatusPill>
          <TradeSummaryBadge value={item.summaryLabel} />
        </div>
      </div>
    </div>
  );
}

export function TradeConsole({
  viewer,
  collectionValue,
  latestBanlistName,
  activeEra,
  incomingTrades,
  outgoingTrades,
  partnerCards,
}: TradeConsoleProps) {
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "PARTNERS" | "HISTORY">(
    "OVERVIEW",
  );

  const historyItems = useMemo(
    () => [
      ...incomingTrades.map((item) => ({ direction: "incoming" as const, item })),
      ...outgoingTrades.map((item) => ({ direction: "outgoing" as const, item })),
    ],
    [incomingTrades, outgoingTrades],
  );

  const overviewCount = incomingTrades.length + outgoingTrades.length;

  return (
    <DuelConsoleScaffold
      activePath="/trade"
      viewer={{
        displayName: viewer.displayName,
      }}
      metrics={[
        { icon: "book", label: "Sammlung", value: collectionValue },
        { icon: "scale", label: "Banlist", value: latestBanlistName },
        { icon: "hourglass", label: "Aktive Ära", value: activeEra },
      ]}
    >
      <section className="grid gap-6 pt-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p className="text-[0.82rem] uppercase tracking-[0.26em] text-[#cb5c44]">Handel</p>
          <h1 className="font-display inscription-text mt-4 text-[3.9rem] leading-[0.92] tracking-[0.02em] sm:text-[5rem]">
            Tausch & Angebote
          </h1>
          <p className="mt-5 max-w-[44rem] text-[1.05rem] leading-8 text-[#dbc9b2]">
            Verwalte offene Angebote, finde passende Partner und gleiche Karten direkt über den
            internen Genesys-Wert ab.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/trade/create"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#fff0e1] shadow-[0_0_30px_rgba(151,29,20,0.24)] transition hover:brightness-110"
            >
              <AssetIcon name="plus" className="h-5 w-5 text-current" />
              <span>Angebot erstellen</span>
            </Link>
            <Link
              href="/settings"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
            >
              <AssetIcon name="users" className="h-5 w-5 text-current" />
              <span>Freunde verwalten</span>
            </Link>
          </div>
        </div>

        <Panel kicker="Status" title="Tauschübersicht">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-[rgba(204,97,78,0.22)] bg-[rgba(141,61,48,0.12)] px-4 py-4">
              <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#f0b0a2]">
                Eingehend
              </p>
              <p className="mt-3 font-display text-[2rem] leading-none text-[#ffd7ce]">
                {incomingTrades.length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(126,143,168,0.18)] bg-[rgba(255,255,255,0.04)] px-4 py-4">
              <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#c8d3e1]">
                Aktiv
              </p>
              <p className="mt-3 font-display text-[2rem] leading-none text-[#e2e9f3]">
                {outgoingTrades.length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(208,170,110,0.22)] bg-[rgba(208,170,110,0.08)] px-4 py-4">
              <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#e9cf99]">
                Partner
              </p>
              <p className="mt-3 font-display text-[2rem] leading-none text-[#f6e1b7]">
                {partnerCards.length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#bca78c]">
                Abschluss
              </p>
              <p className="mt-3 text-sm leading-7 text-[#dcc8ad]">
                Karten werden erst bei Annahme reserviert und erst nach zwei Bestätigungen final übertragen.
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel kicker="Ansicht" title="Anfragen">
          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { id: "OVERVIEW", label: "Übersicht", count: overviewCount },
              { id: "PARTNERS", label: "Partner", count: partnerCards.length },
              { id: "HISTORY", label: "Verlauf", count: historyItems.length },
            ].map((tab) => {
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={classes(
                    "inline-flex min-h-[42px] items-center gap-2 rounded-full border px-4 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition",
                    active
                      ? "border-[rgba(207,91,66,0.3)] bg-[rgba(207,91,66,0.14)] text-[#ffe3ca]"
                      : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#d6c1a2] hover:border-[rgba(255,255,255,0.16)]",
                  )}
                >
                  <span>{tab.label}</span>
                  <StatusPill tone={active ? "ember" : "slate"}>{String(tab.count)}</StatusPill>
                </button>
              );
            })}
          </div>

          {activeTab === "OVERVIEW" ? (
            <div className="grid gap-6 2xl:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-[#cb5c44]">
                    Eingehende Anfragen
                  </h3>
                  <StatusPill tone="ember">{String(incomingTrades.length)}</StatusPill>
                </div>
                {incomingTrades.length > 0 ? (
                  incomingTrades.map((trade) => (
                    <TradeEntryCard key={trade.id} trade={trade} direction="incoming" />
                  ))
                ) : (
                  <EmptyPanelState
                    title="Keine neuen Anfragen"
                    detail="Sobald Freunde dir ein Angebot schicken, erscheint es hier gesammelt."
                  />
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-[#cb5c44]">
                    Aktive Angebote
                  </h3>
                  <StatusPill tone="slate">{String(outgoingTrades.length)}</StatusPill>
                </div>
                {outgoingTrades.length > 0 ? (
                  outgoingTrades.map((trade) => (
                    <TradeEntryCard key={trade.id} trade={trade} direction="outgoing" />
                  ))
                ) : (
                  <EmptyPanelState
                    title="Noch kein Angebot gesendet"
                    detail="Erstelle dein erstes Angebot und gleiche Dubletten gegen fehlende Karten ab."
                  />
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "PARTNERS" ? (
            partnerCards.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {partnerCards.map((partner) => (
                  <PartnerMatchCard key={partner.id} partner={partner} />
                ))}
              </div>
            ) : (
              <EmptyPanelState
                title="Noch keine Tauschpartner"
                detail="Sobald du Freunde hinzugefügt hast, kannst du hier passende Matches sehen."
              />
            )
          ) : null}

          {activeTab === "HISTORY" ? (
            historyItems.length > 0 ? (
              <div className="space-y-3">
                {historyItems.map(({ direction, item }) => (
                  <HistoryRow key={`${direction}-${item.id}`} direction={direction} item={item} />
                ))}
              </div>
            ) : (
              <EmptyPanelState
                title="Noch kein Verlauf"
                detail="Abgeschlossene oder laufende Tauschaktionen werden hier später chronologisch angezeigt."
              />
            )
          ) : null}
        </Panel>

        <div className="space-y-6">
          <Panel kicker="Empfohlen" title="Beste Matches">
            {partnerCards.length > 0 ? (
              <div className="space-y-4">
                {partnerCards.slice(0, 3).map((partner) => (
                  <PartnerMatchCard key={partner.id} partner={partner} />
                ))}
              </div>
            ) : (
              <EmptyPanelState
                title="Keine Matches vorhanden"
                detail="Füge Freunde hinzu, damit wir passende Tauschangebote hervorheben können."
              />
            )}
          </Panel>

          <Panel kicker="Flow" title="Trade-Ablauf">
            <div className="space-y-4">
              {[
                {
                  title: "Thread statt Einmalangebot",
                  detail:
                    "Jeder Trade bleibt als Verlauf mit Versionen und Gegenangeboten sichtbar, statt nach einer Antwort zu verschwinden.",
                },
                {
                  title: "Reservierung erst bei Accept",
                  detail:
                    "Offene Angebote sperren keine Karten. Erst die angenommene finale Version setzt beide Seiten atomar auf reserviert.",
                },
                {
                  title: "Zwei-Schritt-Abschluss",
                  detail:
                    "Der Besitzwechsel passiert erst, wenn beide Duelists den Abschluss in der Detailansicht bestätigt haben.",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="rounded-[20px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <p className="font-display text-[1.35rem] leading-none text-[#f0dcc0]">
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[#cfbaa0]">{item.detail}</p>
                </article>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
