"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { runClient } from "@/lib/run-client";

function parseInteger(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

export function CampaignSettingsConsole({
  session,
  activeRun,
}: {
  session: ViewerSession;
  activeRun: PlayGroupRunDto;
}) {
  const router = useRouter();
  const [defaultPackPrice, setDefaultPackPrice] = useState(String(activeRun.defaultPackPrice));
  const [defaultDisplaySize, setDefaultDisplaySize] = useState(String(activeRun.defaultDisplaySize));
  const [freePacksPerSetUnlock, setFreePacksPerSetUnlock] = useState(
    String(activeRun.freePacksPerSetUnlock),
  );
  const [tournamentWinnerCredits, setTournamentWinnerCredits] = useState(
    String(activeRun.tournamentWinnerCredits),
  );
  const [tournamentRunnerUpCredits, setTournamentRunnerUpCredits] = useState(
    String(activeRun.tournamentRunnerUpCredits),
  );
  const [tournamentParticipationCredits, setTournamentParticipationCredits] = useState(
    String(activeRun.tournamentParticipationCredits),
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function saveCampaignSettings() {
    setSaving(true);
    setFeedback(null);

    const parsedPackPrice = parseInteger(defaultPackPrice);
    const parsedDisplaySize = parseInteger(defaultDisplaySize);
    const parsedFreePacks = parseInteger(freePacksPerSetUnlock);
    const parsedWinnerCredits = parseInteger(tournamentWinnerCredits);
    const parsedRunnerUpCredits = parseInteger(tournamentRunnerUpCredits);
    const parsedParticipationCredits = parseInteger(tournamentParticipationCredits);

    if (
      parsedPackPrice === null ||
      parsedDisplaySize === null ||
      parsedFreePacks === null ||
      parsedWinnerCredits === null ||
      parsedRunnerUpCredits === null ||
      parsedParticipationCredits === null
    ) {
      setSaving(false);
      setFeedback("Bitte ganze Zahlen fuer Packpreise, Gratispacks und Turnier-Credits eingeben.");
      return;
    }

    try {
      const updatedRun = await runClient.updateSettings(activeRun.id, {
        defaultPackPrice: parsedPackPrice,
        defaultDisplaySize: parsedDisplaySize,
        freePacksPerSetUnlock: parsedFreePacks,
        tournamentWinnerCredits: parsedWinnerCredits,
        tournamentRunnerUpCredits: parsedRunnerUpCredits,
        tournamentParticipationCredits: parsedParticipationCredits,
      });

      setDefaultPackPrice(String(updatedRun.defaultPackPrice));
      setDefaultDisplaySize(String(updatedRun.defaultDisplaySize));
      setFreePacksPerSetUnlock(String(updatedRun.freePacksPerSetUnlock));
      setTournamentWinnerCredits(String(updatedRun.tournamentWinnerCredits));
      setTournamentRunnerUpCredits(String(updatedRun.tournamentRunnerUpCredits));
      setTournamentParticipationCredits(String(updatedRun.tournamentParticipationCredits));
      setFeedback("Kampagnen-Einstellungen gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Kampagnen-Einstellungen konnten nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath="/campaigns"
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        { icon: "shield", label: "Kampagne", value: activeRun.name },
        { icon: "users", label: "Mitglieder", value: String(activeRun.memberCount) },
        { icon: "package", label: "Startcredits", value: String(activeRun.startingCredits) },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel kicker="Kampagne" title={activeRun.name}>
          <div className="grid gap-4">
            <p className="text-sm leading-7 text-[#baa58a]">
              Diese Einstellungen gelten nur fuer diese Kampagne. Profil, Desktop,
              Freundesliste und Asset-Cache bleiben getrennt unter den Account-Einstellungen.
            </p>
            <div className="flex flex-wrap gap-3">
              <StatPill label="Status" value={activeRun.status} tone="gold" />
              <StatPill label="Rolle" value={activeRun.viewerRole} tone="teal" />
              <StatPill label="Startcredits" value={String(activeRun.startingCredits)} tone="slate" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="ui-button-neutral" href="/campaigns">
                Kampagne wechseln
              </Link>
              <Link className="ui-button-secondary" href="/">
                Dashboard öffnen
              </Link>
            </div>
          </div>
        </Panel>

        <Panel kicker="Regeln" title="Pack- und Turnierwerte">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Packpreis</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={defaultPackPrice}
                onChange={(event) => setDefaultPackPrice(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Display-Groesse</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={defaultDisplaySize}
                onChange={(event) => setDefaultDisplaySize(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Gratispacks je neuem Pack</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={freePacksPerSetUnlock}
                onChange={(event) => setFreePacksPerSetUnlock(event.target.value)}
              />
            </label>
          </div>
          <p className="mt-3 text-sm leading-7 text-[#baa58a]">
            Beim Freischalten eines neuen Booster-Sets bekommen alle Kampagnenmitglieder
            diese Anzahl als kostenlose Reward-Packs. Standard ist ein Display.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 1</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentWinnerCredits}
                onChange={(event) => setTournamentWinnerCredits(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 2</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentRunnerUpCredits}
                onChange={(event) => setTournamentRunnerUpCredits(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 3-8</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentParticipationCredits}
                onChange={(event) => setTournamentParticipationCredits(event.target.value)}
              />
            </label>
          </div>
          <p className="mt-3 text-sm leading-7 text-[#baa58a]">
            Diese Turnier-Credits werden in neu generierte Kampagnen-Checkpoints geschrieben
            und dienen als Pack-Waehrung fuer den freigeschalteten Shop.
          </p>
          {feedback ? (
            <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
              {feedback}
            </div>
          ) : null}
          <button
            className="ui-button-primary mt-4"
            type="button"
            disabled={saving}
            onClick={() => void saveCampaignSettings()}
          >
            {saving ? "Speichert..." : "Kampagnen-Einstellungen speichern"}
          </button>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
