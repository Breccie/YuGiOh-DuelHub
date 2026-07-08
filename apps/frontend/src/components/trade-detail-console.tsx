"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { TradeDetailDto } from "@/lib/app-dtos";
import { tradeClient } from "@/lib/trade-client";

type TradeCardOption = {
  id: string;
  name: string;
  rarity: string | null;
  setCode: string | null;
};

function formatTradeStatus(status: TradeDetailDto["status"]) {
  switch (status) {
    case "PENDING":
      return "Verhandlung offen";
    case "ACCEPTED":
      return "Reserviert";
    case "COMPLETED":
      return "Abgeschlossen";
    case "CANCELLED":
      return "Abgebrochen";
    default:
      return "Abgelehnt";
  }
}

function statusTone(status: TradeDetailDto["status"]) {
  switch (status) {
    case "COMPLETED":
      return "gold" as const;
    case "ACCEPTED":
      return "slate" as const;
    default:
      return "ember" as const;
  }
}

function toggleSelection(values: string[], id: string) {
  if (values.includes(id)) {
    return values.filter((value) => value !== id);
  }

  return [...values, id];
}

function CardLine({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-3 text-sm text-[#f0dfcc]">
      {label}
      <span className="ml-2 text-[#9f8c77]">{detail}</span>
    </div>
  );
}

function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-4 py-5 text-sm text-[#d8c2a6]">
      <p className="font-semibold text-[#f0dfcc]">{title}</p>
      <p className="mt-2 leading-7 text-[#bca78c]">{detail}</p>
    </div>
  );
}

export function TradeDetailConsole({
  viewer,
  collectionValue,
  latestBanlistName,
  activeEra,
  trade,
  viewerUserId,
  viewerAvailableCards,
  counterpartAvailableCards,
}: {
  viewer: {
    displayName: string;
    duelistId: string;
  };
  collectionValue: string;
  latestBanlistName: string;
  activeEra: string;
  trade: TradeDetailDto;
  viewerUserId: string;
  viewerAvailableCards: TradeCardOption[];
  counterpartAvailableCards: TradeCardOption[];
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState(false);
  const [pendingCounter, setPendingCounter] = useState(false);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [counterNote, setCounterNote] = useState("");
  const [counterOfferedIds, setCounterOfferedIds] = useState<string[]>([]);
  const [counterRequestedIds, setCounterRequestedIds] = useState<string[]>([]);

  const counterpart = trade.proposer.userId === viewerUserId ? trade.responder : trade.proposer;
  const activeVersion = trade.activeVersion;
  const acceptedVersion =
    trade.versions.find((version) => version.id === trade.acceptedVersionId) ?? null;
  const referenceVersion = trade.status === "ACCEPTED" ? acceptedVersion : activeVersion;
  const referenceCards = referenceVersion
    ? [...referenceVersion.offered, ...referenceVersion.requested]
    : [];
  const cardsYouGive = referenceCards.filter((card) => card.fromUserId === viewerUserId);
  const cardsYouReceive = referenceCards.filter((card) => card.toUserId === viewerUserId);
  const canAccept = trade.allowedActions.includes("accept");
  const canReject = trade.allowedActions.includes("reject");
  const canCancel = trade.allowedActions.includes("cancel");
  const canCounter = trade.allowedActions.includes("counter");
  const canConfirmCompletion = trade.allowedActions.includes("confirmCompletion");
  const viewerConfirmedAt =
    trade.proposer.userId === viewerUserId
      ? trade.proposerConfirmedAt
      : trade.responderConfirmedAt;
  const canSubmitCounter =
    counterOfferedIds.length > 0 || counterRequestedIds.length > 0;

  function toggleCounterForm() {
    if (showCounterForm) {
      setShowCounterForm(false);
      return;
    }

    if (!activeVersion || !canCounter) {
      return;
    }

    const defaultOfferedIds = [...activeVersion.offered, ...activeVersion.requested]
      .filter((card) => card.fromUserId === viewerUserId)
      .map((card) => card.collectionEntryId)
      .filter((id) => viewerAvailableCards.some((card) => card.id === id));
    const defaultRequestedIds = [...activeVersion.offered, ...activeVersion.requested]
      .filter((card) => card.fromUserId === counterpart.userId)
      .map((card) => card.collectionEntryId)
      .filter((id) => counterpartAvailableCards.some((card) => card.id === id));

    setCounterOfferedIds(defaultOfferedIds);
    setCounterRequestedIds(defaultRequestedIds);
    setCounterNote(activeVersion.note ?? "");
    setShowCounterForm(true);
  }

  async function runDecision(
    action: "accept" | "reject" | "cancel" | "confirmCompletion",
  ) {
    setPendingAction(true);
    setFeedback(null);

    try {
      await tradeClient.decide(trade.id, { action });

      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Trade konnte nicht aktualisiert werden."));
    } finally {
      setPendingAction(false);
    }
  }

  async function submitCounterOffer() {
    if (!canSubmitCounter) {
      setFeedback("Wähle mindestens eine Karte für das Gegenangebot aus.");
      return;
    }

    setPendingCounter(true);
    setFeedback(null);

    try {
      await tradeClient.createVersion(trade.id, {
        note: counterNote || null,
        offeredEntryIds: counterOfferedIds,
        requestedEntryIds: counterRequestedIds,
      });

      setShowCounterForm(false);
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Gegenangebot konnte nicht erstellt werden."));
    } finally {
      setPendingCounter(false);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath="/trade"
      viewer={viewer}
      metrics={[
        { icon: "book", label: "Sammlung", value: collectionValue },
        { icon: "scale", label: "Banlist", value: latestBanlistName },
        { icon: "hourglass", label: "Aktive Ära", value: activeEra },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Panel kicker="Trade" title={counterpart.displayName}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone={statusTone(trade.status)}>{formatTradeStatus(trade.status)}</StatusPill>
              <span className="text-sm text-[#baa58a]">{counterpart.duelistId}</span>
              {referenceVersion ? (
                <StatusPill tone="slate">Version {referenceVersion.versionNumber}</StatusPill>
              ) : null}
            </div>

            <p className="ui-copy text-sm">
              {referenceVersion?.note || "Keine Notiz zur aktuellen Version hinterlegt."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                  Du gibst
                </p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                  {cardsYouGive.length}
                </p>
              </div>
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                  Du erhältst
                </p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                  {cardsYouReceive.length}
                </p>
              </div>
            </div>

            {trade.status === "ACCEPTED" ? (
              <div className="rounded-[18px] border border-[rgba(88,163,169,0.2)] bg-[rgba(58,118,124,0.12)] px-4 py-4 text-sm text-[#dceff0]">
                <p className="font-semibold text-[#f0fbff]">
                  Finale Version reserviert
                </p>
                <p className="mt-2 leading-7 text-[#c6ddde]">
                  Besitzwechsel erfolgt erst nach zwei Bestätigungen.{" "}
                  {viewerConfirmedAt
                    ? `Deine Bestätigung liegt seit ${new Date(viewerConfirmedAt).toLocaleString("de-DE")} vor.`
                    : "Deine Abschlussbestätigung fehlt noch."}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-3">
                    <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#a8cfd1]">
                      {trade.proposer.displayName}
                    </p>
                    <p className="mt-2 font-semibold text-[#effcff]">
                      {trade.proposerConfirmedAt ? "Bestätigt" : "Offen"}
                    </p>
                  </div>
                  <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-3">
                    <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#a8cfd1]">
                      {trade.responder.displayName}
                    </p>
                    <p className="mt-2 font-semibold text-[#effcff]">
                      {trade.responderConfirmedAt ? "Bestätigt" : "Offen"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {canAccept ? (
                <button
                  className="ui-button-primary"
                  type="button"
                  disabled={pendingAction}
                  onClick={() => runDecision("accept")}
                >
                  Annehmen
                </button>
              ) : null}
              {canReject ? (
                <button
                  className="ui-button-neutral"
                  type="button"
                  disabled={pendingAction}
                  onClick={() => runDecision("reject")}
                >
                  Ablehnen
                </button>
              ) : null}
              {canCounter ? (
                <button
                  className="ui-button-neutral"
                  type="button"
                  disabled={pendingCounter}
                  onClick={toggleCounterForm}
                >
                  {showCounterForm ? "Gegenangebot schließen" : "Gegenangebot"}
                </button>
              ) : null}
              {canConfirmCompletion ? (
                <button
                  className="ui-button-primary"
                  type="button"
                  disabled={pendingAction}
                  onClick={() => runDecision("confirmCompletion")}
                >
                  Abschluss bestätigen
                </button>
              ) : null}
              {canCancel ? (
                <button
                  className="ui-button-danger"
                  type="button"
                  disabled={pendingAction}
                  onClick={() => runDecision("cancel")}
                >
                  Trade abbrechen
                </button>
              ) : null}
              <Link className="ui-button-neutral" href={`/profiles/${counterpart.duelistId}`}>
                Profil öffnen
              </Link>
            </div>
          </div>
        </Panel>

        <Panel kicker="Aktive Version" title="Kartenfluss">
          {referenceVersion ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="ui-kicker">Du gibst</p>
                <div className="mt-3 space-y-2">
                  {cardsYouGive.length > 0 ? (
                    cardsYouGive.map((card) => (
                      <CardLine
                        key={card.tradeVersionItemId}
                        label={card.cardName}
                        detail={`${card.rarity ?? "Karte"}${card.setCode ? ` · ${card.setCode}` : ""}`}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="Keine Karten von dir"
                      detail="Diese Version enthält aktuell keine Abgabe von deiner Seite."
                    />
                  )}
                </div>
              </div>
              <div>
                <p className="ui-kicker">Du erhältst</p>
                <div className="mt-3 space-y-2">
                  {cardsYouReceive.length > 0 ? (
                    cardsYouReceive.map((card) => (
                      <CardLine
                        key={card.tradeVersionItemId}
                        label={card.cardName}
                        detail={`${card.rarity ?? "Karte"}${card.setCode ? ` · ${card.setCode}` : ""}`}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="Keine Gegenleistung"
                      detail="Diese Version fragt aktuell keine Karten der Gegenseite an."
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Keine aktive Version"
              detail="Dieser Thread enthält noch keine spielbare Angebots-Version."
            />
          )}
        </Panel>
      </section>

      {showCounterForm && canCounter ? (
        <section className="mt-6">
          <Panel kicker="Antwort" title="Gegenangebot erstellen">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <label className="block">
                  <span className="ui-kicker">Notiz</span>
                  <textarea
                    className="ui-input mt-2 min-h-[120px]"
                    value={counterNote}
                    onChange={(event) => setCounterNote(event.target.value)}
                    placeholder="Was änderst du an dieser Version?"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                      Du bietest
                    </p>
                    <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                      {counterOfferedIds.length}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                      Du fragst an
                    </p>
                    <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                      {counterRequestedIds.length}
                    </p>
                  </div>
                </div>

                <button
                  className="ui-button-primary"
                  type="button"
                  disabled={pendingCounter || !canSubmitCounter}
                  onClick={submitCounterOffer}
                >
                  {pendingCounter ? "Speichert..." : "Version senden"}
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="ui-kicker">Deine verfügbaren Karten</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {viewerAvailableCards.map((card) => {
                      const active = counterOfferedIds.includes(card.id);

                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() =>
                            setCounterOfferedIds((current) =>
                              toggleSelection(current, card.id),
                            )
                          }
                          className={`rounded-[18px] border px-4 py-4 text-left transition ${
                            active
                              ? "border-[rgba(207,91,66,0.3)] bg-[rgba(207,91,66,0.12)]"
                              : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#f0dfcc]">{card.name}</p>
                            {active ? <StatusPill tone="ember">Gewählt</StatusPill> : null}
                          </div>
                          <p className="mt-2 text-xs text-[#9f8c77]">
                            {card.rarity ?? "Karte"}
                            {card.setCode ? ` · ${card.setCode}` : ""}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="ui-kicker">Verfügbare Karten von {counterpart.displayName}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {counterpartAvailableCards.map((card) => {
                      const active = counterRequestedIds.includes(card.id);

                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() =>
                            setCounterRequestedIds((current) =>
                              toggleSelection(current, card.id),
                            )
                          }
                          className={`rounded-[18px] border px-4 py-4 text-left transition ${
                            active
                              ? "border-[rgba(88,163,169,0.28)] bg-[rgba(58,118,124,0.14)]"
                              : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#f0dfcc]">{card.name}</p>
                            {active ? <StatusPill tone="slate">Gewählt</StatusPill> : null}
                          </div>
                          <p className="mt-2 text-xs text-[#9f8c77]">
                            {card.rarity ?? "Karte"}
                            {card.setCode ? ` · ${card.setCode}` : ""}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </section>
      ) : null}

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <Panel kicker="Verlauf" title="Versions-Thread">
          <div className="space-y-4">
            {trade.versions.map((version) => (
              <article
                key={version.id}
                className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#f0dfcc]">
                      Version {version.versionNumber}
                    </p>
                    <p className="mt-1 text-sm text-[#bda88b]">
                      {version.sender.displayName} an {version.recipient.displayName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {version.isAccepted ? <StatusPill tone="gold">Final</StatusPill> : null}
                    {version.isActive ? <StatusPill tone="ember">Aktiv</StatusPill> : null}
                    <span className="text-xs uppercase tracking-[0.18em] text-[#9f8c77]">
                      {new Date(version.createdAt).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-[#d6c1a2]">
                  {version.note || "Keine Notiz in dieser Version."}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="ui-kicker">Sender bietet</p>
                    <div className="mt-2 space-y-2">
                      {version.offered.length > 0 ? (
                        version.offered.map((card) => (
                          <CardLine
                            key={card.tradeVersionItemId}
                            label={card.cardName}
                            detail={`${card.rarity ?? "Karte"}${card.setCode ? ` · ${card.setCode}` : ""}`}
                          />
                        ))
                      ) : (
                        <EmptyState
                          title="Keine Karten"
                          detail="Diese Seite bietet in der Version aktuell keine Karten an."
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="ui-kicker">Sender fragt an</p>
                    <div className="mt-2 space-y-2">
                      {version.requested.length > 0 ? (
                        version.requested.map((card) => (
                          <CardLine
                            key={card.tradeVersionItemId}
                            label={card.cardName}
                            detail={`${card.rarity ?? "Karte"}${card.setCode ? ` · ${card.setCode}` : ""}`}
                          />
                        ))
                      ) : (
                        <EmptyState
                          title="Keine Anfrage"
                          detail="Diese Version enthält keine Gegenforderung."
                        />
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel kicker="Timeline" title="Systemverlauf">
          <div className="space-y-3">
            {trade.timeline.map((entry) => (
              <article
                key={entry.id}
                className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f0dfcc]">
                    {entry.title}
                  </p>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#9f8c77]">
                    {new Date(entry.createdAt).toLocaleString("de-DE")}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[#cfbaa0]">{entry.detail}</p>
                {entry.actor ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#9f8c77]">
                    {entry.actor.displayName} · {entry.actor.duelistId}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
