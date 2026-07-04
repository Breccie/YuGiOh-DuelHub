"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { DuelRequestDto, ViewerSession } from "@/lib/app-dtos";
import { duelClient } from "@/lib/duel-client";

function formatGermanDateTime(value: string | null) {
  if (!value) {
    return "Noch offen";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DuelsConsole({
  session,
  duelRequests,
  decks,
}: {
  session: ViewerSession;
  duelRequests: DuelRequestDto[];
  decks: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [opponentDuelistId, setOpponentDuelistId] = useState("");
  const [requesterDeckId, setRequesterDeckId] = useState(decks[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function runMutation(
    task: () => Promise<void>,
    successMessage: string,
    fallbackMessage: string,
  ) {
    setPending(true);
    setFeedback(null);

    try {
      await task();
      setFeedback(successMessage);
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, fallbackMessage));
    } finally {
      setPending(false);
    }
  }

  async function createRequest() {
    await runMutation(
      async () => {
        await duelClient.create({
          opponentDuelistId,
          requesterDeckId: requesterDeckId || null,
          message: message || null,
        });
        setOpponentDuelistId("");
        setMessage("");
      },
      "Duellanfrage gespeichert.",
      "Duellanfrage konnte nicht erstellt werden.",
    );
  }

  async function actOnRequest(duelRequestId: string, action: "accept" | "decline" | "cancel") {
    await runMutation(
      async () => {
        await duelClient.update(duelRequestId, { action });
      },
      "Duellanfrage aktualisiert.",
      "Duellanfrage konnte nicht aktualisiert werden.",
    );
  }

  async function scheduleRequest(duelRequestId: string) {
    const inTwoHours = new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString();
    await runMutation(
      async () => {
        await duelClient.update(duelRequestId, {
          action: "schedule",
          proposedAt: inTwoHours,
          confirmedAt: inTwoHours,
          platform: "EDOPro",
          note: "Termin direkt aus der Desktop-App bestätigt.",
        });
      },
      "Duelltermin bestätigt.",
      "Duelltermin konnte nicht bestätigt werden.",
    );
  }

  return (
    <DuelConsoleScaffold
      activePath="/duels"
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        { icon: "sword", label: "Anfragen", value: String(duelRequests.length) },
        {
          icon: "nav-decks",
          label: "Decks",
          value: `${decks.length} verfügbar`,
        },
        { icon: "hourglass", label: "Plattform", value: "EDOPro" },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <Panel kicker="Neu" title="Duellanfrage senden">
          <div className="grid gap-4">
            <label className="block">
              <span className="ui-kicker">Gegner per Duelist-ID</span>
              <input
                className="ui-input mt-2"
                value={opponentDuelistId}
                onChange={(event) => setOpponentDuelistId(event.target.value)}
                placeholder="KAIBA-002"
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Deck</span>
              <select
                className="ui-input mt-2"
                value={requesterDeckId}
                onChange={(event) => setRequesterDeckId(event.target.value)}
              >
                <option value="">Ohne Deck-Verknüpfung</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="ui-kicker">Nachricht</span>
              <textarea
                className="ui-input mt-2 min-h-[120px]"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Lass uns das Match heute Abend über EDOPro spielen."
              />
            </label>
            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}
            <button className="ui-button-primary" type="button" disabled={pending} onClick={createRequest}>
              {pending ? "Speichert..." : "Duellanfrage anlegen"}
            </button>
          </div>
        </Panel>

        <Panel kicker="Live" title="Aktive Duelle">
          <div className="space-y-4">
            {duelRequests.length > 0 ? (
              duelRequests.map((duelRequest) => {
                const incoming = duelRequest.opponent.userId === session.userId;
                const counterpart = incoming ? duelRequest.requester : duelRequest.opponent;

                return (
                  <article
                    key={duelRequest.id}
                    className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-5 py-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-[#f0dfcc]">
                          {counterpart.displayName}
                        </p>
                        <p className="mt-1 text-sm text-[#baa58a]">
                          {counterpart.duelistId}
                          {duelRequest.deck ? ` · ${duelRequest.deck.name}` : ""}
                        </p>
                      </div>
                      <StatusPill tone={duelRequest.status === "SCHEDULED" ? "gold" : "ember"}>
                        {duelRequest.status}
                      </StatusPill>
                    </div>

                    <p className="ui-copy mt-4 text-sm">
                      {duelRequest.message || "Keine Nachricht hinterlegt."}
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                        <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                          Vorgeschlagen
                        </p>
                        <p className="mt-2 text-sm text-[#f0dfcc]">
                          {formatGermanDateTime(duelRequest.appointment?.proposedAt ?? null)}
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                        <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                          Bestätigt
                        </p>
                        <p className="mt-2 text-sm text-[#f0dfcc]">
                          {formatGermanDateTime(duelRequest.appointment?.confirmedAt ?? null)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {incoming && duelRequest.status === "PENDING" ? (
                        <>
                          <button
                            className="ui-button-primary"
                            type="button"
                            disabled={pending}
                            onClick={() => actOnRequest(duelRequest.id, "accept")}
                          >
                            Annehmen
                          </button>
                          <button
                            className="ui-button-neutral"
                            type="button"
                            disabled={pending}
                            onClick={() => actOnRequest(duelRequest.id, "decline")}
                          >
                            Ablehnen
                          </button>
                        </>
                      ) : null}

                      {duelRequest.status === "ACCEPTED" || duelRequest.status === "PENDING" ? (
                        <button
                          className="ui-button-secondary"
                          type="button"
                          disabled={pending}
                          onClick={() => scheduleRequest(duelRequest.id)}
                        >
                          Termin bestätigen
                        </button>
                      ) : null}

                      {!incoming && duelRequest.status === "PENDING" ? (
                        <button
                          className="ui-button-danger"
                          type="button"
                          disabled={pending}
                          onClick={() => actOnRequest(duelRequest.id, "cancel")}
                        >
                          Stornieren
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
                Noch keine Duellanfragen angelegt.
              </div>
            )}
          </div>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
