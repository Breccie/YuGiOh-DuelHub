"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { apiGetJson, getApiErrorMessage } from "@/lib/api-client";
import type { ViewerSession } from "@/lib/app-dtos";
import { tournamentClient } from "@/lib/tournament-client";
import type { TournamentDetail } from "@/lib/tournament-service";

function formatGermanDateTime(value: string | null) {
  if (!value) {
    return "Noch offen";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TournamentDetailConsole({
  session,
  tournament,
}: {
  session: ViewerSession;
  tournament: TournamentDetail;
}) {
  const router = useRouter();
  const [inviteDuelistId, setInviteDuelistId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [completePending, setCompletePending] = useState(false);
  const [scoreDrafts, setScoreDrafts] = useState<
    Record<string, { playerOneScore: string; playerTwoScore: string }>
  >({});
  const [availableDecks, setAvailableDecks] = useState<Array<{ id: string; name: string; isLegal: boolean }>>([]);
  const currentParticipant = tournament.participants.find((participant) => participant.duelist.userId === session.userId);
  const [selectedDeckId, setSelectedDeckId] = useState(currentParticipant?.registeredDeck?.id ?? "");
  const [manualPairs, setManualPairs] = useState<Array<{ playerOneId: string; playerTwoId: string }>>([
    { playerOneId: "", playerTwoId: "" },
  ]);

  useEffect(() => {
    if (tournament.overview.status !== "DRAFT" || !currentParticipant) return;
    void apiGetJson<{ decks: Array<{ id: string; name: string; isLegal: boolean }> }>("/api/decks?view=library")
      .then((payload) => setAvailableDecks(payload.decks))
      .catch(() => setAvailableDecks([]));
  }, [currentParticipant, tournament.overview.status]);

  async function registerDeck() {
    if (!selectedDeckId) return;
    setFeedback(null);
    try {
      await tournamentClient.registerDeck(tournament.overview.id, { deckId: selectedDeckId });
      setFeedback("Turnierdeck eingecheckt. Beim Start wird eine unveränderliche Kopie gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Turnierdeck konnte nicht eingecheckt werden."));
    }
  }

  async function invite() {
    setFeedback(null);

    try {
      await tournamentClient.inviteParticipant(tournament.overview.id, {
        duelistId: inviteDuelistId,
      });
      setInviteDuelistId("");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Einladung fehlgeschlagen."));
    }
  }

  async function createRound() {
    try {
      if (tournament.overview.pairingMode === "MANUAL") {
        await tournamentClient.createManualRound(tournament.overview.id, {
          pairs: manualPairs.map((pair) => ({
            playerOneId: pair.playerOneId,
            playerTwoId: pair.playerTwoId || null,
          })),
        });
      } else {
        await tournamentClient.createRound(tournament.overview.id);
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Swiss-Runde konnte nicht erzeugt werden."));
    }
  }

  function getScoreDraft(match: TournamentDetail["rounds"][number]["matches"][number]) {
    return (
      scoreDrafts[match.id] ?? {
        playerOneScore: String(match.playerOneScore),
        playerTwoScore: String(match.playerTwoScore),
      }
    );
  }

  function updateScoreDraft(
    matchId: string,
    field: "playerOneScore" | "playerTwoScore",
    value: string,
  ) {
    setScoreDrafts((current) => ({
      ...current,
      [matchId]: {
        playerOneScore: current[matchId]?.playerOneScore ?? "0",
        playerTwoScore: current[matchId]?.playerTwoScore ?? "0",
        [field]: value,
      },
    }));
  }

  async function reportMatch(
    match: TournamentDetail["rounds"][number]["matches"][number],
    action: "report" | "adminConfirm",
  ) {
    const draft = getScoreDraft(match);
    const playerOneScore = Number(draft.playerOneScore);
    const playerTwoScore = Number(draft.playerTwoScore);

    if (!Number.isInteger(playerOneScore) || !Number.isInteger(playerTwoScore)) {
      setFeedback("Bitte ganze Zahlen als Score eintragen.");
      return;
    }

    try {
      await tournamentClient.recordMatchResult(match.id, {
        action,
        playerOneScore,
        playerTwoScore,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Matchergebnis konnte nicht gespeichert werden."));
    }
  }

  async function confirmMatch(match: TournamentDetail["rounds"][number]["matches"][number]) {
    try {
      await tournamentClient.recordMatchResult(match.id, {
        action: "confirm",
        playerOneScore: match.playerOneScore,
        playerTwoScore: match.playerTwoScore,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Matchergebnis konnte nicht bestätigt werden."));
    }
  }

  async function completeTournamentFlow() {
    setCompletePending(true);
    setFeedback(null);

    try {
      await tournamentClient.complete(tournament.overview.id);
      setFeedback("Turnier abgeschlossen. Rewards und nächster Kampagnenschritt wurden aktualisiert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Turnier konnte nicht abgeschlossen werden."));
    } finally {
      setCompletePending(false);
    }
  }

  const readyCheckpoint = tournament.campaign.readyCheckpoint;
  const hasTournamentRewards = tournament.campaign.rewardGrants.length > 0;
  const completed = tournament.overview.status === "COMPLETED";
  const isHost = tournament.overview.host.userId === session.userId;

  return (
    <DuelConsoleScaffold
      activePath={`/tournaments/${tournament.overview.id}`}
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        {
          icon: "users",
          label: "Teilnehmer",
          value: String(tournament.overview.acceptedParticipantCount),
        },
        {
          icon: "sword",
          label: "Runden",
          value: String(tournament.overview.roundCount),
        },
        { icon: "hourglass", label: "Status", value: tournament.overview.status },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel kicker="Lobby" title={tournament.overview.title}>
          <div className="space-y-5">
            <p className="ui-copy text-sm">
              {tournament.overview.description || "Noch keine Beschreibung hinterlegt."}
            </p>
            {currentParticipant && tournament.overview.status === "DRAFT" ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
                <p className="ui-kicker">Deck-Check-in</p>
                <p className="mt-2 text-sm text-[#baa58a]">Das gewählte Deck wird beim Start unveränderlich eingefroren.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <select className="ui-input" value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
                    <option value="">Deck auswählen</option>
                    {availableDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.isLegal ? "" : " · nicht legal"}</option>)}
                  </select>
                  <button className="ui-button-secondary" type="button" disabled={!selectedDeckId} onClick={() => void registerDeck()}>Deck einchecken</button>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Format", tournament.overview.formatLabel ?? "Ohne Format"],
                [
                  "Host",
                  `${tournament.overview.host.displayName} (${tournament.overview.host.duelistId})`,
                ],
                ["Start", formatGermanDateTime(tournament.overview.scheduledAt)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                    {label}
                  </p>
                  <p className="mt-2 text-sm text-[#f0dfcc]">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                className="ui-input"
                value={inviteDuelistId}
                onChange={(event) => setInviteDuelistId(event.target.value)}
                placeholder="Duelist-ID einladen"
              />
              <button className="ui-button-secondary" type="button" onClick={invite}>
                Einladen
              </button>
              <button className="ui-button-primary" type="button" onClick={createRound}>
                {tournament.overview.pairingMode === "SWISS" ? "Swiss-Runde erzeugen" : tournament.overview.pairingMode === "ROUND_ROBIN" ? "Nächste Liga-Runde" : tournament.overview.pairingMode === "SINGLE_ELIMINATION" ? "Nächste K.-o.-Runde" : "Paarungen manuell anlegen"}
              </button>
            </div>
            {tournament.overview.pairingMode === "MANUAL" ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
                <div className="flex items-center justify-between gap-3"><p className="ui-kicker">Manuelle Paarungen</p><button type="button" className="ui-button-secondary" onClick={() => setManualPairs((current) => [...current, { playerOneId: "", playerTwoId: "" }])}>Tisch hinzufügen</button></div>
                <div className="mt-3 space-y-3">
                  {manualPairs.map((pair, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
                      <span className="self-center text-sm text-[#baa58a]">Tisch {index + 1}</span>
                      {(["playerOneId", "playerTwoId"] as const).map((field) => (
                        <select key={field} className="ui-input" value={pair[field]} onChange={(event) => setManualPairs((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: event.target.value } : row))}>
                          <option value="">{field === "playerTwoId" ? "Bye" : "Spieler wählen"}</option>
                          {tournament.participants.filter((participant) => participant.status === "ACCEPTED").map((participant) => <option key={participant.id} value={participant.duelist.userId}>{participant.duelist.displayName}</option>)}
                        </select>
                      ))}
                      <button type="button" className="ui-button-secondary" onClick={() => setManualPairs((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Entfernen</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="ui-kicker">Kampagnenabschluss</p>
                  <p className="mt-2 text-sm leading-7 text-[#baa58a]">
                    {completed
                      ? "Dieses Turnier ist abgeschlossen. Rewards wurden vergeben und der nächste Pack-Schritt ist bereit, sobald einer existiert."
                      : tournament.campaign.openMatchCount > 0
                        ? `${tournament.campaign.openMatchCount} Match(es) sind noch offen. Danach kann der Host das Turnier abschliessen.`
                        : "Alle Matches sind erledigt. Der Host kann jetzt Rewards vergeben und das nächste Pack vorbereiten."}
                  </p>
                </div>
                <StatusPill
                  tone={
                    completed
                      ? "gold"
                      : tournament.campaign.canComplete
                        ? "teal"
                        : "slate"
                  }
                >
                  {completed
                    ? "Abgeschlossen"
                    : tournament.campaign.canComplete
                      ? "Bereit"
                      : "Offen"}
                </StatusPill>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="ui-button-primary"
                  type="button"
                  disabled={!tournament.campaign.canComplete || completePending}
                  onClick={() => void completeTournamentFlow()}
                >
                  {completePending ? "Schliesst ab..." : "Turnier abschliessen"}
                </button>
                <Link className="ui-button-secondary" href="/packs">
                  Packs & Rewards öffnen
                </Link>
              </div>
            </div>

            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel kicker="Standings" title="Ranking">
          <div className="space-y-3">
            {tournament.standings.standings.map((standing) => (
              <article
                key={standing.userId}
                className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#f0dfcc]">
                      #{standing.rank} {standing.displayName}
                    </p>
                    <p className="mt-1 text-sm text-[#baa58a]">{standing.duelistId}</p>
                  </div>
                  <StatusPill tone="gold">{standing.matchPoints} MP</StatusPill>
                </div>
                <p className="mt-3 text-sm text-[#cfbaa0]">
                  {standing.wins}-{standing.losses}-{standing.draws} · OMW{" "}
                  {standing.opponentsMatchWinRate.toFixed(3)}
                </p>
              </article>
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel kicker="Kampagne" title="Nächstes Pack">
          {readyCheckpoint ? (
            <div className="space-y-4">
              <div className="rounded-[20px] border border-[rgba(88,163,169,0.22)] bg-[rgba(58,118,124,0.12)] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#f0dfcc]">
                      {readyCheckpoint.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[#b8e3e4]">
                      {readyCheckpoint.setNames.length > 0
                        ? readyCheckpoint.setNames.join(", ")
                        : "Neues Booster-Set"}
                      {" "}ist durch dieses Turnier bereit. Beim Anwenden erhalten alle Mitglieder{" "}
                      {readyCheckpoint.freePacksPerSetUnlock} Gratispack(s).
                    </p>
                  </div>
                  <StatusPill tone="teal">Pack bereit</StatusPill>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="ui-button-primary" href="/packs">
                  Zu Packs & Reward-Inbox
                </Link>
                <Link className="ui-button-secondary" href="/packs/promos">
                  Promo-Quellen prüfen
                </Link>
              </div>
            </div>
          ) : (
            <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
              Noch kein Pack-Checkpoint durch dieses Turnier bereit. Erzeuge oder verknüpfe den
              nächsten Kampagnen-Schritt, dann wird er hier angezeigt.
            </div>
          )}
        </Panel>

        <Panel kicker="Belohnungen" title="Turnier-Rewards">
          <div className="space-y-3">
            {hasTournamentRewards ? (
              tournament.campaign.rewardGrants.map((reward) => (
                <article
                  key={reward.id}
                  className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[#f0dfcc]">
                        {reward.recipientName}
                        {reward.rank ? ` · Platz ${reward.rank}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-[#baa58a]">
                        {reward.amountCredits > 0
                          ? `${reward.amountCredits} Credits`
                          : "Keine Credits"}
                        {reward.packQuantity > 0
                          ? ` · ${reward.packQuantity} Pack(s) ${reward.packSetName ?? ""}`
                          : ""}
                      </p>
                    </div>
                    <StatusPill tone={reward.status === "PENDING" ? "teal" : "gold"}>
                      {reward.status}
                    </StatusPill>
                  </div>
                </article>
              ))
            ) : (
              <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
                Noch keine Turnier-Rewards vergeben. Sie erscheinen hier direkt nach dem Abschluss.
              </div>
            )}
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <Panel kicker="Teilnehmer" title="Anmeldungen">
          <div className="space-y-3">
            {tournament.participants.map((participant) => (
              <article
                key={participant.id}
                className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[#f0dfcc]">
                      {participant.duelist.displayName}
                    </p>
                    <p className="mt-1 text-sm text-[#baa58a]">
                      {participant.duelist.duelistId}
                    </p>
                  </div>
                  <StatusPill tone={participant.status === "ACCEPTED" ? "gold" : "slate"}>
                    {participant.status}
                  </StatusPill>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel kicker="Matches" title="Runden & Historie">
          <div className="space-y-5">
            {tournament.rounds.map((round) => (
              <section key={round.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-display text-[1.4rem] text-[#f0dcc0]">
                    Runde {round.roundNumber}
                  </h3>
                  <StatusPill tone={round.status === "COMPLETED" ? "gold" : "slate"}>
                    {round.status}
                  </StatusPill>
                </div>
                <div className="space-y-3">
                  {round.matches.map((match) => (
                    <article
                      key={match.id}
                      className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-[#f0dfcc]">
                            Tisch {match.tableNumber ?? "—"} · {match.playerOne.displayName}
                            {match.playerTwo ? ` vs. ${match.playerTwo.displayName}` : " erhält Bye"}
                          </p>
                          <p className="mt-1 text-sm text-[#baa58a]">
                            {match.playerOneDeckName ?? "Kein Deck"}
                            {match.playerTwoDeckName ? ` · ${match.playerTwoDeckName}` : ""}
                          </p>
                        </div>
                        <StatusPill tone={match.status === "COMPLETED" ? "gold" : "ember"}>
                          {match.status}
                        </StatusPill>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[14px] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm text-[#f0dfcc]">
                          Ergebnis: {match.playerOneScore}-{match.playerTwoScore}
                        </div>
                        <div className="rounded-[14px] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm text-[#f0dfcc]">
                          Termin: {formatGermanDateTime(match.confirmedAt)}
                        </div>
                        <div className="rounded-[14px] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm text-[#f0dfcc]">
                          Export: {match.exportPath ?? "Noch keiner"}
                        </div>
                      </div>

                      {match.reportedById ? (
                        <p className="mt-3 text-sm text-[#baa58a]">
                          Gemeldet von{" "}
                          {match.reportedById === match.playerOne.userId
                            ? match.playerOne.displayName
                            : match.playerTwo?.displayName ?? "Spieler"}
                          {match.confirmedById
                            ? ` · bestätigt von ${
                                match.confirmedById === match.playerOne.userId
                                  ? match.playerOne.displayName
                                  : match.playerTwo?.displayName ?? "Spieler"
                              }`
                            : " · wartet auf Bestätigung"}
                        </p>
                      ) : null}

                      {match.playerTwo && match.status !== "COMPLETED" ? (
                        <div className="mt-4 grid gap-3 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
                          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                            <label className="block">
                              <span className="ui-kicker">{match.playerOne.displayName}</span>
                              <input
                                className="ui-input mt-2"
                                inputMode="numeric"
                                value={getScoreDraft(match).playerOneScore}
                                onChange={(event) =>
                                  updateScoreDraft(match.id, "playerOneScore", event.target.value)
                                }
                              />
                            </label>
                            <div className="hidden items-end pb-3 text-sm font-semibold text-[#baa58a] sm:flex">
                              :
                            </div>
                            <label className="block">
                              <span className="ui-kicker">{match.playerTwo.displayName}</span>
                              <input
                                className="ui-input mt-2"
                                inputMode="numeric"
                                value={getScoreDraft(match).playerTwoScore}
                                onChange={(event) =>
                                  updateScoreDraft(match.id, "playerTwoScore", event.target.value)
                                }
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              className="ui-button-primary"
                              type="button"
                              onClick={() => void reportMatch(match, "report")}
                            >
                              Ergebnis melden
                            </button>
                            {match.status === "REPORTED" &&
                            match.reportedById !== session.userId ? (
                              <button
                                className="ui-button-secondary"
                                type="button"
                                onClick={() => void confirmMatch(match)}
                              >
                                Ergebnis bestätigen
                              </button>
                            ) : null}
                            {isHost ? (
                              <button
                                className="ui-button-neutral"
                                type="button"
                                onClick={() => void reportMatch(match, "adminConfirm")}
                              >
                                Admin-bestätigen
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
