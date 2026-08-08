"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type {
  AssignableRunRole,
  CampaignRuleConfig,
  CampaignRulePreset,
  CampaignRuleVersionDto,
  CreateRewardGrantRequest,
  RewardGrantDto,
  RunJoinRequestDto,
  RunMemberDto,
  RunProgressionResponse,
} from "@ygo/contracts";
import { campaignRuleConfigSchema } from "@ygo/contracts";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { CampaignPackAccessPanel } from "@/components/campaign-pack-access-panel";
import { ImageCropUpload } from "@/components/image-crop-upload";
import { Panel, StatPill } from "@/components/panel";
import { apiPostJson, getApiErrorMessage } from "@/lib/api-client";
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
type CampaignSettingsSection =
  | "ECONOMY"
  | "PROGRESSION"
  | "COLLECTION"
  | "DECKS"
  | "TRADES"
  | "TOURNAMENTS"
  | "ACTIVATION";

type CampaignWorkspaceSection =
  | "OVERVIEW"
  | "PACKS"
  | "CUSTOM_PACKS"
  | "ECONOMY"
  | "DECKS_TRADES"
  | "TOURNAMENTS"
  | "MEMBERS"
  | "HISTORY";

type CampaignDraft = {
  advancedRuleConfig?: CampaignRuleConfig;
  preset: CampaignRulePreset;
  startingCredits: string;
  creditLimit: string;
  defaultPackPrice: string;
  defaultDisplaySize: string;
  freePacksPerSetUnlock: string;
  initialSetUnlockCount: string;
  setsPerProgressionStep: string;
  separatePromoProgression: boolean;
  allowProxies: boolean;
  minMainDeck: string;
  maxMainDeck: string;
  tradesEnabled: boolean;
  reservationMinutes: string;
  matchMode: CampaignRuleConfig["tournaments"]["matchMode"];
  requireResultConfirmation: boolean;
  tournamentWinnerCredits: string;
  tournamentRunnerUpCredits: string;
  tournamentParticipationCredits: string;
  activationMode: "IMMEDIATE" | "AT_DATE" | "NEXT_PROGRESSION_STEP";
  effectiveAt: string;
  changeReason: string;
};

function formatRuleValue(value: unknown) {
  if (value === null || value === "") return "Kein Wert";
  if (typeof value === "boolean") return value ? "Aktiv" : "Inaktiv";
  return String(value);
}

function collectRuleChanges(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  prefix = "",
): Array<{ label: string; from: string; to: string }> {
  return Object.keys(next).flatMap((key) => {
    const label = prefix ? `${prefix} · ${key}` : key;
    const fromValue = previous[key];
    const toValue = next[key];
    if (
      fromValue &&
      toValue &&
      typeof fromValue === "object" &&
      typeof toValue === "object" &&
      !Array.isArray(fromValue) &&
      !Array.isArray(toValue)
    ) {
      return collectRuleChanges(
        fromValue as Record<string, unknown>,
        toValue as Record<string, unknown>,
        label,
      );
    }
    return JSON.stringify(fromValue) === JSON.stringify(toValue)
      ? []
      : [{ label, from: formatRuleValue(fromValue), to: formatRuleValue(toValue) }];
  });
}

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
  return campaignRuleConfigSchema.parse({
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
  });
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
  const [defaultDisplaySize, setDefaultDisplaySize] = useState("24");
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
  const [reservationMinutes, setReservationMinutes] = useState("1440");
  const [matchMode, setMatchMode] = useState<CampaignRuleConfig["tournaments"]["matchMode"]>("BEST_OF_THREE");
  const [requireResultConfirmation, setRequireResultConfirmation] = useState(true);
  const [activationMode, setActivationMode] = useState<"IMMEDIATE" | "AT_DATE" | "NEXT_PROGRESSION_STEP">("IMMEDIATE");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [ruleVersions, setRuleVersions] = useState<CampaignRuleVersionDto[]>([]);
  const [baseRuleConfig, setBaseRuleConfig] = useState<CampaignRuleVersionDto["config"] | null>(null);
  const [advancedRuleConfig, setAdvancedRuleConfig] = useState<CampaignRuleConfig | null>(null);
  const [members, setMembers] = useState<RunMemberDto[]>([]);
  const [joinRequests, setJoinRequests] = useState<RunJoinRequestDto[]>([]);
  const [progression, setProgression] = useState<RunProgressionResponse | null>(null);
  const [inviteDuelistId, setInviteDuelistId] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableRunRole>("PLAYER");
  const [creditRecipientDuelistId, setCreditRecipientDuelistId] = useState("");
  const [creditGrantAmount, setCreditGrantAmount] = useState("500");
  const [creditGrantReason, setCreditGrantReason] = useState("Host-Gutschrift");
  const [grantingCredits, setGrantingCredits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [workspaceSection, setWorkspaceSection] =
    useState<CampaignWorkspaceSection>("OVERVIEW");
  const [campaignName, setCampaignName] = useState(activeRun.name);
  const [campaignDescription, setCampaignDescription] = useState(activeRun.description ?? "");
  const [campaignStatus, setCampaignStatus] = useState<PlayGroupRunDto["status"]>(activeRun.status);
  const [campaignImageAssetId, setCampaignImageAssetId] = useState(activeRun.campaignImageAssetId);
  const [campaignImageUrl, setCampaignImageUrl] = useState(activeRun.campaignImageUrl);
  const [campaignRegion, setCampaignRegion] = useState(activeRun.region);
  const [campaignLanguage, setCampaignLanguage] = useState(activeRun.language);
  const [campaignTimeZone, setCampaignTimeZone] = useState(activeRun.timeZone);
  const [campaignVisibility, setCampaignVisibility] = useState(activeRun.visibility);
  const [campaignJoinType, setCampaignJoinType] = useState(activeRun.joinType);
  const [campaignMaxPlayers, setCampaignMaxPlayers] = useState(activeRun.maxPlayers === null ? "" : String(activeRun.maxPlayers));
  const [campaignStartsAt, setCampaignStartsAt] = useState(activeRun.startsAt?.slice(0, 16) ?? "");
  const [campaignEndsAt, setCampaignEndsAt] = useState(activeRun.endsAt?.slice(0, 16) ?? "");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [campaignDataReady, setCampaignDataReady] = useState(false);
  const [activeSection, setActiveSection] =
    useState<CampaignSettingsSection>("ECONOMY");
  const [baseRuleVersionId, setBaseRuleVersionId] = useState<string | null>(null);
  const [reviewChanges, setReviewChanges] = useState<
    Array<{ label: string; from: string; to: string }>
  >([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isManager = canManageCampaign(activeRun.viewerRole);
  const canManageRules = activeRun.viewerRole === "OWNER";
  const handleFeedback = useCallback((message: string) => setFeedback(message), []);

  function selectWorkspaceSection(section: CampaignWorkspaceSection) {
    setWorkspaceSection(section);
    const ruleSection: Partial<Record<CampaignWorkspaceSection, CampaignSettingsSection>> = {
      PACKS: "PROGRESSION",
      ECONOMY: "ECONOMY",
      DECKS_TRADES: "DECKS",
      TOURNAMENTS: "TOURNAMENTS",
      HISTORY: "ACTIVATION",
    };
    if (ruleSection[section]) setActiveSection(ruleSection[section]);
  }

  async function saveCampaignIdentity() {
    if (!canManageRules) {
      setFeedback("Nur der Kampagnen-Owner kann Name, Beschreibung und Status ändern.");
      return;
    }
    setIdentitySaving(true);
    setFeedback(null);
    try {
      await runClient.updateSettings(activeRun.id, {
        name: campaignName.trim(),
        description: campaignDescription.trim() || null,
        status: campaignStatus,
        campaignImageAssetId,
        region: campaignRegion,
        language: campaignLanguage.trim(),
        timeZone: campaignTimeZone.trim(),
        visibility: campaignVisibility,
        joinType: campaignJoinType,
        maxPlayers: campaignMaxPlayers.trim() ? Number(campaignMaxPlayers) : null,
        startsAt: campaignStartsAt ? new Date(campaignStartsAt).toISOString() : null,
        endsAt: campaignEndsAt ? new Date(campaignEndsAt).toISOString() : null,
      });
      setFeedback("Kampagnenprofil wurde gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Kampagnenprofil konnte nicht gespeichert werden."));
    } finally {
      setIdentitySaving(false);
    }
  }

  const applyConfigToForm = useCallback((config: CampaignRuleConfig, nextPreset: CampaignRulePreset) => {
    setBaseRuleConfig(config);
    setAdvancedRuleConfig(structuredClone(config));
    setPreset(nextPreset);
    setStartingCredits(String(config.economy.startingCredits));
    setCreditLimit(config.economy.creditLimit === null ? "" : String(config.economy.creditLimit));
    setDefaultPackPrice(String(config.economy.packPrice));
    setDefaultDisplaySize("24");
    setFreePacksPerSetUnlock(String(config.progression.freePacksPerSetUnlock));
    setInitialSetUnlockCount(String(config.progression.initialSetUnlockCount));
    setSetsPerProgressionStep(String(config.progression.setsPerStep));
    setSeparatePromoProgression(config.progression.separatePromoProgression);
    setAllowProxies(config.decks.allowProxies);
    setMinMainDeck(String(config.decks.minMainDeck));
    setMaxMainDeck(String(config.decks.maxMainDeck));
    setTradesEnabled(config.trades.enabled);
    setReservationMinutes(String(config.trades.reservationMinutes));
    setMatchMode(config.tournaments.matchMode);
    setRequireResultConfirmation(config.tournaments.requireResultConfirmation);
    setTournamentWinnerCredits(String(config.tournaments.winnerCredits));
    setTournamentRunnerUpCredits(String(config.tournaments.runnerUpCredits));
    setTournamentParticipationCredits(String(config.tournaments.participationCredits));
    setActivationMode(config.audit.activationMode);
  }, []);

  const applyActiveRuleVersion = useCallback((activeVersion: CampaignRuleVersionDto) => {
    setBaseRuleVersionId(activeVersion.id);
    applyConfigToForm(activeVersion.config, activeVersion.preset ?? "CUSTOM");
    setEffectiveAt("");
  }, [applyConfigToForm]);

  const applyDraftToForm = useCallback((draft: CampaignDraft) => {
    const parsedAdvanced = campaignRuleConfigSchema.safeParse(draft.advancedRuleConfig);
    if (parsedAdvanced.success) setAdvancedRuleConfig(parsedAdvanced.data);
    setPreset(draft.preset);
    setStartingCredits(draft.startingCredits);
    setCreditLimit(draft.creditLimit);
    setDefaultPackPrice(draft.defaultPackPrice);
    setDefaultDisplaySize(draft.defaultDisplaySize);
    setFreePacksPerSetUnlock(draft.freePacksPerSetUnlock);
    setInitialSetUnlockCount(draft.initialSetUnlockCount);
    setSetsPerProgressionStep(draft.setsPerProgressionStep);
    setSeparatePromoProgression(draft.separatePromoProgression);
    setAllowProxies(draft.allowProxies);
    setMinMainDeck(draft.minMainDeck);
    setMaxMainDeck(draft.maxMainDeck);
    setTradesEnabled(draft.tradesEnabled);
    setReservationMinutes(draft.reservationMinutes);
    setMatchMode(draft.matchMode);
    setRequireResultConfirmation(draft.requireResultConfirmation);
    setTournamentWinnerCredits(draft.tournamentWinnerCredits);
    setTournamentRunnerUpCredits(draft.tournamentRunnerUpCredits);
    setTournamentParticipationCredits(draft.tournamentParticipationCredits);
    setActivationMode(draft.activationMode);
    setEffectiveAt(draft.effectiveAt);
    setChangeReason(draft.changeReason);
  }, []);

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

  function updateAdvancedSection<K extends keyof CampaignRuleConfig>(
    section: K,
    patch: Partial<CampaignRuleConfig[K]>,
  ) {
    markPresetAsCustom();
    setAdvancedRuleConfig((current) => current ? {
      ...current,
      [section]: { ...current[section], ...patch },
    } : current);
  }

  function toggleRuleList<T extends string>(items: T[], value: T) {
    return items.includes(value)
      ? items.filter((item) => item !== value)
      : [...items, value];
  }

  useEffect(() => {
    let isMounted = true;

    async function refreshCampaignData() {
      setCampaignDataReady(false);
      const [freshMembers, freshProgression, freshRuleVersions, freshJoinRequests] = await Promise.all([
        runClient.listMembers(activeRun.id),
        runClient.getProgression(activeRun.id),
        campaignRuleClient.list(activeRun.id),
        isManager ? runClient.listJoinRequests(activeRun.id) : Promise.resolve([]),
      ]);

      if (!isMounted) {
        return;
      }

      setMembers(freshMembers);
      setJoinRequests(freshJoinRequests);
      setProgression(freshProgression);
      setRuleVersions(freshRuleVersions);
      const activeVersion = getActiveRuleVersion(freshRuleVersions);
      if (!activeVersion) {
        throw new Error("Für diese Kampagne wurde keine aktive Regelversion gefunden.");
      }
      applyActiveRuleVersion(activeVersion);
      const savedDraft = window.localStorage.getItem(
        `campaign-rule-draft:${activeRun.id}:${activeVersion.id}`,
      );
      if (savedDraft) {
        try {
          applyDraftToForm(JSON.parse(savedDraft) as CampaignDraft);
        } catch {
          window.localStorage.removeItem(
            `campaign-rule-draft:${activeRun.id}:${activeVersion.id}`,
          );
        }
      }
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
  }, [activeRun.id, applyActiveRuleVersion, applyDraftToForm, isManager]);

  useEffect(() => {
    if (!campaignDataReady || !baseRuleVersionId || !canManageRules) return;
    const draft: CampaignDraft = {
      advancedRuleConfig: advancedRuleConfig ?? undefined,
      preset,
      startingCredits,
      creditLimit,
      defaultPackPrice,
      defaultDisplaySize,
      freePacksPerSetUnlock,
      initialSetUnlockCount,
      setsPerProgressionStep,
      separatePromoProgression,
      allowProxies,
      minMainDeck,
      maxMainDeck,
      tradesEnabled,
      reservationMinutes,
      matchMode,
      requireResultConfirmation,
      tournamentWinnerCredits,
      tournamentRunnerUpCredits,
      tournamentParticipationCredits,
      activationMode,
      effectiveAt,
      changeReason,
    };
    window.localStorage.setItem(
      `campaign-rule-draft:${activeRun.id}:${baseRuleVersionId}`,
      JSON.stringify(draft),
    );
  }, [
    activeRun.id,
    advancedRuleConfig,
    activationMode,
    allowProxies,
    baseRuleVersionId,
    campaignDataReady,
    canManageRules,
    changeReason,
    creditLimit,
    defaultDisplaySize,
    defaultPackPrice,
    effectiveAt,
    freePacksPerSetUnlock,
    initialSetUnlockCount,
    matchMode,
    maxMainDeck,
    minMainDeck,
    preset,
    requireResultConfirmation,
    reservationMinutes,
    separatePromoProgression,
    setsPerProgressionStep,
    startingCredits,
    tournamentParticipationCredits,
    tournamentRunnerUpCredits,
    tournamentWinnerCredits,
    tradesEnabled,
  ]);

  async function refreshMembersAndProgression() {
    const [freshMembers, freshProgression, freshJoinRequests] = await Promise.all([
      runClient.listMembers(activeRun.id),
      runClient.getProgression(activeRun.id).catch(() => null),
      isManager ? runClient.listJoinRequests(activeRun.id) : Promise.resolve([]),
    ]);

    setMembers(freshMembers);
    setProgression(freshProgression);
    setJoinRequests(freshJoinRequests);
  }

  async function decideJoinRequest(
    requestId: string,
    decision: "APPROVE" | "REJECT",
  ) {
    setActionPending(true);
    setFeedback(null);
    try {
      await runClient.decideJoinRequest(activeRun.id, requestId, { decision });
      await refreshMembersAndProgression();
      setFeedback(decision === "APPROVE" ? "Beitrittsantrag angenommen." : "Beitrittsantrag abgelehnt.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Beitrittsantrag konnte nicht entschieden werden."));
    } finally {
      setActionPending(false);
    }
  }

  async function grantCreditsToMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isManager) {
      setFeedback("Nur Host oder Organizer können Credits vergeben.");
      return;
    }

    const amount = parseInteger(creditGrantAmount);
    if (!creditRecipientDuelistId || amount === null || amount <= 0 || amount > 999_999) {
      setFeedback("Bitte wähle einen Spieler und gib 1 bis 999.999 Credits ein.");
      return;
    }

    setGrantingCredits(true);
    setFeedback(null);
    try {
      await apiPostJson<RewardGrantDto, CreateRewardGrantRequest>(
        `/api/v1/runs/${activeRun.id}/rewards`,
        {
          recipientDuelistId: creditRecipientDuelistId,
          amountCredits: amount,
          packQuantity: 0,
          reason: creditGrantReason.trim() || "Host-Gutschrift",
        },
      );
      const recipient = members.find(
        (member) => member.duelistId === creditRecipientDuelistId,
      );
      setFeedback(
        `${amount.toLocaleString("de-DE")} Credits wurden ${recipient?.displayName ?? creditRecipientDuelistId} gutgeschrieben.`,
      );
      setCreditGrantAmount("500");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Credits konnten nicht vergeben werden."));
    } finally {
      setGrantingCredits(false);
    }
  }

  async function saveCampaignSettings(confirmed = false) {
    if (!canManageRules) {
      setFeedback("Nur der Kampagnen-Owner kann Regelversionen ändern.");
      return;
    }
    if (!campaignDataReady || !baseRuleConfig || !advancedRuleConfig) {
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
      setFeedback("Bitte ganze Zahlen für Packpreise, Gratispacks und Turnier-Credits eingeben.");
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

    const nextConfig: CampaignRuleConfig = {
      economy: {
        ...advancedRuleConfig.economy,
        startingCredits: parsedStartingCredits,
        creditLimit: parsedCreditLimit,
        packPrice: parsedPackPrice,
        displaySize: parsedDisplaySize,
      },
      progression: {
        ...advancedRuleConfig.progression,
        initialSetUnlockCount: parsedInitialSets,
        setsPerStep: parsedSetsPerStep,
        freePacksPerSetUnlock: parsedFreePacks,
        separatePromoProgression,
      },
      collection: advancedRuleConfig.collection,
      decks: {
        ...advancedRuleConfig.decks,
        allowProxies,
        minMainDeck: parsedMinMainDeck,
        maxMainDeck: parsedMaxMainDeck,
      },
      trades: {
        ...advancedRuleConfig.trades,
        enabled: tradesEnabled,
        reservationMinutes: parsedReservationMinutes,
      },
      tournaments: {
        ...advancedRuleConfig.tournaments,
        matchMode,
        requireResultConfirmation,
        winnerCredits: parsedWinnerCredits,
        runnerUpCredits: parsedRunnerUpCredits,
        participationCredits: parsedParticipationCredits,
      },
      audit: {
        ...advancedRuleConfig.audit,
        activationMode,
      },
    };

    if (!confirmed) {
      setReviewChanges(
        collectRuleChanges(
          baseRuleConfig as unknown as Record<string, unknown>,
          nextConfig as unknown as Record<string, unknown>,
        ),
      );
      setReviewOpen(true);
      setSaving(false);
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
        config: nextConfig,
      });
      // The mutation itself is authoritative. Close the review as soon as it
      // succeeds; a later refresh failure must not leave a successfully saved
      // dialog looking stuck.
      setReviewOpen(false);
      let freshRuleVersions: CampaignRuleVersionDto[];
      try {
        freshRuleVersions = await campaignRuleClient.list(activeRun.id);
      } catch {
        freshRuleVersions = [
          createdVersion,
          ...ruleVersions.filter((version) => version.id !== createdVersion.id),
        ];
      }
      const activeVersion =
        createdVersion.status === "ACTIVE"
          ? createdVersion
          : getActiveRuleVersion(freshRuleVersions);
      setRuleVersions(freshRuleVersions);
      if (activeVersion) {
        applyActiveRuleVersion(activeVersion);
      }
      if (baseRuleVersionId) {
        window.localStorage.removeItem(
          `campaign-rule-draft:${activeRun.id}:${baseRuleVersionId}`,
        );
      }
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
      setFeedback("Nur Host oder Organizer können Spieler einladen.");
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
      setFeedback("Duelist wurde zur Kampagne hinzugefügt.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Duelist konnte nicht eingeladen werden."));
    } finally {
      setInviting(false);
    }
  }

  async function unlockNextProgressionStep() {
    if (!isManager) {
      setFeedback("Nur Host oder Organizer können Kampagnen-Fortschritt freischalten.");
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
        throw new Error("Kein nächster Pack-Schritt gefunden.");
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
      setFeedback(getApiErrorMessage(error, "Der nächste Pack-Schritt konnte nicht freigeschaltet werden."));
    } finally {
      setActionPending(false);
    }
  }

  async function createQuickTournament() {
    if (!isManager) {
      setFeedback("Nur Host oder Organizer können Turniere starten.");
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
        pairingMode: advancedRuleConfig?.tournaments.pairingMode ?? "SWISS",
        matchMode: advancedRuleConfig?.tournaments.matchMode === "SINGLE"
          ? "BEST_OF_ONE"
          : advancedRuleConfig?.tournaments.matchMode ?? "BEST_OF_THREE",
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
      {reviewOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/72 px-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-review-title"
            className="max-h-[min(720px,90vh)] w-full max-w-2xl overflow-y-auto rounded-[10px] border border-white/12 bg-[#0b1118] p-5 shadow-2xl"
          >
            <p className="ui-kicker">Neue Regelversion</p>
            <h2 id="campaign-review-title" className="mt-1 text-xl font-semibold text-[#f2eadf]">
              Änderungen prüfen
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#9eacb5]">
              Aktivierung:{" "}
              {activationMode === "IMMEDIATE"
                ? "sofort"
                : activationMode === "AT_DATE"
                  ? effectiveAt
                  : "beim nächsten Progressionsschritt"}
            </p>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Begründung</span>
              <input
                className="ui-input mt-2"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="z. B. Packpreise für die nächste Runde angepasst"
              />
              {advancedRuleConfig?.audit.requireReasonForChanges && !changeReason.trim() ? (
                <span className="mt-2 block text-xs text-[#e8a08f]">
                  Für diese Regeländerung ist eine Begründung erforderlich.
                </span>
              ) : null}
            </label>
            <div className="mt-4 grid gap-2">
              {reviewChanges.length ? (
                reviewChanges.map((change) => (
                  <div
                    key={change.label}
                    className="grid gap-1 rounded-[7px] border border-white/8 bg-white/[0.025] px-3 py-2 sm:grid-cols-[minmax(140px,0.8fr)_1fr_auto_1fr]"
                  >
                    <span className="text-xs font-semibold text-[#cbd4d9]">{change.label}</span>
                    <span className="truncate text-xs text-[#a99a8c]">{change.from}</span>
                    <span aria-hidden className="hidden text-xs text-[#6f7f89] sm:inline">→</span>
                    <span className="truncate text-xs text-[#bce6e6]">{change.to}</span>
                  </div>
                ))
              ) : (
                <p className="ui-empty rounded-[7px] px-3 py-4 text-sm">
                  Es wurden keine Regelwerte geändert.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="ui-button-neutral"
                onClick={() => setReviewOpen(false)}
                disabled={saving}
              >
                Weiter bearbeiten
              </button>
              <button
                type="button"
                className="ui-button-primary"
                onClick={() => void saveCampaignSettings(true)}
                disabled={
                  saving
                  || reviewChanges.length === 0
                  || Boolean(advancedRuleConfig?.audit.requireReasonForChanges && !changeReason.trim())
                }
              >
                {saving
                  ? "Speichert…"
                  : activationMode === "IMMEDIATE"
                    ? "Version aktivieren"
                    : "Version planen"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <header className="campaign-settings-header">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="ui-kicker">Kampagnenzentrale</p>
            <span className={`campaign-status campaign-status-${activeRun.status === "ACTIVE" ? "available" : "locked"}`}>
              {activeRun.status}
            </span>
          </div>
          <h1>{activeRun.name}</h1>
          <p>{activeRun.description || "Steuere Fortschritt, Packs, Regeln und Mitglieder dieser Kampagne."}</p>
        </div>
        <div className="campaign-settings-header-meta">
          <StatPill label="Rolle" value={activeRun.viewerRole} tone="teal" />
          <StatPill label="Mitglieder" value={String(activeRun.memberCount)} tone="slate" />
          <StatPill label="Regeln" value={baseRuleVersionId ? `v${getActiveRuleVersion(ruleVersions)?.version ?? "–"}` : "Lädt"} tone="gold" />
        </div>
      </header>

      <div className="campaign-settings-layout">
        <label className="campaign-settings-mobile-nav">
          <span>Bereich</span>
          <select className="ui-input" value={workspaceSection} onChange={(event) => selectWorkspaceSection(event.target.value as CampaignWorkspaceSection)}>
            <option value="OVERVIEW">Übersicht</option>
            <option value="PACKS">Packs & Fortschritt</option>
            <option value="CUSTOM_PACKS">Custom Packs</option>
            <option value="ECONOMY">Wirtschaft</option>
            <option value="DECKS_TRADES">Decks & Tausch</option>
            <option value="TOURNAMENTS">Turniere</option>
            <option value="MEMBERS">Mitglieder</option>
            <option value="HISTORY">Versionen & Verlauf</option>
          </select>
        </label>
        <aside className="campaign-settings-nav" aria-label="Kampagneneinstellungen">
          {([
            ["OVERVIEW", "Übersicht"],
            ["PACKS", "Packs & Fortschritt"],
            ["CUSTOM_PACKS", "Custom Packs"],
            ["ECONOMY", "Wirtschaft"],
            ["DECKS_TRADES", "Decks & Tausch"],
            ["TOURNAMENTS", "Turniere"],
            ["MEMBERS", "Mitglieder"],
            ["HISTORY", "Versionen & Verlauf"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={workspaceSection === value ? "is-active" : ""}
              onClick={() => selectWorkspaceSection(value)}
            >
              {label}
            </button>
          ))}
        </aside>

        <main className="campaign-settings-main">
      {workspaceSection === "PACKS" ? (
        <Panel kicker="Packzugriff" title="Packs & Fortschritt">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm leading-6 text-[#baa58a]">
              Manuelle Freigaben, Sperren und Zeitfenster wirken nur auf zukünftige Käufe und Öffnungen.
            </p>
            <button
              className="ui-button-secondary"
              type="button"
              disabled={!isManager || actionPending}
              onClick={() => void unlockNextProgressionStep()}
            >
              {actionPending ? "Wird freigeschaltet…" : "Nächstes Pack freischalten"}
            </button>
          </div>
          <CampaignPackAccessPanel runId={activeRun.id} canManage={isManager} onFeedback={handleFeedback} />
        </Panel>
      ) : null}

      {workspaceSection === "CUSTOM_PACKS" ? (
        <Panel kicker="Eigene Produkte" title="Custom Packs">
          <div className="campaign-custom-pack-callout">
            <div>
              <h2>Entwerfen, simulieren, veröffentlichen</h2>
              <p>
                Das Studio verwaltet Kartenpool, Slots, Gewichte und unveränderliche Versionen.
                Eine veröffentlichte Version wird anschließend hier unter „Packs & Fortschritt“ für Spieler freigegeben.
              </p>
            </div>
            {isManager ? <Link className="ui-button-primary" href="/campaigns/custom-packs">Custom-Pack-Studio öffnen</Link> : null}
          </div>
        </Panel>
      ) : null}

      <section className={workspaceSection === "OVERVIEW" || ["PACKS", "ECONOMY", "DECKS_TRADES", "TOURNAMENTS", "HISTORY"].includes(workspaceSection) ? "grid gap-6" : "hidden"}>
        <div className={workspaceSection === "OVERVIEW" ? "block" : "hidden"}>
        <Panel kicker="Kampagne" title={activeRun.name}>
          <div className="grid gap-4">
            <p className="text-sm leading-7 text-[#baa58a]">
              Diese Einstellungen gelten nur für diese Kampagne. Profil, Desktop,
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
              {isManager ? (
                <Link className="ui-button-primary" href="/campaigns/custom-packs">
                  Custom-Pack-Studio
                </Link>
              ) : null}
              <Link className="ui-button-neutral" href="/campaigns">
                Kampagne wechseln
              </Link>
              <Link className="ui-button-secondary" href="/">
                Dashboard öffnen
              </Link>
            </div>
            {canManageRules ? (
              <div className="campaign-identity-form">
                <div className="sm:col-span-2 grid gap-3 rounded-[12px] border border-white/10 bg-black/20 p-3 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div className="relative aspect-video overflow-hidden rounded-[8px] border border-white/10 bg-black/35">
                    {campaignImageUrl ? <Image src={campaignImageUrl} alt="Kampagnenmotiv" fill className="object-cover" /> : <div className="grid h-full place-items-center text-xs text-white/45">Kein Kampagnenmotiv</div>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#f0dfcc]">Kampagnenbild</p>
                    <p className="mb-3 mt-1 text-xs leading-5 text-[#9eacb5]">Wird im Kampagnenkopf und in öffentlichen Übersichten verwendet.</p>
                    <div className="flex flex-wrap gap-2">
                      <ImageCropUpload kind="CAMPAIGN_IMAGE" aspect={16 / 9} label="Bild hochladen" onUploaded={(asset) => { setCampaignImageAssetId(asset.id); setCampaignImageUrl(asset.imageUrl); }} />
                      {campaignImageAssetId ? <button type="button" className="ui-button-neutral" onClick={() => { setCampaignImageAssetId(null); setCampaignImageUrl(null); }}>Entfernen</button> : null}
                    </div>
                  </div>
                </div>
                <label><span>Name</span><input className="ui-input" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label>
                <label><span>Status</span><select className="ui-input" value={campaignStatus} onChange={(event) => setCampaignStatus(event.target.value as PlayGroupRunDto["status"])}><option value="ACTIVE">Aktiv</option><option value="ARCHIVED">Archiviert</option></select></label>
                <label className="sm:col-span-2"><span>Beschreibung</span><textarea className="ui-input min-h-24" value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} /></label>
                <label><span>Region</span><select className="ui-input" value={campaignRegion} onChange={(event) => setCampaignRegion(event.target.value as typeof campaignRegion)}><option value="TCG">TCG</option><option value="OCG">OCG</option><option value="GLOBAL">Global</option><option value="CUSTOM">Benutzerdefiniert</option></select></label>
                <label><span>Sprache</span><input className="ui-input" value={campaignLanguage} onChange={(event) => setCampaignLanguage(event.target.value)} placeholder="de" /></label>
                <label><span>Zeitzone</span><input className="ui-input" value={campaignTimeZone} onChange={(event) => setCampaignTimeZone(event.target.value)} placeholder="Europe/Berlin" /></label>
                <label><span>Sichtbarkeit</span><select className="ui-input" value={campaignVisibility} onChange={(event) => setCampaignVisibility(event.target.value as typeof campaignVisibility)}><option value="PRIVATE">Privat</option><option value="UNLISTED">Nicht gelistet</option><option value="PUBLIC">Öffentlich</option></select></label>
                <label><span>Beitritt</span><select className="ui-input" value={campaignJoinType} onChange={(event) => setCampaignJoinType(event.target.value as typeof campaignJoinType)}><option value="INVITE_CODE">Einladungscode</option><option value="APPROVAL">Freigabe durch Leitung</option><option value="OPEN">Offen</option></select></label>
                <label><span>Spielerlimit</span><input className="ui-input" inputMode="numeric" value={campaignMaxPlayers} onChange={(event) => setCampaignMaxPlayers(event.target.value)} placeholder="Unbegrenzt" /></label>
                <label><span>Beginn</span><input className="ui-input" type="datetime-local" value={campaignStartsAt} onChange={(event) => setCampaignStartsAt(event.target.value)} /></label>
                <label><span>Ende</span><input className="ui-input" type="datetime-local" value={campaignEndsAt} onChange={(event) => setCampaignEndsAt(event.target.value)} /></label>
                <button type="button" className="ui-button-primary sm:col-span-2 sm:justify-self-start" disabled={identitySaving || !campaignName.trim()} onClick={() => void saveCampaignIdentity()}>{identitySaving ? "Speichert…" : "Kampagnenprofil speichern"}</button>
              </div>
            ) : null}
          </div>
        </Panel>
        </div>

        <div className={workspaceSection !== "OVERVIEW" ? "block" : "hidden"}>
        <Panel kicker="Regeln" title="Pack- und Turnierwerte">
          {!campaignDataReady ? (
            <div className="campaign-skeleton-list" aria-label="Regelversion wird geladen" />
          ) : null}
          {!isManager ? (
            <p className="mb-4 text-sm leading-7 text-[#baa58a]">
              Du siehst die aktiven Kampagnenregeln im Lesemodus.
              Regelversionen kann ausschließlich der Kampagnen-Owner ändern.
            </p>
          ) : null}
          <nav
            className={workspaceSection === "DECKS_TRADES" ? "mb-5 flex gap-1 rounded-[8px] border border-white/8 bg-black/20 p-1" : "hidden"}
            aria-label="Regelbereich"
          >
            {([ ["DECKS", "Deckregeln"], ["COLLECTION", "Sammlung"], ["TRADES", "Tauschregeln"] ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`ui-segment-button shrink-0 ${
                  activeSection === value
                    ? "bg-[rgba(58,118,124,0.24)] text-[#e9ffff]"
                    : "text-[#9aa8b1] hover:bg-white/5 hover:text-white"
                }`}
                aria-pressed={activeSection === value}
                onClick={() => setActiveSection(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <fieldset disabled={!canManageRules || !campaignDataReady || saving} className="contents disabled:opacity-70">
          <div className={activeSection === "ECONOMY" ? "mb-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.8fr]" : "hidden"}>
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
          <div className={activeSection === "ECONOMY" ? "grid gap-4 md:grid-cols-3" : "hidden"}>
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
              <span className="text-sm font-semibold text-[#f0dfcc]">Display-Größe (fest)</span>
              <input
                className="ui-input mt-2"
                inputMode="numeric"
                value="24"
                disabled
              />
              <span className="mt-2 block text-xs text-[#9eacb5]">Reguläre Displays enthalten immer 24 Booster.</span>
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
          <p className={activeSection === "ECONOMY" ? "mt-3 text-sm leading-7 text-[#baa58a]" : "hidden"}>
            Beim Freischalten eines neuen Booster-Sets bekommen alle Kampagnenmitglieder
            diese Anzahl als kostenlose Reward-Packs. Standard ist ein Display.
          </p>
          <div className={activeSection === "PROGRESSION" ? "grid gap-4 md:grid-cols-3" : "hidden"}>
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
          <div className={activeSection === "TOURNAMENTS" ? "grid gap-4 md:grid-cols-3" : "hidden"}>
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
          <p className={activeSection === "TOURNAMENTS" ? "mt-3 text-sm leading-7 text-[#baa58a]" : "hidden"}>
            Diese Turnier-Credits werden in neu generierte Kampagnen-Checkpoints geschrieben
            und dienen als Pack-Währung für den freigeschalteten Shop.
          </p>
          {activeSection === "COLLECTION" && advancedRuleConfig ? (
            <div className="grid gap-4 md:grid-cols-3">
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Duplikatregel</span><select className="ui-input mt-2" value={advancedRuleConfig.collection.duplicateRule} onChange={(event) => updateAdvancedSection("collection", { duplicateRule: event.target.value as CampaignRuleConfig["collection"]["duplicateRule"] })}><option value="KEEP_ALL">Alle behalten</option><option value="CAP_COPIES">Kopien begrenzen</option><option value="CONVERT_CREDITS">In Credits umwandeln</option></select></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Kartenidentität</span><select className="ui-input mt-2" value={advancedRuleConfig.collection.printingIdentity} onChange={(event) => updateAdvancedSection("collection", { printingIdentity: event.target.value as CampaignRuleConfig["collection"]["printingIdentity"] })}><option value="CARD">Karte</option><option value="PRINTING">Druckvariante</option><option value="PHYSICAL_COPY">Physische Kopie</option></select></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Sammlungslimit</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.collection.collectionEntryLimit ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("collection", { collectionEntryLimit: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Max. Kopien pro Karte</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.collection.maxCopiesPerCard ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("collection", { maxCopiesPerCard: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Binderlimit</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.collection.binderLimit ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("collection", { binderLimit: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Seiten pro Binder</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.collection.binderPageLimit ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("collection", { binderPageLimit: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Dusting-Credits je Karte</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.collection.dustingCreditsPerCard} disabled={!advancedRuleConfig.collection.dustingEnabled} onChange={(event) => updateAdvancedSection("collection", { dustingCreditsPerCard: Number(event.target.value) })} /></label>
              {([ ["allowPackDuplicates", "Duplikate in Packs"], ["printingSpecificBinders", "Druckvarianten im Binder"], ["physicalCopyReservation", "Physische Kopien reservieren"], ["dustingEnabled", "Dusting aktivieren"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.collection[key]} onChange={(event) => updateAdvancedSection("collection", { [key]: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">{label}</span></label>)}
            </div>
          ) : null}
          <div className={activeSection === "DECKS" ? "grid gap-4 md:grid-cols-3" : "hidden"}>
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
          {activeSection === "DECKS" && advancedRuleConfig ? (
            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 md:grid-cols-3">
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Extra Deck Maximum</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.decks.maxExtraDeck} onChange={(event) => updateAdvancedSection("decks", { maxExtraDeck: Number(event.target.value) })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Side Deck Maximum</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.decks.maxSideDeck} onChange={(event) => updateAdvancedSection("decks", { maxSideDeck: Number(event.target.value) })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Decksichtbarkeit</span><select className="ui-input mt-2" value={advancedRuleConfig.decks.deckVisibility} onChange={(event) => updateAdvancedSection("decks", { deckVisibility: event.target.value as CampaignRuleConfig["decks"]["deckVisibility"] })}><option value="PRIVATE">Privat</option><option value="FRIENDS">Freunde</option><option value="CAMPAIGN">Kampagne</option><option value="PUBLIC">Öffentlich</option></select></label>
              <label className="md:col-span-3"><span className="text-sm font-semibold text-[#f0dfcc]">Erlaubte Format-IDs</span><input className="ui-input mt-2" value={advancedRuleConfig.decks.allowedFormatKeys.join(", ")} onChange={(event) => updateAdvancedSection("decks", { allowedFormatKeys: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Leer = aktuelles Kampagnenformat" /></label>
              {([ ["ownershipRequired", "Besitzpflicht"], ["allowMultipleFormats", "Mehrere Formate"], ["tournamentDeckLock", "Turnierdeck beim Start sperren"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.decks[key]} onChange={(event) => updateAdvancedSection("decks", { [key]: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">{label}</span></label>)}
            </div>
          ) : null}
          <div className={activeSection === "TRADES" ? "grid gap-4 md:grid-cols-2" : "hidden"}>
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={tradesEnabled} onChange={(event) => { markPresetAsCustom(); setTradesEnabled(event.target.checked); }} />
              <span className="text-sm font-semibold text-[#f0dfcc]">Tauschen aktiviert</span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Reservierung (Minuten)</span>
              <input className="ui-input mt-2" inputMode="numeric" value={reservationMinutes} onChange={(event) => { markPresetAsCustom(); setReservationMinutes(event.target.value); }} />
            </label>
          </div>
          <div className={activeSection === "TOURNAMENTS" ? "mt-5 grid gap-4 md:grid-cols-2" : "hidden"}>
            <label className="block">
              <span className="text-sm font-semibold text-[#f0dfcc]">Matchmodus</span>
              <select className="ui-input mt-2" value={matchMode} onChange={(event) => { markPresetAsCustom(); setMatchMode(event.target.value as typeof matchMode); }}>
                <option value="BEST_OF_ONE">Best of One</option>
                <option value="BEST_OF_THREE">Best of Three</option>
                <option value="BEST_OF_FIVE">Best of Five</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.08)] px-4 py-3">
              <input type="checkbox" checked={requireResultConfirmation} onChange={(event) => { markPresetAsCustom(); setRequireResultConfirmation(event.target.checked); }} />
              <span className="text-sm font-semibold text-[#f0dfcc]">Ergebnis bestätigen</span>
            </label>
          </div>
          {activeSection === "TRADES" && advancedRuleConfig ? (
            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.trades.allowCredits} onChange={(event) => updateAdvancedSection("trades", { allowCredits: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">Credits in Trades</span></label>
              <label className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.trades.organizerApproval} onChange={(event) => updateAdvancedSection("trades", { organizerApproval: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">Organizer-Freigabe</span></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Mindestmitgliedschaft (Tage)</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.trades.minimumMembershipDays} onChange={(event) => updateAdvancedSection("trades", { minimumMembershipDays: Number(event.target.value) })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Max. Karten</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.trades.maxCardsPerTrade ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("trades", { maxCardsPerTrade: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Max. Credits</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.trades.maxCreditsPerTrade ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("trades", { maxCreditsPerTrade: event.target.value ? Number(event.target.value) : null })} /></label>
              <div><span className="text-sm font-semibold text-[#f0dfcc]">Tauscharten</span><div className="mt-2 flex flex-wrap gap-3">{(["DIRECT", "AUCTION", "DRAFT_WINDOW"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm text-[#baa58a]"><input type="checkbox" checked={advancedRuleConfig.trades.modes.includes(value)} onChange={() => updateAdvancedSection("trades", { modes: toggleRuleList(advancedRuleConfig.trades.modes, value) })} />{value}</label>)}</div></div>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Tauschfenster ab</span><input className="ui-input mt-2" type="datetime-local" value={advancedRuleConfig.trades.tradeWindowStart?.slice(0, 16) ?? ""} onChange={(event) => updateAdvancedSection("trades", { tradeWindowStart: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Tauschfenster bis</span><input className="ui-input mt-2" type="datetime-local" value={advancedRuleConfig.trades.tradeWindowEnd?.slice(0, 16) ?? ""} onChange={(event) => updateAdvancedSection("trades", { tradeWindowEnd: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
            </div>
          ) : null}
          {activeSection === "PROGRESSION" && advancedRuleConfig ? (
            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 md:grid-cols-3">
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Catch-up</span><select className="ui-input mt-2" value={advancedRuleConfig.progression.catchUpMode} onChange={(event) => updateAdvancedSection("progression", { catchUpMode: event.target.value as CampaignRuleConfig["progression"]["catchUpMode"] })}><option value="NONE">Kein Catch-up</option><option value="MATCH_CURRENT">Aktuellen Stand übernehmen</option><option value="HOST_GRANT">Durch Host vergeben</option></select></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Startpack-Auswahl</span><select className="ui-input mt-2" value={advancedRuleConfig.progression.startingPackMode} onChange={(event) => updateAdvancedSection("progression", { startingPackMode: event.target.value as CampaignRuleConfig["progression"]["startingPackMode"] })}><option value="NONE">Keine</option><option value="FIXED">Fest</option><option value="RANDOM">Zufällig</option><option value="PLAYER_CHOICE">Spielerwahl</option></select></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Startpack-Anzahl</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.progression.startingPackCount} onChange={(event) => updateAdvancedSection("progression", { startingPackCount: Number(event.target.value) })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Startset-IDs</span><input className="ui-input mt-2" value={advancedRuleConfig.progression.startingSetIds.join(", ")} onChange={(event) => updateAdvancedSection("progression", { startingSetIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="set-id-1, set-id-2" /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Startkarten-IDs</span><input className="ui-input mt-2" value={advancedRuleConfig.progression.startingCardIds.join(", ")} onChange={(event) => updateAdvancedSection("progression", { startingCardIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Starterdeck-IDs</span><input className="ui-input mt-2" value={advancedRuleConfig.progression.starterDeckIds.join(", ")} onChange={(event) => updateAdvancedSection("progression", { starterDeckIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
              <div className="md:col-span-3"><span className="text-sm font-semibold text-[#f0dfcc]">Fortschrittsauslöser</span><div className="mt-2 flex flex-wrap gap-3">{(["MANUAL", "DATE", "TOURNAMENT", "MATCHES", "EVENT"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm text-[#baa58a]"><input type="checkbox" checked={advancedRuleConfig.progression.progressionModes.includes(value)} onChange={() => updateAdvancedSection("progression", { progressionModes: toggleRuleList(advancedRuleConfig.progression.progressionModes, value) })} />{value}</label>)}</div></div>
              {([ ["allowReleaseOrder", "Release-Reihenfolge"], ["allowCustomOrder", "Eigene Reihenfolge"], ["allowPlayerVote", "Spielerabstimmung"], ["unlockReprints", "Reprints mitfreischalten"], ["allowBackwardUnlocks", "Rückwirkende Freigaben"], ["timedEventsEnabled", "Zeitlich begrenzte Events"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.progression[key]} onChange={(event) => updateAdvancedSection("progression", { [key]: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">{label}</span></label>)}
            </div>
          ) : null}
          {activeSection === "ECONOMY" && advancedRuleConfig ? (
            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 md:grid-cols-3">
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Bundle-Größe</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.economy.bundleSize} onChange={(event) => updateAdvancedSection("economy", { bundleSize: Number(event.target.value) })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Bundle-Preis</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.economy.bundlePrice ?? ""} placeholder="Automatisch" onChange={(event) => updateAdvancedSection("economy", { bundlePrice: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Packlimit pro Tag</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.economy.packPurchaseLimitPerDay ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("economy", { packPurchaseLimitPerDay: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Displaylimit pro Tag</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.economy.displayPurchaseLimitPerDay ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("economy", { displayPurchaseLimitPerDay: event.target.value ? Number(event.target.value) : null })} /></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Bundlelimit pro Tag</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.economy.bundlePurchaseLimitPerDay ?? ""} placeholder="Unbegrenzt" onChange={(event) => updateAdvancedSection("economy", { bundlePurchaseLimitPerDay: event.target.value ? Number(event.target.value) : null })} /></label>
              <div><span className="text-sm font-semibold text-[#f0dfcc]">Kaufarten</span><div className="mt-2 flex flex-wrap gap-3">{(["PACK", "DISPLAY", "BUNDLE"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm text-[#baa58a]"><input type="checkbox" checked={advancedRuleConfig.economy.purchaseTypes.includes(value)} onChange={() => updateAdvancedSection("economy", { purchaseTypes: toggleRuleList(advancedRuleConfig.economy.purchaseTypes, value) })} />{value}</label>)}</div></div>
            </div>
          ) : null}
          {activeSection === "TOURNAMENTS" && advancedRuleConfig ? (
            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 md:grid-cols-3">
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Standard-Paarung</span><select className="ui-input mt-2" value={advancedRuleConfig.tournaments.pairingMode} onChange={(event) => updateAdvancedSection("tournaments", { pairingMode: event.target.value as CampaignRuleConfig["tournaments"]["pairingMode"] })}><option value="SWISS">Swiss</option><option value="ROUND_ROBIN">Round Robin</option><option value="SINGLE_ELIMINATION">Single Elimination</option><option value="MANUAL">Manuell</option></select></label>
              <label><span className="text-sm font-semibold text-[#f0dfcc]">Mindestteilnehmer</span><input className="ui-input mt-2" inputMode="numeric" value={advancedRuleConfig.tournaments.minimumParticipants} onChange={(event) => updateAdvancedSection("tournaments", { minimumParticipants: Number(event.target.value) })} /></label>
              <label className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.tournaments.requireDeckRegistration} onChange={(event) => updateAdvancedSection("tournaments", { requireDeckRegistration: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">Deckregistrierung erforderlich</span></label>
              <label className="flex items-center gap-3 rounded-[10px] border border-white/8 px-3 py-3"><input type="checkbox" checked={advancedRuleConfig.tournaments.rewardsRepeatable} onChange={(event) => updateAdvancedSection("tournaments", { rewardsRepeatable: event.target.checked })} /><span className="text-sm text-[#f0dfcc]">Rewards wiederholbar</span></label>
              <div className="md:col-span-3"><span className="text-sm font-semibold text-[#f0dfcc]">Erlaubte Paarungen</span><div className="mt-2 flex flex-wrap gap-3">{(["SWISS", "ROUND_ROBIN", "SINGLE_ELIMINATION", "MANUAL"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm text-[#baa58a]"><input type="checkbox" checked={advancedRuleConfig.tournaments.allowedPairingModes.includes(value)} onChange={() => updateAdvancedSection("tournaments", { allowedPairingModes: toggleRuleList(advancedRuleConfig.tournaments.allowedPairingModes, value) })} />{value}</label>)}</div></div>
              <div className="md:col-span-3"><span className="text-sm font-semibold text-[#f0dfcc]">Erlaubte Matchmodi</span><div className="mt-2 flex flex-wrap gap-3">{(["BEST_OF_ONE", "BEST_OF_THREE", "BEST_OF_FIVE"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm text-[#baa58a]"><input type="checkbox" checked={advancedRuleConfig.tournaments.allowedMatchModes.includes(value)} onChange={() => updateAdvancedSection("tournaments", { allowedMatchModes: toggleRuleList(advancedRuleConfig.tournaments.allowedMatchModes, value) })} />{value}</label>)}</div></div>
              <div className="md:col-span-3"><span className="text-sm font-semibold text-[#f0dfcc]">Rewardquellen</span><div className="mt-2 flex flex-wrap gap-3">{(["CREDITS", "STANDARD_PACK", "CUSTOM_PACK", "PROMO", "FIXED_CARD"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm text-[#baa58a]"><input type="checkbox" checked={advancedRuleConfig.tournaments.rewardSources.includes(value)} onChange={() => updateAdvancedSection("tournaments", { rewardSources: toggleRuleList(advancedRuleConfig.tournaments.rewardSources, value) })} />{value}</label>)}</div></div>
            </div>
          ) : null}
          <div className={activeSection === "ACTIVATION" ? "grid gap-4" : "hidden"}>
            <label className="block max-w-sm">
              <span className="text-sm font-semibold text-[#f0dfcc]">Aktivierung</span>
              <select className="ui-input mt-2" value={activationMode} onChange={(event) => { markPresetAsCustom(); setActivationMode(event.target.value as typeof activationMode); }}>
                <option value="IMMEDIATE">Sofort</option>
                <option value="AT_DATE">Zu einem Datum</option>
                <option value="NEXT_PROGRESSION_STEP">Nächster Progressionsschritt</option>
              </select>
            </label>
          {activationMode === "AT_DATE" ? (
            <label className="block max-w-sm">
              <span className="text-sm font-semibold text-[#f0dfcc]">Aktiv ab</span>
              <input className="ui-input mt-2" type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} />
            </label>
          ) : null}
          {canManageRules ? (
            <label className="block max-w-2xl">
              <span className="text-sm font-semibold text-[#f0dfcc]">Begründung der Änderung</span>
              <textarea
                className="ui-input mt-2 min-h-24"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="Warum werden diese Kampagnenregeln geändert?"
              />
            </label>
          ) : null}
          </div>
          </fieldset>
          <div className={activeSection === "ACTIVATION" ? "mt-5 flex flex-wrap gap-2" : "hidden"}>
            {ruleVersions.slice(0, 6).map((version) => (
              <span key={version.id} className="rounded-full border border-[rgba(208,170,110,0.2)] px-3 py-1 text-xs text-[#d8bc91]">
                v{version.version} · {version.status} · {version.preset ?? "CUSTOM"}
              </span>
            ))}
          </div>
        </Panel>
        </div>
      </section>

      <section className={workspaceSection === "MEMBERS" || workspaceSection === "TOURNAMENTS" ? "grid gap-6" : "hidden"}>
        <div className={workspaceSection === "MEMBERS" ? "block" : "hidden"}>
        <Panel kicker="Mitglieder" title="Spieler einladen">
          <div className="grid gap-4">
            {isManager && joinRequests.length > 0 ? (
              <div className="space-y-2 rounded-[18px] border border-[rgba(60,184,166,0.22)] bg-[rgba(27,112,102,0.08)] p-4">
                <p className="text-sm font-semibold text-[#e4fff9]">Offene Beitrittsanträge</p>
                {joinRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-white/8 bg-black/15 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#f0dfcc]">{request.displayName}</p>
                      <p className="mt-1 text-xs text-[#baa58a]">{request.duelistId}{request.message ? ` · ${request.message}` : ""}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="ui-button-secondary" disabled={actionPending} onClick={() => void decideJoinRequest(request.id, "REJECT")}>Ablehnen</button>
                      <button type="button" className="ui-button-primary" disabled={actionPending} onClick={() => void decideJoinRequest(request.id, "APPROVE")}>Freigeben</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
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
                {inviting ? "Lädt ein…" : "Einladen"}
              </button>
            </form>

            {isManager ? (
              <form
                className="grid gap-3 rounded-[18px] border border-[rgba(208,170,110,0.18)] bg-[rgba(208,170,110,0.05)] p-4 lg:grid-cols-[minmax(180px,1fr)_160px_minmax(200px,1fr)_auto]"
                onSubmit={grantCreditsToMember}
              >
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Credits an Spieler</span>
                  <select
                    className="ui-input mt-2"
                    value={creditRecipientDuelistId}
                    onChange={(event) => setCreditRecipientDuelistId(event.target.value)}
                    disabled={grantingCredits}
                  >
                    <option value="">Spieler wählen</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.duelistId}>
                        {member.displayName} · {member.duelistId}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Betrag</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={creditGrantAmount}
                    onChange={(event) => setCreditGrantAmount(event.target.value)}
                    disabled={grantingCredits}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Grund</span>
                  <input
                    className="ui-input mt-2"
                    value={creditGrantReason}
                    onChange={(event) => setCreditGrantReason(event.target.value)}
                    disabled={grantingCredits}
                  />
                </label>
                <button
                  className="ui-button-primary self-end"
                  type="submit"
                  disabled={grantingCredits || !creditRecipientDuelistId}
                >
                  {grantingCredits ? "Wird gebucht…" : "Credits geben"}
                </button>
              </form>
            ) : null}

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
        </div>

        <div className={workspaceSection === "TOURNAMENTS" ? "block" : "hidden"}>
        <Panel kicker="Host-Aktionen" title="Turniere steuern">
          <div className="grid gap-4">
            <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
              <p className="text-sm font-semibold text-[#f0dfcc]">Turnier-Schnellstart</p>
              <p className="mt-2 text-sm leading-7 text-[#baa58a]">
                Legt ein neues Kampagnen-Turnier an und öffnet direkt die Detailseite,
                damit du Teilnehmer und Runden verwalten kannst.
              </p>
              <button
                className="ui-button-primary mt-4"
                type="button"
                disabled={!isManager || actionPending}
                onClick={() => void createQuickTournament()}
              >
                {actionPending ? "Wird ausgeführt…" : "Neues Turnier starten"}
              </button>
              <Link className="ui-button-secondary mt-4 ml-2" href="/tournaments">
                Rangliste & Siegerarchiv
              </Link>
            </div>

            {!isManager ? (
              <div className="rounded-[18px] border border-[rgba(208,170,110,0.16)] bg-[rgba(208,170,110,0.06)] px-4 py-3 text-sm text-[#f0dfcc]">
                Du bist in dieser Kampagne Spieler. Host-Aktionen sind nur für Host
                und Organizer aktiv.
              </div>
            ) : null}
          </div>
        </Panel>
        </div>
      </section>

      {feedback ? (
        <div role="status" aria-live="polite" className="campaign-feedback">{feedback}</div>
      ) : null}

      {canManageRules && ["PACKS", "ECONOMY", "DECKS_TRADES", "TOURNAMENTS", "HISTORY"].includes(workspaceSection) ? (
        <div className="campaign-sticky-actions">
          <div>
            <strong>Regelentwurf</strong>
            <span>{campaignDataReady ? "Lokal gesichert · bereit zur Prüfung" : "Aktive Version wird geladen"}</span>
          </div>
          <div>
            <button
              type="button"
              className="ui-button-secondary"
              disabled={!campaignDataReady || saving}
              onClick={() => {
                const activeVersion = getActiveRuleVersion(ruleVersions);
                if (activeVersion) applyActiveRuleVersion(activeVersion);
              }}
            >
              Verwerfen
            </button>
            <button type="button" className="ui-button-primary" disabled={!campaignDataReady || saving} onClick={() => void saveCampaignSettings(false)}>
              {saving ? "Prüft…" : "Änderungen prüfen"}
            </button>
          </div>
        </div>
      ) : null}
        </main>
      </div>
    </DuelConsoleScaffold>
  );
}
