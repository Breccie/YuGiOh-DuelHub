"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import type { TournamentOverviewDto, ViewerSession } from "@/lib/app-dtos";
import type { CreditLedgerEntryDto } from "@ygo/contracts";
import { getApiErrorMessage } from "@/lib/api-client";
import { tournamentClient } from "@/lib/tournament-client";

export function TournamentsConsole({
  session,
  tournaments,
  currency,
}: {
  session: ViewerSession;
  tournaments: TournamentOverviewDto[];
  currency: {
    balance: number;
    tournamentCreditsEarned: number;
    packCreditsSpent: number;
    recentEntries: CreditLedgerEntryDto[];
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formatLabel, setFormatLabel] = useState("Classic Progression");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createTournamentFlow() {
    setPending(true);
    setFeedback(null);

    try {
      const data = await tournamentClient.create({
        title,
        description,
        formatLabel,
      });
      const createdTournamentId = data.tournament.overview.id;

      if (!createdTournamentId) {
        throw new Error("Turnier wurde erstellt, aber die Detail-ID fehlt.");
      }

      startTransition(() => router.push(`/tournaments/${createdTournamentId}`));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Turnier konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath="/tournaments"
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        { icon: "users", label: "Turniere", value: String(tournaments.length) },
        {
          icon: "sword",
          label: "Aktiv",
          value: String(tournaments.filter((tournament) => tournament.status === "ACTIVE").length),
        },
        { icon: "hourglass", label: "Format", value: "Swiss" },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel kicker="Neu" title="Turnier anlegen">
          <div className="grid gap-4">
            <label className="block">
              <span className="ui-kicker">Titel</span>
              <input
                className="ui-input mt-2"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Desktop Progression Cup"
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Format</span>
              <input
                className="ui-input mt-2"
                value={formatLabel}
                onChange={(event) => setFormatLabel(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Beschreibung</span>
              <textarea
                className="ui-input mt-2 min-h-[120px]"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}

            <button
              type="button"
              className="ui-button-primary"
              disabled={pending}
              onClick={createTournamentFlow}
            >
              {pending ? "Erstellt..." : "Turnier starten"}
            </button>
          </div>
        </Panel>

        <div className="space-y-6">
        <Panel kicker="Währung" title="Kampagnen-Credits">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Guthaben", `${currency.balance} Credits`],
              ["Turniere", `+${currency.tournamentCreditsEarned}`],
              ["Packkäufe", `-${currency.packCreditsSpent}`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
              >
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                  {label}
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f0dfcc]">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {currency.recentEntries.length > 0 ? (
              currency.recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-[#f0dfcc]">{entry.source}</p>
                    <p className="mt-1 text-xs text-[#baa58a]">
                      {entry.note ?? "Kampagnenbewegung"}
                    </p>
                  </div>
                  <span className={entry.amount >= 0 ? "text-[#b8e3e4]" : "text-[#f2c1b7]"}>
                    {entry.amount >= 0 ? "+" : ""}
                    {entry.amount}
                  </span>
                </div>
              ))
            ) : (
              <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
                Noch keine Credit-Bewegungen.
              </div>
            )}
          </div>
        </Panel>

        <Panel kicker="Standings" title="Aktive Cups">
          <div className="space-y-4">
            {tournaments.length > 0 ? (
              tournaments.map((tournament) => (
                <Link
                  key={tournament.id}
                  href={`/tournaments/${tournament.id}`}
                  className="block rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-5 py-5 transition hover:border-[rgba(207,91,66,0.24)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-[#f0dfcc]">{tournament.title}</p>
                      <p className="mt-1 text-sm text-[#baa58a]">
                        {tournament.formatLabel ?? "Ohne Format"} · Host {tournament.host.displayName}
                      </p>
                    </div>
                    <StatusPill tone={tournament.status === "ACTIVE" ? "gold" : "slate"}>
                      {tournament.status}
                    </StatusPill>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    {[
                      ["Teilnehmer", String(tournament.acceptedParticipantCount)],
                      ["Runden", String(tournament.roundCount)],
                      ["Neueste Runde", tournament.latestRound ? String(tournament.latestRound) : "—"],
                      ["Start", tournament.scheduledAt ? "Geplant" : "Offen"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[16px] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[#9f8c77]">
                          {label}
                        </p>
                        <p className="mt-2 text-sm text-[#f0dfcc]">{value}</p>
                      </div>
                    ))}
                  </div>
                </Link>
              ))
            ) : (
              <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
                Noch keine Turniere angelegt.
              </div>
            )}
          </div>
        </Panel>
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
