"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RunMemberDto, RunProgressionResponse } from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { runClient } from "@/lib/run-client";
import { tournamentClient } from "@/lib/tournament-client";

function parseInteger(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function canManageCampaign(role: PlayGroupRunDto["viewerRole"]) {
  return role === "OWNER" || role === "ORGANIZER";
}

function getCheckpointSetNames(
  checkpoint: RunProgressionResponse["nextCheckpoint"],
) {
  return (
    checkpoint?.unlocks
      .filter((unlock) => unlock.type === "SET")
      .map((unlock) => unlock.setName ?? unlock.setCode ?? "Unbekanntes Pack") ?? []
  );
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
  const [members, setMembers] = useState<RunMemberDto[]>([]);
  const [progression, setProgression] = useState<RunProgressionResponse | null>(null);
  const [inviteDuelistId, setInviteDuelistId] = useState("");
  const [inviteRole, setInviteRole] = useState<RunMemberDto["role"]>("PLAYER");
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isManager = canManageCampaign(activeRun.viewerRole);

  useEffect(() => {
    let isMounted = true;

    async function refreshCampaignData() {
      const [freshMembers, freshProgression] = await Promise.all([
        runClient.listMembers(activeRun.id),
        runClient.getProgression(activeRun.id).catch(() => null),
      ]);

      if (!isMounted) {
        return;
      }

      setMembers(freshMembers);
      setProgression(freshProgression);
    }

    void refreshCampaignData().catch((error) => {
      if (isMounted) {
        setFeedback(
          getApiErrorMessage(error, "Kampagnen-Daten konnten nicht geladen werden."),
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeRun.id]);

  async function refreshMembersAndProgression() {
    const [freshMembers, freshProgression] = await Promise.all([
      runClient.listMembers(activeRun.id),
      runClient.getProgression(activeRun.id).catch(() => null),
    ]);

    setMembers(freshMembers);
    setProgression(freshProgression);
  }

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

  async function inviteCampaignMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isManager) {
      setFeedback("Nur Host oder Organizer koennen Spieler einladen.");
      return;
    }

    const trimmedDuelistId = inviteDuelistId.trim();

    if (!trimmedDuelistId) {
      setFeedback("Bitte eine Duelist-ID eintragen.");
      return;
    }

    setInviting(true);
    setFeedback(null);

    try {
      await runClient.addMember(activeRun.id, {
        duelistId: trimmedDuelistId,
        role: inviteRole,
      });
      setInviteDuelistId("");
      await refreshMembersAndProgression();
      setFeedback("Duelist wurde zur Kampagne hinzugefuegt.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Duelist konnte nicht eingeladen werden."));
    } finally {
      setInviting(false);
    }
  }

  async function unlockNextProgressionStep() {
    if (!isManager) {
      setFeedback("Nur Host oder Organizer koennen Kampagnen-Fortschritt freischalten.");
      return;
    }

    setActionPending(true);
    setFeedback(null);

    try {
      let checkpoint = progression?.nextCheckpoint ?? null;

      if (!checkpoint) {
        const generated = await runClient.generateProgression(activeRun.id, {
          count: 1,
          setsPerCheckpoint: 1,
          includePromos: true,
          includeTournamentPacks: true,
        });
        checkpoint = generated.generatedCheckpoints[0] ?? generated.progression.nextCheckpoint;
      }

      if (!checkpoint) {
        throw new Error("Kein naechster Pack-Step gefunden.");
      }

      const payload = await runClient.applyProgression(activeRun.id, checkpoint.id, {
        force: true,
      });
      setProgression(payload.progression);
      setFeedback(
        `Freigeschaltet: ${checkpoint.title}. Gratispacks wurden als Rewards vorbereitet.`,
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Naechster Pack-Step konnte nicht freigeschaltet werden."));
    } finally {
      setActionPending(false);
    }
  }

  async function createQuickTournament() {
    if (!isManager) {
      setFeedback("Nur Host oder Organizer koennen Turniere starten.");
      return;
    }

    setActionPending(true);
    setFeedback(null);

    try {
      const titleDate = new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());
      const data = await tournamentClient.create({
        title: `${activeRun.name} Cup ${titleDate}`,
        description: "Schnellstart aus den Kampagnen-Einstellungen.",
        formatLabel: "Classic Progression",
      });
      const createdTournamentId = data.tournament.overview.id;

      startTransition(() => {
        router.push(`/tournaments/${createdTournamentId}`);
        router.refresh();
      });
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Turnier konnte nicht gestartet werden."));
    } finally {
      setActionPending(false);
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

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel kicker="Mitglieder" title="Spieler einladen">
          <div className="grid gap-4">
            <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto]" onSubmit={inviteCampaignMember}>
              <label className="block">
                <span className="text-sm font-semibold text-[#f0dfcc]">Duelist-ID</span>
                <input
                  className="ui-input mt-2"
                  value={inviteDuelistId}
                  onChange={(event) => setInviteDuelistId(event.target.value)}
                  placeholder="KAIBA-002"
                  disabled={!isManager || inviting}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[#f0dfcc]">Rolle</span>
                <select
                  className="ui-input mt-2 min-w-[160px]"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as RunMemberDto["role"])}
                  disabled={!isManager || inviting}
                >
                  <option value="PLAYER">Spieler</option>
                  <option value="ORGANIZER">Organizer</option>
                </select>
              </label>
              <button
                className="ui-button-primary self-end"
                type="submit"
                disabled={!isManager || inviting}
              >
                {inviting ? "Laedt ein..." : "Einladen"}
              </button>
            </form>

            <div className="space-y-2">
              {members.length > 0 ? (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#f0dfcc]">{member.displayName}</p>
                      <p className="mt-1 text-xs text-[#baa58a]">{member.duelistId}</p>
                    </div>
                    <span className="rounded-full border border-[rgba(208,170,110,0.2)] px-3 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-[#f3dfbf]">
                      {member.role}
                    </span>
                  </div>
                ))
              ) : (
                <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
                  Mitglieder werden geladen.
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel kicker="Host-Aktionen" title="Kampagne steuern">
          <div className="grid gap-4">
            <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="text-sm font-semibold text-[#f0dfcc]">Naechster Pack-Step</p>
              <p className="mt-2 text-sm leading-7 text-[#baa58a]">
                {progression?.nextCheckpoint
                  ? `${progression.nextCheckpoint.title} (${progression.nextCheckpoint.status})`
                  : "Noch kein weiterer Step generiert."}
              </p>
              {getCheckpointSetNames(progression?.nextCheckpoint ?? null).length > 0 ? (
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#d8bc91]">
                  {getCheckpointSetNames(progression?.nextCheckpoint ?? null).join(", ")}
                </p>
              ) : null}
              <button
                className="ui-button-secondary mt-4"
                type="button"
                disabled={!isManager || actionPending}
                onClick={() => void unlockNextProgressionStep()}
              >
                {actionPending ? "Fuehrt aus..." : "Naechstes Pack freischalten"}
              </button>
            </div>

            <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="text-sm font-semibold text-[#f0dfcc]">Turnier-Schnellstart</p>
              <p className="mt-2 text-sm leading-7 text-[#baa58a]">
                Legt ein neues Kampagnen-Turnier an und oeffnet direkt die Detailseite,
                damit du Teilnehmer und Runden verwalten kannst.
              </p>
              <button
                className="ui-button-primary mt-4"
                type="button"
                disabled={!isManager || actionPending}
                onClick={() => void createQuickTournament()}
              >
                {actionPending ? "Fuehrt aus..." : "Neues Turnier starten"}
              </button>
            </div>

            {!isManager ? (
              <div className="rounded-[18px] border border-[rgba(208,170,110,0.16)] bg-[rgba(208,170,110,0.06)] px-4 py-3 text-sm text-[#f0dfcc]">
                Du bist in dieser Kampagne Spieler. Host-Aktionen sind nur fuer Host
                und Organizer aktiv.
              </div>
            ) : null}
          </div>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
