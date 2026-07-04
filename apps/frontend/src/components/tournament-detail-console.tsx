"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
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
      await tournamentClient.createRound(tournament.overview.id);
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Swiss-Runde konnte nicht erzeugt werden."));
    }
  }

  async function recordMatch(matchId: string, playerOneScore: number, playerTwoScore: number) {
    try {
      await tournamentClient.recordMatchResult(matchId, {
        playerOneScore,
        playerTwoScore,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Matchergebnis konnte nicht gespeichert werden."));
    }
  }

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
                Swiss-Runde erzeugen
              </button>
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

                      {match.playerTwo && match.status !== "COMPLETED" ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            className="ui-button-primary"
                            type="button"
                            onClick={() => recordMatch(match.id, 2, 0)}
                          >
                            2:0 speichern
                          </button>
                          <button
                            className="ui-button-secondary"
                            type="button"
                            onClick={() => recordMatch(match.id, 2, 1)}
                          >
                            2:1 speichern
                          </button>
                          <button
                            className="ui-button-neutral"
                            type="button"
                            onClick={() => recordMatch(match.id, 1, 2)}
                          >
                            1:2 speichern
                          </button>
                          <button
                            className="ui-button-neutral"
                            type="button"
                            onClick={() => recordMatch(match.id, 1, 1)}
                          >
                            Draw speichern
                          </button>
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
