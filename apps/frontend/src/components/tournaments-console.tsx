"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CampaignLeaderboardResponse,
  CampaignLeaderboardRowDto,
  CreditLedgerEntryDto,
  UpdateTournamentMvpCardsRequest,
} from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { TournamentOverviewDto, ViewerSession } from "@/lib/app-dtos";
import { tournamentClient } from "@/lib/tournament-client";

type TournamentTab = "RANKING" | "TOURNAMENTS" | "ARCHIVE";
type RankingSort =
  | "TITLES"
  | "PARTICIPATIONS"
  | "PODIUMS"
  | "MATCH_POINTS"
  | "WIN_RATE"
  | "LATEST_TITLE"
  | "NAME";

const rankingSortLabels: Record<RankingSort, string> = {
  TITLES: "Turniererfolge",
  PARTICIPATIONS: "Teilnahmen",
  PODIUMS: "Podiumsplätze",
  MATCH_POINTS: "Matchpunkte",
  WIN_RATE: "Siegquote",
  LATEST_TITLE: "Neuester Titel",
  NAME: "Name A–Z",
};

function compareRankingRows(
  left: CampaignLeaderboardRowDto,
  right: CampaignLeaderboardRowDto,
  sort: RankingSort,
) {
  if (sort === "PARTICIPATIONS") return right.participations - left.participations;
  if (sort === "PODIUMS") return right.podiumFinishes - left.podiumFinishes;
  if (sort === "MATCH_POINTS") return right.matchPoints - left.matchPoints;
  if (sort === "WIN_RATE") return right.winRate - left.winRate;
  if (sort === "LATEST_TITLE") {
    return (right.latestTitleAt ?? "").localeCompare(left.latestTitleAt ?? "");
  }
  if (sort === "NAME") return left.displayName.localeCompare(right.displayName, "de");
  return (
    right.tournamentWins - left.tournamentWins ||
    right.runnerUpFinishes - left.runnerUpFinishes ||
    right.matchWins - left.matchWins ||
    right.winRate - left.winRate ||
    left.displayName.localeCompare(right.displayName, "de")
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function TournamentsConsole({
  session,
  tournaments,
  leaderboard,
  currency,
}: {
  session: ViewerSession;
  tournaments: TournamentOverviewDto[];
  leaderboard: CampaignLeaderboardResponse;
  currency: {
    balance: number;
    tournamentCreditsEarned: number;
    packCreditsSpent: number;
    recentEntries: CreditLedgerEntryDto[];
  };
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TournamentTab>("RANKING");
  const [rankingSort, setRankingSort] = useState<RankingSort>("TITLES");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formatLabel, setFormatLabel] = useState("Classic Progression");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingMvpTournamentId, setEditingMvpTournamentId] = useState<string | null>(null);
  const [mvpDraft, setMvpDraft] = useState<UpdateTournamentMvpCardsRequest["cards"]>([]);

  const sortedRows = useMemo(
    () => [...leaderboard.rows].sort((left, right) => compareRankingRows(left, right, rankingSort)),
    [leaderboard.rows, rankingSort],
  );
  const canCurateMvp = leaderboard.viewerRole === "OWNER" || leaderboard.viewerRole === "ORGANIZER";
  const canManageTournaments = canCurateMvp;

  async function createTournamentFlow() {
    setPending(true);
    setFeedback(null);
    try {
      const data = await tournamentClient.create({ title, description, formatLabel });
      const createdTournamentId = data.tournament.overview.id;
      if (!createdTournamentId) throw new Error("Turnier wurde erstellt, aber die Detail-ID fehlt.");
      startTransition(() => router.push(`/tournaments/${createdTournamentId}`));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Turnier konnte nicht erstellt werden."));
    } finally {
      setPending(false);
    }
  }

  async function saveMvpCards(tournamentId: string) {
    setPending(true);
    setFeedback(null);
    try {
      await tournamentClient.updateMvpCards(tournamentId, { cards: mvpDraft });
      setEditingMvpTournamentId(null);
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "MVP-Karten konnten nicht gespeichert werden."));
    } finally {
      setPending(false);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath="/tournaments"
      viewer={{ displayName: session.displayName, duelistId: session.duelistId }}
      metrics={[
        { icon: "users", label: "Turniere", value: String(tournaments.length) },
        { icon: "sword", label: "Aktiv", value: String(tournaments.filter((item) => item.status === "ACTIVE").length) },
        { icon: "trophy", label: "Archiv", value: String(leaderboard.winnerArchive.length) },
      ]}
    >
      <section className="tournament-command">
        <header className="tournament-command-header">
          <div>
            <p className="ui-kicker">Kampagnenwettbewerb</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#f0dfcc]">Turnierzentrale</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#baa58a]">
              Rangfolge, laufende Cups und ausgezeichnete Schlüsselkarten an einem Ort.
            </p>
          </div>
          {canManageTournaments ? (
            <button type="button" className="ui-button-primary" onClick={() => setIsCreateOpen(true)}>
              Turnier erstellen
            </button>
          ) : null}
        </header>

        <div className="tournament-tabs" role="tablist" aria-label="Turnierbereiche">
          {([
            ["RANKING", "Rangliste"],
            ["TOURNAMENTS", "Turniere"],
            ["ARCHIVE", "Siegerarchiv"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              className={activeTab === value ? "is-active" : ""}
              onClick={() => setActiveTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {feedback ? <div className="campaign-feedback">{feedback}</div> : null}

        {activeTab === "RANKING" ? (
          <Panel kicker="Kampagnenwertung" title="Rangliste">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <p className="max-w-xl text-sm text-[#baa58a]">
                Byes werden separat geführt und zählen nicht als echte Matchsiege.
              </p>
              <label className="min-w-[220px]">
                <span className="ui-kicker">Sortierung</span>
                <select
                  className="ui-input mt-2"
                  value={rankingSort}
                  onChange={(event) => setRankingSort(event.target.value as RankingSort)}
                >
                  {Object.entries(rankingSortLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tournament-ranking-table" role="table" aria-label="Kampagnenrangliste">
              <div className="tournament-ranking-row is-header" role="row">
                <span>Rang</span><span>Duellant</span><span>Titel</span><span>Podium</span>
                <span>Siege</span><span>Punkte</span><span>Quote</span><span>Byes</span>
              </div>
              {sortedRows.map((row, index) => (
                <div className="tournament-ranking-row" role="row" key={row.userId}>
                  <strong data-label="Rang">#{index + 1}</strong>
                  <span><b>{row.displayName}</b><small>{row.duelistId}</small></span>
                  <span data-label="Titel">{row.tournamentWins}</span>
                  <span data-label="Podium">{row.podiumFinishes}</span>
                  <span data-label="Siege">{row.matchWins}</span>
                  <span data-label="Punkte">{row.matchPoints}</span>
                  <span data-label="Quote">{Math.round(row.winRate * 100)}%</span>
                  <span data-label="Byes">{row.byes}</span>
                </div>
              ))}
              {sortedRows.length === 0 ? (
                <div className="ui-empty rounded-[18px] px-4 py-8 text-center text-sm">
                  Die Rangliste füllt sich nach dem ersten abgeschlossenen Turnier.
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {activeTab === "TOURNAMENTS" ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <Panel kicker="Cups" title="Turniere">
              <div className="space-y-3">
                {tournaments.map((tournament) => (
                  <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="tournament-list-row">
                    <div>
                      <strong>{tournament.title}</strong>
                      <span>{tournament.formatLabel ?? "Ohne Format"} · Host {tournament.host.displayName}</span>
                    </div>
                    <div className="tournament-list-metrics">
                      <span>{tournament.acceptedParticipantCount} Spieler</span>
                      <span>{tournament.roundCount} Runden</span>
                      <StatusPill tone={tournament.status === "ACTIVE" ? "gold" : "slate"}>{tournament.status}</StatusPill>
                    </div>
                  </Link>
                ))}
                {tournaments.length === 0 ? (
                  <div className="ui-empty rounded-[18px] px-4 py-8 text-center text-sm">Noch kein Turnier angelegt.</div>
                ) : null}
              </div>
            </Panel>

            <Panel kicker="Wallet" title={`${currency.balance} Credits`}>
              <div className="grid gap-2 text-sm text-[#baa58a]">
                <div className="flex justify-between"><span>Turniere</span><strong className="text-[#b8e3e4]">+{currency.tournamentCreditsEarned}</strong></div>
                <div className="flex justify-between"><span>Packkäufe</span><strong className="text-[#f2c1b7]">-{currency.packCreditsSpent}</strong></div>
              </div>
              <details className="mt-4 border-t border-[rgba(255,255,255,0.08)] pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-[#f0dfcc]">Letzte Bewegungen</summary>
                <div className="mt-3 space-y-2">
                  {currency.recentEntries.map((entry) => (
                    <div key={entry.id} className="flex justify-between gap-3 text-xs text-[#baa58a]">
                      <span>{entry.note ?? entry.source}</span><b>{entry.amount >= 0 ? "+" : ""}{entry.amount}</b>
                    </div>
                  ))}
                  {currency.recentEntries.length === 0 ? <p className="text-xs text-[#9f8c77]">Noch keine Bewegungen.</p> : null}
                </div>
              </details>
            </Panel>
          </div>
        ) : null}

        {activeTab === "ARCHIVE" ? (
          <div className="tournament-archive-grid">
            {leaderboard.winnerArchive.map((entry) => {
              const isEditing = editingMvpTournamentId === entry.tournamentId;
              return (
                <article className="tournament-archive-card" key={entry.tournamentId}>
                  <header>
                    <div>
                      <p className="ui-kicker">{formatDate(entry.completedAt)}</p>
                      <h2>{entry.title}</h2>
                      <span>{entry.formatLabel ?? "Ohne Format"} · {entry.participantCount} Teilnehmer</span>
                    </div>
                    <Link href={`/tournaments/${entry.tournamentId}`} className="ui-button-secondary">Details</Link>
                  </header>
                  <ol className="tournament-podium">
                    {entry.podium.map((player) => (
                      <li key={player.userId}><b>#{player.rank}</b><span>{player.displayName}<small>{player.duelistId}</small></span></li>
                    ))}
                  </ol>

                  <div className="tournament-mvp-grid">
                    {entry.mvpCards.map((card) => (
                      <div className="tournament-mvp-card" key={card.id}>
                        {card.imageUrl ? <Image src={card.imageUrl} alt={card.cardName} width={84} height={123} /> : null}
                        <div><strong>{card.cardName}</strong><span>{card.featuredDisplayName}</span>{card.note ? <p>{card.note}</p> : null}</div>
                      </div>
                    ))}
                    {entry.mvpCards.length === 0 && !isEditing ? (
                      <p className="ui-empty rounded-[16px] px-4 py-5 text-sm">Noch keine MVP-Karte kuratiert.</p>
                    ) : null}
                  </div>

                  {canCurateMvp && entry.mvpCandidates.length > 0 ? (
                    <div className="mt-4">
                      {!isEditing ? (
                        <button
                          type="button"
                          className="ui-button-secondary"
                          onClick={() => {
                            setEditingMvpTournamentId(entry.tournamentId);
                            setMvpDraft(entry.mvpCards.map((card) => ({ cardId: card.cardId, featuredUserId: card.featuredUserId, note: card.note })));
                          }}
                        >
                          MVP-Karten kuratieren
                        </button>
                      ) : (
                        <div className="tournament-mvp-editor">
                          {[0, 1, 2].map((position) => {
                            const selected = mvpDraft[position];
                            return (
                              <div key={position} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                <select
                                  className="ui-input"
                                  value={selected ? `${selected.featuredUserId}:${selected.cardId}` : ""}
                                  onChange={(event) => {
                                    const [featuredUserId, cardId] = event.target.value.split(":");
                                    setMvpDraft((current) => {
                                      const next = [...current];
                                      if (!event.target.value) next.splice(position, 1);
                                      else next[position] = { featuredUserId, cardId, note: next[position]?.note ?? null };
                                      return next.filter(Boolean);
                                    });
                                  }}
                                >
                                  <option value="">Keine Karte</option>
                                  {entry.mvpCandidates.map((candidate) => (
                                    <option key={`${candidate.featuredUserId}:${candidate.cardId}`} value={`${candidate.featuredUserId}:${candidate.cardId}`}>
                                      {candidate.cardName} · {candidate.featuredDisplayName}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="ui-input"
                                  value={selected?.note ?? ""}
                                  disabled={!selected}
                                  placeholder="Begründung (optional)"
                                  onChange={(event) => setMvpDraft((current) => current.map((item, index) => index === position ? { ...item, note: event.target.value } : item))}
                                />
                                <span className="self-center text-xs text-[#9f8c77]">#{position + 1}</span>
                              </div>
                            );
                          })}
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="ui-button-primary" disabled={pending} onClick={() => void saveMvpCards(entry.tournamentId)}>Speichern</button>
                            <button type="button" className="ui-button-secondary" onClick={() => setEditingMvpTournamentId(null)}>Abbrechen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {leaderboard.winnerArchive.length === 0 ? (
              <div className="ui-empty rounded-[22px] px-5 py-10 text-center text-sm">Abgeschlossene Turniere erscheinen hier dauerhaft.</div>
            ) : null}
          </div>
        ) : null}
      </section>

      {isCreateOpen ? (
        <div className="ui-modal-backdrop" role="presentation" onMouseDown={() => setIsCreateOpen(false)}>
          <div className="ui-modal-card" role="dialog" aria-modal="true" aria-labelledby="create-tournament-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="ui-kicker">Neuer Wettbewerb</p><h2 id="create-tournament-title" className="mt-2 text-xl font-semibold text-[#f0dfcc]">Turnier erstellen</h2></div>
              <button type="button" className="ui-button-secondary" onClick={() => setIsCreateOpen(false)}>Schließen</button>
            </div>
            <div className="mt-5 grid gap-4">
              <label><span className="ui-kicker">Titel</span><input className="ui-input mt-2" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
              <label><span className="ui-kicker">Format</span><input className="ui-input mt-2" value={formatLabel} onChange={(event) => setFormatLabel(event.target.value)} /></label>
              <label><span className="ui-kicker">Beschreibung</span><textarea className="ui-input mt-2 min-h-[110px]" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              {feedback ? <div className="campaign-feedback">{feedback}</div> : null}
              <button type="button" className="ui-button-primary" disabled={pending || !title.trim()} onClick={() => void createTournamentFlow()}>{pending ? "Wird erstellt…" : "Turnier erstellen"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </DuelConsoleScaffold>
  );
}
