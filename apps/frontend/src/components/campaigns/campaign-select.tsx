"use client";

import { startTransition, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayGroupRunDto } from "@ygo/contracts";
import { AssetIcon } from "@/components/asset-icon";
import { getApiErrorMessage } from "@/lib/api-client";
import { runClient } from "@/lib/run-client";

type CampaignSelectProps = {
  activeRunId: string | null;
  runs: PlayGroupRunDto[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function roleLabel(role: PlayGroupRunDto["viewerRole"]) {
  switch (role) {
    case "OWNER":
      return "Host";
    case "ORGANIZER":
      return "Organizer";
    default:
      return "Spieler";
  }
}

function parseIntegerField(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

export function CampaignSelect({
  activeRunId,
  runs,
}: CampaignSelectProps) {
  const router = useRouter();
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [startingCredits, setStartingCredits] = useState("2400");
  const [defaultPackPrice, setDefaultPackPrice] = useState("100");
  const [defaultDisplaySize, setDefaultDisplaySize] = useState("24");
  const [freePacksPerSetUnlock, setFreePacksPerSetUnlock] = useState("24");
  const [tournamentWinnerCredits, setTournamentWinnerCredits] = useState("900");
  const [tournamentRunnerUpCredits, setTournamentRunnerUpCredits] = useState("500");
  const [tournamentParticipationCredits, setTournamentParticipationCredits] = useState("250");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null,
    [activeRunId, runs],
  );

  async function activateRun(runId: string, target = "/") {
    setPendingRunId(runId);
    setErrorMessage(null);

    try {
      await runClient.setActive(runId);

      startTransition(() => {
        router.push(target);
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Kampagne konnte nicht aktiviert werden."),
      );
    } finally {
      setPendingRunId(null);
    }
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Bitte einen Kampagnennamen angeben.");
      return;
    }

    const parsedStartingCredits = parseIntegerField(startingCredits);
    const parsedPackPrice = parseIntegerField(defaultPackPrice);
    const parsedDisplaySize = parseIntegerField(defaultDisplaySize);
    const parsedFreePacks = parseIntegerField(freePacksPerSetUnlock);
    const parsedWinnerCredits = parseIntegerField(tournamentWinnerCredits);
    const parsedRunnerUpCredits = parseIntegerField(tournamentRunnerUpCredits);
    const parsedParticipationCredits = parseIntegerField(tournamentParticipationCredits);

    if (
      parsedStartingCredits === null ||
      parsedPackPrice === null ||
      parsedDisplaySize === null ||
      parsedFreePacks === null ||
      parsedWinnerCredits === null ||
      parsedRunnerUpCredits === null ||
      parsedParticipationCredits === null
    ) {
      setErrorMessage("Bitte ganze Zahlen fuer alle Kampagnenwerte eingeben.");
      return;
    }

    setCreating(true);
    setErrorMessage(null);

    try {
      const response = await runClient.create({
        name: trimmedName,
        startingCredits: parsedStartingCredits,
        defaultPackPrice: parsedPackPrice,
        defaultDisplaySize: parsedDisplaySize,
        freePacksPerSetUnlock: parsedFreePacks,
        tournamentWinnerCredits: parsedWinnerCredits,
        tournamentRunnerUpCredits: parsedRunnerUpCredits,
        tournamentParticipationCredits: parsedParticipationCredits,
      });

      startTransition(() => {
        router.push("/");
        router.refresh();
      });
      void response;
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Kampagne konnte nicht erstellt werden."),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="hero-surface rounded-[28px] px-6 py-7">
          <p className="ui-kicker">Account-Kontext</p>
          <h1 className="font-display inscription-text mt-4 text-[3.3rem] leading-[0.94] sm:text-[4.5rem]">
            Kampagne wählen
          </h1>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <div className="rounded-[18px] border border-[rgba(184,142,89,0.14)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="ui-kicker">Aktiv</p>
              <p className="mt-2 text-lg font-semibold text-[#f0dcc0]">
                {activeRun?.name ?? "Keine Kampagne"}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(184,142,89,0.14)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="ui-kicker">Beigetreten</p>
              <p className="mt-2 text-lg font-semibold text-[#f0dcc0]">
                {runs.length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(184,142,89,0.14)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="ui-kicker">Trennung</p>
              <p className="mt-2 text-lg font-semibold text-[#f0dcc0]">
                Sammlung pro Kampagne
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={createCampaign}
          className="panel-surface rounded-[28px] px-6 py-7"
        >
          <p className="ui-kicker">Neue Kampagne</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              className="ui-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="z.B. Goat Progression 2005"
            />
            <button
              type="submit"
              className="ui-button-primary min-h-[52px]"
              disabled={creating}
            >
              {creating ? "Erstelle..." : "Erstellen"}
            </button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <label className="block">
              <span className="ui-kicker">Startcredits</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={startingCredits}
                onChange={(event) => setStartingCredits(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Packpreis</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={defaultPackPrice}
                onChange={(event) => setDefaultPackPrice(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Displaygröße</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={defaultDisplaySize}
                onChange={(event) => setDefaultDisplaySize(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Gratispacks</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={freePacksPerSetUnlock}
                onChange={(event) => setFreePacksPerSetUnlock(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="ui-kicker">Credits Platz 1</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentWinnerCredits}
                onChange={(event) => setTournamentWinnerCredits(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Credits Platz 2</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentRunnerUpCredits}
                onChange={(event) => setTournamentRunnerUpCredits(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Credits Platz 3-8</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentParticipationCredits}
                onChange={(event) => setTournamentParticipationCredits(event.target.value)}
              />
            </label>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#cdb79c]">
            Gratispacks meint die kostenlosen Packs, die Spieler beim Freischalten
            eines neuen Boosters direkt bekommen. Standard ist ein Display.
          </p>
        </form>
      </section>

      {errorMessage ? (
        <div className="rounded-[18px] border border-[rgba(204,97,78,0.22)] bg-[rgba(141,61,48,0.14)] px-4 py-3 text-sm text-[#ffd8cf]">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {runs.map((run) => {
          const isActive = run.id === activeRunId;
          const pending = pendingRunId === run.id;

          return (
            <article
              key={run.id}
              className="rounded-[24px] border border-[rgba(184,142,89,0.14)] bg-[linear-gradient(180deg,rgba(18,22,28,0.78),rgba(10,13,18,0.94))] px-5 py-5 shadow-[0_18px_38px_rgba(0,0,0,0.2)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-[2rem] leading-none text-[#f0dcc0]">
                      {run.name}
                    </h2>
                    {isActive ? (
                      <span className="rounded-full border border-[rgba(208,170,110,0.28)] bg-[rgba(208,170,110,0.1)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#f3dfbf]">
                        Aktiv
                      </span>
                    ) : null}
                  </div>
                  {run.description ? (
                    <p className="mt-3 text-sm leading-7 text-[#cdb79c]">
                      {run.description}
                    </p>
                  ) : null}
                </div>
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[rgba(208,170,110,0.18)] bg-[rgba(255,255,255,0.04)] text-[#d8bc91]">
                  <AssetIcon name="shield" className="h-6 w-6 text-current" />
                </div>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-[#cdb79c] sm:grid-cols-3">
                <span>{roleLabel(run.viewerRole)}</span>
                <span>{run.memberCount} Mitglied(er)</span>
                <span>Seit {formatDate(run.createdAt)}</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void activateRun(run.id)}
                  className={isActive ? "ui-button-primary" : "ui-button-neutral"}
                  disabled={pending}
                >
                  {pending
                    ? "Wechsle..."
                    : isActive
                      ? "Dashboard öffnen"
                      : "Kampagne öffnen"}
                </button>
                <button
                  type="button"
                  onClick={() => void activateRun(run.id, "/campaigns/settings")}
                  className="ui-button-neutral"
                  disabled={pending}
                >
                  Kampagnen-Einstellungen
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {runs.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[rgba(184,142,89,0.18)] bg-[rgba(255,255,255,0.02)] px-5 py-8 text-center text-sm text-[#cdb79c]">
          Noch keine Kampagne. Erstelle oben eine neue Progression-Runde.
        </div>
      ) : null}

      <div className="flex justify-end">
        <Link href="/" className="ui-button-neutral">
          Zur aktiven Kampagne
        </Link>
      </div>
    </div>
  );
}
