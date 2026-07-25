"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  AssignableRunRole,
  CampaignRuleConfig,
  CampaignRulePreset,
  CampaignRuleVersionDto,
  RunMemberDto,
  RunProgressionResponse,
} from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { campaignRuleClient } from "@/lib/campaign-rule-client";
import { runClient } from "@/lib/run-client";
import { tournamentClient } from "@/lib/tournament-client";

function parseInteger(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function canManageCampaign(role: PlayGroupRunDto["viewerRole"]) {
  return role === "OWNER" || role === "ORGANIZER";
}

type BuiltInCampaignRulePreset = Exclude<CampaignRulePreset, "CUSTOM">;

function createPresetConfig(options: {
  startingCredits: number;
  packPrice: number;
  displaySize: number;
  initialSetUnlockCount: number;
  setsPerStep: number;
  freePacksPerSetUnlock: number;
  allowProxies: boolean;
  minMainDeck: number;
  tradesEnabled: boolean;
  winnerCredits: number;
  runnerUpCredits: number;
  participationCredits: number;
}): CampaignRuleConfig {
  return {
    economy: {
      startingCredits: options.startingCredits,
      creditLimit: null,
      packPrice: options.packPrice,
      displaySize: options.displaySize,
    },
    progression: {
      initialSetUnlockCount: options.initialSetUnlockCount,
      setsPerStep: options.setsPerStep,
      freePacksPerSetUnlock: options.freePacksPerSetUnlock,
      separatePromoProgression: true,
      catchUpMode: "NONE",
    },
    collection: {
      duplicateRule: "KEEP_ALL",
      printingSpecificBinders: true,
      physicalCopyReservation: true,
    },
    decks: {
      allowProxies: options.allowProxies,
      minMainDeck: options.minMainDeck,
      maxMainDeck: 60,
      maxExtraDeck: 15,
      maxSideDeck: 15,
      tournamentDeckLock: true,
    },
    trades: {
      enabled: options.tradesEnabled,
      allowCredits: false,
      reservationMinutes: 1440,
    },
    tournaments: {
      matchMode: "BEST_OF_THREE",
      requireResultConfirmation: true,
      winnerCredits: options.winnerCredits,
      runnerUpCredits: options.runnerUpCredits,
      participationCredits: options.participationCredits,
    },
    audit: {
      requireReasonForChanges: true,
      activationMode: "IMMEDIATE",
    },
  };
}

const BUILT_IN_PRESET_CONFIGS: Record<BuiltInCampaignRulePreset, CampaignRuleConfig> = {
  CLASSIC_PROGRESSION: createPresetConfig({
    startingCredits: 2400,
    packPrice: 100,
    displaySize: 24,
    initialSetUnlockCount: 5,
    setsPerStep: 1,
    freePacksPerSetUnlock: 24,
    allowProxies: false,
    minMainDeck: 40,
    tradesEnabled: true,
    winnerCredits: 900,
    runnerUpCredits: 500,
    participationCredits: 250,
  }),
  SEALED_LEAGUE: createPresetConfig({
    startingCredits: 0,
    packPrice: 0,
    displaySize: 24,
    initialSetUnlockCount: 1,
    setsPerStep: 1,
    freePacksPerSetUnlock: 24,
    allowProxies: false,
    minMainDeck: 30,
    tradesEnabled: true,
    winnerCredits: 900,
    runnerUpCredits: 500,
    participationCredits: 250,
  }),
  DRAFT_CUBE: createPresetConfig({
    startingCredits: 0,
    packPrice: 0,
    displaySize: 24,
    initialSetUnlockCount: 0,
    setsPerStep: 1,
    freePacksPerSetUnlock: 0,
    allowProxies: true,
    minMainDeck: 40,
    tradesEnabled: false,
    winnerCredits: 0,
    runnerUpCredits: 0,
    participationCredits: 0,
  }),
  TOURNAMENT_LADDER: createPresetConfig({
    startingCredits: 2400,
    packPrice: 100,
    displaySize: 24,
    initialSetUnlockCount: 5,
    setsPerStep: 1,
    freePacksPerSetUnlock: 0,
    allowProxies: false,
    minMainDeck: 40,
    tradesEnabled: true,
    winnerCredits: 900,
    runnerUpCredits: 500,
    participationCredits: 250,
  }),
};

function getActiveRuleVersion(versions: CampaignRuleVersionDto[]) {
  return versions.find((version) => version.status === "ACTIVE") ?? null;
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
  const [startingCredits, setStartingCredits] = useState(String(activeRun.startingCredits));
  const [creditLimit, setCreditLimit] = useState("");
  const [defaultPackPrice, setDefaultPackPrice] = useState(String(activeRun.defaultPackPrice));
  const [defaultDisplaySize, setDefaultDisplaySize] = useState(String(activeRun.defaultDisplaySize));
  const [freePacksPerSetUnlock, setFreePacksPerSetUnlock] = useState(
    String(activeRun.freePacksPerSetUnlock),
  );
  const [initialSetUnlockCount, setInitialSetUnlockCount] = useState(
    String(activeRun.initialSetUnlockCount),
  );
  const [setsPerProgressionStep, setSetsPerProgressionStep] = useState(
    String(activeRun.setsPerProgressionStep),
  );
  const [separatePromoProgression, setSeparatePromoProgression] = useState(
    activeRun.separatePromoProgression,
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
  const [preset, setPreset] = useState<CampaignRulePreset>("CLASSIC_PROGRESSION");
  const [allowProxies, setAllowProxies] = useState(false);
  const [minMainDeck, setMinMainDeck] = useState("40");
  const [maxMainDeck, setMaxMainDeck] = useState("60");
  const [tradesEnabled, setTradesEnabled] = useState(true);
  const [tradeCredits, setTradeCredits] = useState(false);
  const [reservationMinutes, setReservationMinutes] = useState("1440");
  const [matchMode, setMatchMode] = useState<"SINGLE" | "BEST_OF_THREE">("BEST_OF_THREE");
  const [requireResultConfirmation, setRequireResultConfirmation] = useState(true);
  const [activationMode, setActivationMode] = useState<"IMMEDIATE" | "AT_DATE" | "NEXT_PROGRESSION_STEP">("IMMEDIATE");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [ruleVersions, setRuleVersions] = useState<CampaignRuleVersionDto[]>([]);
  const [baseRuleConfig, setBaseRuleConfig] = useState<CampaignRuleVersionDto["config"] | null>(null);
  const [members, setMembers] = useState<RunMemberDto[]>([]);
  const [progression, setProgression] = useState<RunProgressionResponse | null>(null);
  const [inviteDuelistId, setInviteDuelistId] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRunRole>("PLAYER");
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [campaignDataReady, setCampaignDataReady] = useState(false);
  const isManager = canManageCampaign(activeRun.viewerRole);
  const canManageRules = activeRun.viewerRole === "OWNER";

  const applyConfigToForm = useCallback((config: CampaignRuleConfig, nextPreset: CampaignRulePreset) => {
    setBaseRuleConfig(config);
    setPreset(nextPreset);
    setStartingCredits(String(config.economy.startingCredits));
    setCreditLimit(config.economy.creditLimit === null ? "" : String(config.economy.creditLimit));
    setDefaultPackPrice(String(config.economy.packPrice));
    setDefaultDisplaySize(String(config.economy.displaySize));
    setFreePacksPerSetUnlock(String(config.progression.freePacksPerSetUnlock));
    setInitialSetUnlockCount(String(config.progression.initialSetUnlockCount));
    setSetsPerProgressionStep(String(config.progression.setsPerStep));
    setSeparatePromoProgression(config.progression.separatePromoProgression);
    setAllowProxies(config.decks.allowProxies);
    setMinMainDeck(String(config.decks.minMainDeck));
    setMaxMainDeck(String(config.decks.maxMainDeck));
    setTradesEnabled(config.trades.enabled);
    setTradeCredits(false);
    setReservationMinutes(String(config.trades.reservationMinutes));
    setMatchMode(config.tournaments.matchMode);
    setRequireResultConfirmation(config.tournaments.requireResultConfirmation);
    setTournamentWinnerCredits(String(config.tournaments.winnerCredits));
    setTournamentRunnerUpCredits(String(config.tournaments.runnerUpCredits));
    setTournamentParticipationCredits(String(config.tournaments.participationCredits));
    setActivationMode(config.audit.activationMode);
  }, []);

  const applyActiveRuleVersion = useCallback((activeVersion: CampaignRuleVersionDto) => {
    applyConfigToForm(activeVersion.config, activeVersion.preset ?? "CUSTOM");
    setEffectiveAt("");
  }, [applyConfigToForm]);

  function applyPreset(nextPreset: CampaignRulePreset) {
    if (nextPreset === "CUSTOM") {
      setPreset("CUSTOM");
      return;
    }
    applyConfigToForm(BUILT_IN_PRESET_CONFIGS[nextPreset], nextPreset);
  }

  function markPresetAsCustom() {
    setPreset((current) => (current === "CUSTOM" ? current : "CUSTOM"));
  }

  useEffect(() => {
    let isMounted = true;

    async function refreshCampaignData() {
      setCampaignDataReady(false);
      const [freshMembers, freshProgression, freshRuleVersions] = await Promise.all([
        runClient.listMembers(activeRun.id),
        runClient.getProgression(activeRun.id),
        campaignRuleClient.list(activeRun.id),
      ]);

      if (!isMounted) {
        return;
      }

      setMembers(freshMembers);
      setProgression(freshProgression);
      setRuleVersions(freshRuleVersions);
      const activeVersion = getActiveRuleVersion(freshRuleVersions);
      if (!activeVersion) {
        throw new Error("Für diese Kampagne wurde keine aktive Regelversion gefunden.");
      }
      applyActiveRuleVersion(activeVersion);
      setCampaignDataReady(true);
    }

    void refreshCampaignData().catch((error) => {
      if (isMounted) {
        setCampaignDataReady(false);
        setFeedback(
          getApiErrorMessage(error, "Kampagnen-Daten konnten nicht geladen werden."),
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeRun.id, applyActiveRuleVersion]);

  async function refreshMembersAndProgression() {
    const [freshMembers, freshProgression] = await Promise.all([
      runClient.listMembers(activeRun.id),
      runClient.getProgression(activeRun.id).catch(() => null),
    ]);

    setMembers(freshMembers);
    setProgression(freshProgression);
  }

  async function saveCampaignSettings() {
    if (!isManager) {
      setFeedback("Nur Host oder Organizer können Kampagnenregeln ändern.");
      return;
    }
    if (!campaignDataReady || !baseRuleConfig) {
      setFeedback("Die aktive Regelversion ist noch nicht sicher geladen. Bitte lade die Seite erneut.");
      return;
    }
    setSaving(true);
    setFeedback(null);

    const parsedPackPrice = parseInteger(defaultPackPrice);
    const parsedDisplaySize = parseInteger(defaultDisplaySize);
    const parsedFreePacks = parseInteger(freePacksPerSetUnlock);
    const parsedInitialSets = parseInteger(initialSetUnlockCount);
    const parsedSetsPerStep = parseInteger(setsPerProgressionStep);
    const parsedWinnerCredits = parseInteger(tournamentWinnerCredits);
    const parsedRunnerUpCredits = parseInteger(tournamentRunnerUpCredits);
    const parsedParticipationCredits = parseInteger(tournamentParticipationCredits);
    const parsedStartingCredits = parseInteger(startingCredits);
    const parsedCreditLimit = creditLimit.trim() ? parseInteger(creditLimit) : null;
    const parsedMinMainDeck = parseInteger(minMainDeck);
    const parsedMaxMainDeck = parseInteger(maxMainDeck);
    const parsedReservationMinutes = parseInteger(reservationMinutes);

    if (
      parsedPackPrice === null ||
      parsedDisplaySize === null ||
      parsedFreePacks === null ||
      parsedInitialSets === null ||
      parsedSetsPerStep === null ||
      parsedWinnerCredits === null ||
      parsedRunnerUpCredits === null ||
      parsedParticipationCredits === null ||
      parsedStartingCredits === null ||
      (creditLimit.trim() !== "" && parsedCreditLimit === null) ||
      parsedMinMainDeck === null ||
      parsedMaxMainDeck === null ||
      parsedReservationMinutes === null
    ) {
      setSaving(false);
      setFeedback("Bitte ganze Zahlen fuer Packpreise, Gratispacks und Turnier-Credits eingeben.");
      return;
    }

    if (
      parsedPackPrice < 0
      || parsedDisplaySize < 1
      || parsedFreePacks < 0
      || parsedInitialSets < 0
      || parsedSetsPerStep < 1
      || parsedWinnerCredits < 0
      || parsedRunnerUpCredits < 0
      || parsedParticipationCredits < 0
      || parsedStartingCredits < 0
      || (parsedCreditLimit !== null && parsedCreditLimit < parsedStartingCredits)
      || parsedMinMainDeck < 1
      || parsedMaxMainDeck < parsedMinMainDeck
      || parsedReservationMinutes < 1
    ) {
      setSaving(false);
      setFeedback("Bitte prüfe Wertebereiche: keine negativen Credits, Main-Minimum höchstens Maximum und Credit-Limit mindestens Start-Credits.");
      return;
    }

    if (activationMode === "AT_DATE" && !effectiveAt) {
      setSaving(false);
      setFeedback("Bitte wähle ein Aktivierungsdatum.");
      return;
    }
    if (activationMode === "NEXT_PROGRESSION_STEP" && !progression?.nextCheckpoint) {
      setSaving(false);
      setFeedback("Es gibt noch keinen geplanten Progressionsschritt. Erzeuge zuerst den nächsten Schritt.");
      return;
    }

    try {
      const createdVersion = await campaignRuleClient.create(activeRun.id, {
        preset,
        reason: changeReason.trim() || null,
        activateImmediately: activationMode === "IMMEDIATE",
        effectiveAt: activationMode === "AT_DATE" && effectiveAt
          ? new Date(effectiveAt).toISOString()
          : null,
        effectiveCheckpointId: activationMode === "NEXT_PROGRESSION_STEP"
          ? progression?.nextCheckpoint?.id ?? null
          : null,
        config: {
          economy: {
            ...baseRuleConfig.economy,
            startingCredits: parsedStartingCredits,
            creditLimit: parsedCreditLimit,
            packPrice: parsedPackPrice,
            displaySize: parsedDisplaySize,
          },
          progression: {
            ...baseRuleConfig.progression,
            initialSetUnlockCount: parsedInitialSets,
            setsPerStep: parsedSetsPerStep,
            freePacksPerSetUnlock: parsedFreePacks,
            separatePromoProgression,
          },
          collection: baseRuleConfig.collection,
          decks: {
            ...baseRuleConfig.decks,
            allowProxies,
            minMainDeck: parsedMinMainDeck,
            maxMainDeck: parsedMaxMainDeck,
          },
          trades: {
            ...baseRuleConfig.trades,
            enabled: tradesEnabled,
            allowCredits: false,
            reservationMinutes: parsedReservationMinutes,
          },
          tournaments: {
            ...baseRuleConfig.tournaments,
            matchMode,
            requireResultConfirmation,
            winnerCredits: parsedWinnerCredits,
            runnerUpCredits: parsedRunnerUpCredits,
            participationCredits: parsedParticipationCredits,
          },
          audit: {
            ...baseRuleConfig.audit,
            activationMode,
          },
        },
      });
      const freshRuleVersions = await campaignRuleClient.list(activeRun.id);
      const activeVersion = getActiveRuleVersion(freshRuleVersions);
      if (!activeVersion) {
        throw new Error("Die aktive Regelversion konnte nach dem Speichern nicht bestätigt werden.");
      }
      setRuleVersions(freshRuleVersions);
      applyActiveRuleVersion(activeVersion);
      setChangeReason("");
      setFeedback(
        createdVersion.status === "ACTIVE"
          ? `Regelversion ${createdVersion.version} ist jetzt aktiv. Bestehende Wallets wurden nicht verändert.`
          : `Regelversion ${createdVersion.version} wurde als ${createdVersion.status.toLowerCase()} gespeichert.`,
      );
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
            {activeRun.viewerRole === "OWNER" && activeRun.inviteCode ? (
              <div className="rounded-[16px] border border-[rgba(208,170,110,0.18)] bg-[rgba(208,170,110,0.06)] px-4 py-3">
                <p className="ui-kicker">Einladungscode</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <code className="text-lg tracking-[0.16em] text-[#f3dfbf]">
                    {activeRun.inviteCode}
                  </code>
                  <button
                    type="button"
                    className="ui-button-neutral"
                    onClick={() => {
                      void navigator.clipboard.writeText(activeRun.inviteCode ?? "");
                      setFeedback("Einladungscode kopiert.");
                    }}
                  >
                    Code kopieren
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Link className="ui-button-primary" href="/campaigns/custom-packs">
                Custom-Pack-Studio
              </Link>
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
          {!campaignDataReady ? (
            <p role="alert" className="mb-4 rounded-[14px] border border-[rgba(207,91,66,0.35)] bg-[rgba(151,29,20,0.16)] px-4 py-3 text-sm text-[#ffe3ca]">
              Die aktive Regelversion konnte noch nicht vollständig geladen werden. Bearbeitung bleibt gesperrt.
            </p>
          ) : null}
          {!isManager ? (
            <p className="mb-4 text-sm leading-7 text-[#baa58a]">
              Du siehst die aktiven Kampagnenregeln im Lesemodus. Änderungen können nur Host oder Organizer vornehmen.
            </p>
          ) : null}
          <fieldset disabled={!canManageRules || !campaignDataReady || saving} className="contents disabled:opacity-70">
          <div className="mb-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Sandbox-Preset</span>
              <select className="ui-input mt-2" value={preset} onChange={(event) => applyPreset(event.target.value as CampaignRulePreset)}>
                <option value="CLASSIC_PROGRESSION">Classic Progression</option>
                <option value="SEALED_LEAGUE">Sealed League</option>
                <option value="DRAFT_CUBE">Draft / Cube</option>
                <option value="TOURNAMENT_LADDER">Tournament Ladder</option>
                <option value="CUSTOM">Vollständig benutzerdefiniert</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Start-Credits</span>
              <input className="ui-input mt-2" inputMode="numeric" value={startingCredits} onChange={(event) => { markPresetAsCustom(); setStartingCredits(event.target.value); }} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credit-Limit (optional)</span>
              <input className="ui-input mt-2" inputMode="numeric" value={creditLimit} onChange={(event) => { markPresetAsCustom(); setCreditLimit(event.target.value); }} placeholder="Kein Limit" />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Packpreis</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={defaultPackPrice}
                onChange={(event) => { markPresetAsCustom(); setDefaultPackPrice(event.target.value); }}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Display-Groesse</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={defaultDisplaySize}
                onChange={(event) => { markPresetAsCustom(); setDefaultDisplaySize(event.target.value); }}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Gratispacks je neuem Pack</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={freePacksPerSetUnlock}
                onChange={(event) => { markPresetAsCustom(); setFreePacksPerSetUnlock(event.target.value); }}
              />
            </label>
          </div>
          <p className="mt-3 text-sm leading-7 text-[#baa58a]">
            Beim Freischalten eines neuen Booster-Sets bekommen alle Kampagnenmitglieder
            diese Anzahl als kostenlose Reward-Packs. Standard ist ein Display.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Sets zum Kampagnenstart</span>
              <input className="ui-input mt-2" inputMode="numeric" value={initialSetUnlockCount} onChange={(event) => { markPresetAsCustom(); setInitialSetUnlockCount(event.target.value); }} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Sets pro Fortschritt</span>
              <input className="ui-input mt-2" inputMode="numeric" value={setsPerProgressionStep} onChange={(event) => { markPresetAsCustom(); setSetsPerProgressionStep(event.target.value); }} />
            </label>
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={separatePromoProgression} onChange={(event) => { markPresetAsCustom(); setSeparatePromoProgression(event.target.checked); }} />
              <span className="text-sm font-semibold text-[#f0dfcc]">Promos getrennt freischalten</span>
            </label>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 1</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentWinnerCredits}
                onChange={(event) => { markPresetAsCustom(); setTournamentWinnerCredits(event.target.value); }}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 2</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentRunnerUpCredits}
                onChange={(event) => { markPresetAsCustom(); setTournamentRunnerUpCredits(event.target.value); }}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 3-8</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value={tournamentParticipationCredits}
                onChange={(event) => { markPresetAsCustom(); setTournamentParticipationCredits(event.target.value); }}
              />
            </label>
          </div>
          <p className="mt-3 text-sm leading-7 text-[#baa58a]">
            Diese Turnier-Credits werden in neu generierte Kampagnen-Checkpoints geschrieben
            und dienen als Pack-Waehrung fuer den freigeschalteten Shop.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Main Deck Minimum</span>
              <input className="ui-input mt-2" inputMode="numeric" value={minMainDeck} onChange={(event) => { markPresetAsCustom(); setMinMainDeck(event.target.value); }} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Main Deck Maximum</span>
              <input className="ui-input mt-2" inputMode="numeric" value={maxMainDeck} onChange={(event) => { markPresetAsCustom(); setMaxMainDeck(event.target.value); }} />
            </label>
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={allowProxies} onChange={(event) => { markPresetAsCustom(); setAllowProxies(event.target.checked); }} />
              <span className="text-sm font-semibold text-[#f0dfcc]">Proxies erlauben</span>
            </label>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={tradesEnabled} onChange={(event) => { markPresetAsCustom(); setTradesEnabled(event.target.checked); }} />
              <span className="text-sm font-semibold text-[#f0dfcc]">Tauschen aktiviert</span>
            </label>
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={tradeCredits} disabled />
              <span className="text-sm font-semibold text-[#f0dfcc]">Credits in Trades (noch nicht verfügbar)</span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Reservierung (Minuten)</span>
              <input className="ui-input mt-2" inputMode="numeric" value={reservationMinutes} onChange={(event) => { markPresetAsCustom(); setReservationMinutes(event.target.value); }} />
            </label>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Matchmodus</span>
              <select className="ui-input mt-2" value={matchMode} onChange={(event) => { markPresetAsCustom(); setMatchMode(event.target.value as typeof matchMode); }}>
                <option value="BEST_OF_THREE">Best of Three</option>
                <option value="SINGLE">Single Duel</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={requireResultConfirmation} onChange={(event) => { markPresetAsCustom(); setRequireResultConfirmation(event.target.checked); }} />
              <span className="text-sm font-semibold text-[#f0dfcc]">Ergebnis bestätigen</span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Aktivierung</span>
              <select className="ui-input mt-2" value={activationMode} onChange={(event) => { markPresetAsCustom(); setActivationMode(event.target.value as typeof activationMode); }}>
                <option value="IMMEDIATE">Sofort</option>
                <option value="AT_DATE">Zu einem Datum</option>
                <option value="NEXT_PROGRESSION_STEP">Nächster Progressionsschritt</option>
              </select>
            </label>
          </div>
          {activationMode === "AT_DATE" ? (
            <label className="mt-4 block max-w-sm">
              <span className="text-sm font-semibold text-[#f0dfcc]">Aktiv ab</span>
              <input className="ui-input mt-2" type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} />
            </label>
          ) : null}
          {canManageRules ? (
            <label className="mt-4 block max-w-2xl">
              <span className="text-sm font-semibold text-[#f0dfcc]">Begründung der Änderung</span>
              <textarea
                className="ui-input mt-2 min-h-24"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="Warum werden diese Kampagnenregeln geändert?"
              />
            </label>
          ) : null}
          {feedback ? (
            <div role="status" aria-live="polite" className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
              {feedback}
            </div>
          ) : null}
          {canManageRules ? (
            <button
              className="ui-button-primary mt-4 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={saving || !campaignDataReady}
              onClick={() => void saveCampaignSettings()}
            >
              {saving ? "Speichert..." : activationMode === "IMMEDIATE" ? "Neue Regelversion aktivieren" : "Regelversion planen"}
            </button>
          ) : null}
          </fieldset>
          <div className="mt-5 flex flex-wrap gap-2">
            {ruleVersions.slice(0, 6).map((version) => (
              <span key={version.id} className="rounded-full border border-[rgba(208,170,110,0.2)] px-3 py-1 text-xs text-[#d8bc91]">
                v{version.version} · {version.status} · {version.preset ?? "CUSTOM"}
              </span>
            ))}
          </div>
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
                  onChange={(event) => setInviteRole(event.target.value as AssignableRunRole)}
                  disabled={!isManager || inviting}
                >
                  <option value="PLAYER">Spieler</option>
                  {activeRun.viewerRole === "OWNER" ? (
                    <option value="ORGANIZER">Organizer</option>
                  ) : null}
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
