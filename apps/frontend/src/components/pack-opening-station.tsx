"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import type {
  OpenDisplayResponse,
  PackDashboardSnapshotDto,
} from "@ygo/contracts";
import {
  getPackOpeningVariant,
  PackOpeningActor,
  type PackOpeningPhase,
} from "@/components/pack-opening-actor";
import { StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  DEFAULT_OPENING_SPEED,
  getPackOpeningTimeline,
  hasExpectedPullSlots,
  initialOpeningFlowState,
  openingFlowReducer,
  openingSpeeds,
  PACK_OPENING_TIMING,
  type OpeningSpeed,
} from "@/lib/pack-opening-flow";
import { packOpeningClient } from "@/lib/pack-opening-client";
import { getPackRenderAssets } from "@/lib/pack-renders";
import {
  getHighestRarityTier,
  getRarityAbbreviation,
  getRarityLabel,
  getRarityTier,
} from "@/lib/rarity";

type PackOpeningStationProps = {
  initialSnapshot: PackDashboardSnapshotDto;
  setId: string;
};

type OpeningSummary = PackDashboardSnapshotDto["recentOpenings"][number];
type OpeningPull = OpeningSummary["pulls"][number];
type DisplayOpeningSummary = OpenDisplayResponse["openings"][number];

type ArrivalLayout = {
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  sourceScale: number;
};

type HoverCardState = {
  pullId: string;
  left: number;
  top: number;
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Noch nicht geöffnet";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getArrivalStyle(
  index: number,
  pullCount: number,
  speed: OpeningSpeed,
  arrivalLayout: ArrivalLayout,
) {
  const stackDepth = index;
  const speedScale = 1 / speed;
  const sourceX = arrivalLayout.x + stackDepth * 0.8;
  const sourceY = arrivalLayout.y + stackDepth * 1.2;
  const arcLift = Math.min(72, Math.max(34, arrivalLayout.width * 0.26));
  const midScale = ((arrivalLayout.sourceScale + 1) / 2) * 1.015;

  return {
    "--arrival-x": `${sourceX}px`,
    "--arrival-y": `${sourceY}px`,
    "--arrival-mid-x": `${sourceX * 0.46}px`,
    "--arrival-mid-y": `${sourceY * 0.52 - arcLift}px`,
    "--arrival-rotate": `${-2 + stackDepth * -0.18}deg`,
    "--arrival-mid-rotate": `${1.4 - (index % 3) * 0.35}deg`,
    "--arrival-source-scale": String(arrivalLayout.sourceScale),
    "--arrival-mid-scale": String(midScale),
    "--arrival-delay": `${index * PACK_OPENING_TIMING.cardIntervalMs * speedScale}ms`,
    "--arrival-duration": `${PACK_OPENING_TIMING.cardFlightMs * speedScale}ms`,
    "--arrival-z": String(pullCount - index),
    left: `${arrivalLayout.left}px`,
    top: `${arrivalLayout.top}px`,
    width: `${arrivalLayout.width}px`,
    height: `${arrivalLayout.height}px`,
  } as CSSProperties;
}

function addUniqueId(values: string[], nextValue: string) {
  return values.includes(nextValue) ? values : [...values, nextValue];
}

function formatRemainingPacks(count: number) {
  return count === 1 ? "1 Pack übrig" : `${count} Packs übrig`;
}

function OpeningCardBack() {
  return (
    <span className="reveal-card-face reveal-card-back">
      <span className="reveal-card-back-image-wrap">
        <Image
          src="/app-assets/yugioh-card-back-en.png"
          alt="Yu-Gi-Oh! Kartenrückseite"
          fill
          sizes="(max-width: 768px) 45vw, 16vw"
          className="object-cover"
          unoptimized
        />
      </span>
      <span className="reveal-card-back-shimmer" />
    </span>
  );
}

function OpeningVisualCardBack({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={classes("reveal-card-shell is-locked", className)}
      style={style}
      aria-hidden="true"
    >
      <span className="reveal-card">
        <OpeningCardBack />
      </span>
    </div>
  );
}

function OpeningRevealCard({
  pull,
  isRevealed,
  disabled,
  onClick,
  onHoverStart,
  onHoverEnd,
  shellClassName,
  shellStyle,
}: {
  pull: OpeningPull;
  isRevealed: boolean;
  disabled: boolean;
  onClick: () => void;
  onHoverStart?: (element: HTMLButtonElement) => void;
  onHoverEnd?: () => void;
  shellClassName?: string;
  shellStyle?: CSSProperties;
}) {
  const rarityTier = getRarityTier(pull.rarity);
  const rarityShort = getRarityAbbreviation(pull.rarity);

  return (
    <button
      type="button"
      aria-pressed={isRevealed}
      onClick={onClick}
      onMouseEnter={(event) => onHoverStart?.(event.currentTarget)}
      onFocus={(event) => onHoverStart?.(event.currentTarget)}
      onMouseLeave={onHoverEnd}
      onBlur={onHoverEnd}
      disabled={disabled}
      className={classes(
        "reveal-card-shell",
        `rarity-tier-${rarityTier}`,
        shellClassName,
        isRevealed && "is-static",
        disabled && "is-locked",
      )}
      style={shellStyle}
    >
      <span className={classes("reveal-card", isRevealed && "is-revealed")}>
        <OpeningCardBack />

        <span className="reveal-card-face reveal-card-front">
          <span className="reveal-card-image-wrap">
            {pull.cardImageUrl ? (
              <Image
                src={pull.cardImageUrl}
                alt={pull.cardName}
                fill
                sizes="(max-width: 768px) 45vw, 16vw"
                className="object-contain object-center"
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[#f0dfcc]">
                {pull.cardName}
              </span>
            )}
          </span>
          <span className="reveal-card-rarity-corner">{rarityShort}</span>
        </span>
      </span>
    </button>
  );
}

export function PackOpeningStation({
  initialSnapshot,
  setId,
}: PackOpeningStationProps) {
  const openingVariant = getPackOpeningVariant("master");

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [currentOpening, setCurrentOpening] = useState<OpeningSummary | null>(
    null,
  );
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [batchNotice, setBatchNotice] = useState("");
  const [displayOpenings, setDisplayOpenings] = useState<
    DisplayOpeningSummary[]
  >([]);
  const [displayOpeningIndex, setDisplayOpeningIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [openingFlow, dispatchOpeningFlow] = useReducer(
    openingFlowReducer,
    initialOpeningFlowState,
  );
  const [openingSpeed, setOpeningSpeed] = useState<OpeningSpeed>(
    DEFAULT_OPENING_SPEED,
  );
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const timersRef = useRef<number[]>([]);
  const requestGuardRef = useRef(false);
  const requestCompleteRef = useRef(false);
  const animationCompleteRef = useRef(false);
  const trayCanvasRef = useRef<HTMLDivElement | null>(null);
  const stackOriginRef = useRef<HTMLDivElement | null>(null);
  const arrivalSlotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [arrivalLayouts, setArrivalLayouts] = useState<
    Record<string, ArrivalLayout>
  >({});
  const [arrivalLayoutsReady, setArrivalLayoutsReady] = useState(false);

  const activeSet = snapshot.sets.find((set) => set.id === setId) ?? null;
  const isDisplaySequenceActive = displayOpenings.length > 0;
  const displayPackNumber = isDisplaySequenceActive
    ? displayOpeningIndex + 1
    : 0;
  const hasNextDisplayPack =
    isDisplaySequenceActive && displayOpeningIndex < displayOpenings.length - 1;
  const landedIds = openingFlow.landedSlots;
  const cardsHaveArrived = landedIds.length === activeSet?.packSize;
  const isRequestReady = openingFlow.requestStatus === "succeeded";
  const isFlowActive =
    openingFlow.phase === "tearing" ||
    openingFlow.phase === "stacking" ||
    openingFlow.phase === "dealing";
  const packPhase: PackOpeningPhase =
    openingFlow.phase === "tearing"
      ? "tearing"
      : openingFlow.phase === "stacking" || openingFlow.phase === "dealing"
        ? "revealing"
        : "idle";
  const displayPacksRemaining = isDisplaySequenceActive
    ? Math.max(
        0,
        displayOpenings.length - displayOpeningIndex - (currentOpening ? 1 : 0),
      )
    : 0;
  const revealedCount = currentOpening
    ? currentOpening.pulls.filter((pull) => revealedIds.includes(pull.id))
        .length
    : 0;
  const isOpeningInProgress = isFlowActive || isSubmitting;
  const displaySequenceComplete =
    isDisplaySequenceActive &&
    currentOpening !== null &&
    openingFlow.phase === "ready" &&
    !hasNextDisplayPack;
  const canInteractWithPack =
    openingFlow.requestStatus !== "pending" &&
    !isFlowActive &&
    !isPending &&
    Boolean(activeSet?.canBuy) &&
    (!isDisplaySequenceActive || openingFlow.phase === "idle");
  const sliderProgress = `${((openingSpeed - 1) / (openingSpeeds.length - 1)) * 100}%`;
  const highestRarityTier = useMemo(
    () =>
      getHighestRarityTier(
        currentOpening?.pulls.map((pull) => pull.rarity) ?? [],
      ),
    [currentOpening],
  );

  const hoveredPull =
    currentOpening?.pulls.find((pull) => pull.id === hoverCard?.pullId) ?? null;
  const hoveredPullIsRevealed = hoveredPull
    ? revealedIds.includes(hoveredPull.id)
    : false;
  const pullsBySlot = useMemo(
    () =>
      new Map(
        currentOpening?.pulls.map((pull) => [pull.slotIndex, pull] as const) ??
          [],
      ),
    [currentOpening],
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    if (
      (openingFlow.phase !== "stacking" && openingFlow.phase !== "dealing") ||
      cardsHaveArrived
    ) {
      return;
    }

    let frameId = 0;
    let measureAttempts = 0;

    function measureArrivalLayouts() {
      const originNode = stackOriginRef.current;
      const trayNode = trayCanvasRef.current;

      if (!originNode || !trayNode || !activeSet) {
        return;
      }

      const originRect = originNode.getBoundingClientRect();
      const trayRect = trayNode.getBoundingClientRect();
      const origin = {
        x: originRect.left + originRect.width * 0.5,
        y: originRect.top + originRect.height * 0.5,
      };
      const nextLayouts: Record<string, ArrivalLayout> = {};

      for (let slotIndex = 1; slotIndex <= activeSet.packSize; slotIndex += 1) {
        const slotNode = arrivalSlotRefs.current[String(slotIndex)];

        if (!slotNode) {
          continue;
        }

        const slotRect = slotNode.getBoundingClientRect();
        const target = {
          x: slotRect.left + slotRect.width * 0.5,
          y: slotRect.top + slotRect.height * 0.5,
        };

        nextLayouts[String(slotIndex)] = {
          x: Math.round(origin.x - target.x),
          y: Math.round(origin.y - target.y),
          left: Math.round(slotRect.left - trayRect.left),
          top: Math.round(slotRect.top - trayRect.top),
          width: Math.round(slotRect.width),
          height: Math.round(slotRect.height),
          sourceScale: Math.min(
            4.5,
            Math.max(0.9, originRect.width / slotRect.width),
          ),
        };
      }

      measureAttempts += 1;

      if (
        Object.keys(nextLayouts).length < activeSet.packSize &&
        measureAttempts < 12
      ) {
        frameId = window.requestAnimationFrame(measureArrivalLayouts);
        return;
      }

      setArrivalLayouts(nextLayouts);
      setArrivalLayoutsReady(true);
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureArrivalLayouts);
    }

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [activeSet, cardsHaveArrived, openingFlow.phase]);

  function clearTimers() {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }

    timersRef.current = [];
  }

  function resetOpeningAnimation() {
    clearTimers();
    requestGuardRef.current = false;
    requestCompleteRef.current = false;
    animationCompleteRef.current = false;
    setCurrentOpening(null);
    setRevealedIds([]);
    setArrivalLayouts({});
    setArrivalLayoutsReady(false);
    setHoverCard(null);
    arrivalSlotRefs.current = {};
    dispatchOpeningFlow({ type: "reset" });
  }

  function releaseOpeningGuardIfComplete() {
    if (requestCompleteRef.current && animationCompleteRef.current) {
      requestGuardRef.current = false;
    }
  }

  function scheduleOpeningAnimation(skipTear: boolean) {
    if (!activeSet) {
      return;
    }

    const timeline = getPackOpeningTimeline({
      cardCount: activeSet.packSize,
      speed: openingSpeed,
      skipTear,
    });

    if (!skipTear) {
      timersRef.current.push(
        window.setTimeout(() => {
          dispatchOpeningFlow({ type: "show-stack" });
        }, timeline.tearEndMs),
      );
    }

    timersRef.current.push(
      window.setTimeout(() => {
        dispatchOpeningFlow({ type: "start-dealing" });
      }, timeline.dealStartMs),
    );

    for (const card of timeline.cards) {
      timersRef.current.push(
        window.setTimeout(() => {
          dispatchOpeningFlow({
            type: "card-landed",
            slotIndex: card.slotIndex,
          });
        }, card.landAtMs),
      );
    }

    timersRef.current.push(
      window.setTimeout(() => {
        animationCompleteRef.current = true;
        dispatchOpeningFlow({ type: "animation-complete" });
        releaseOpeningGuardIfComplete();
      }, timeline.completeAtMs),
    );
  }

  function startOpeningFlow({
    skipTear,
    resolvedOpening,
  }: {
    skipTear: boolean;
    resolvedOpening?: OpeningSummary | DisplayOpeningSummary;
  }) {
    if (!activeSet || requestGuardRef.current) {
      return false;
    }

    requestGuardRef.current = true;
    requestCompleteRef.current = Boolean(resolvedOpening);
    animationCompleteRef.current = false;
    clearTimers();
    setCurrentOpening(resolvedOpening ?? null);
    setRevealedIds([]);
    setArrivalLayouts({});
    setArrivalLayoutsReady(false);
    setHoverCard(null);
    arrivalSlotRefs.current = {};
    dispatchOpeningFlow({ type: "start", skipTear });

    if (resolvedOpening) {
      dispatchOpeningFlow({ type: "request-succeeded" });
    }

    scheduleOpeningAnimation(skipTear);
    return true;
  }

  function applyLocalOpeningResult(
    openings: Array<OpeningSummary | DisplayOpeningSummary>,
    totalCost: number,
    walletBalance?: number,
  ) {
    if (!activeSet || openings.length === 0) {
      return;
    }

    const latestOpenedAt = openings[0]?.openedAt ?? new Date().toISOString();

    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        wallet: current.wallet
          ? {
              balance:
                typeof walletBalance === "number"
                  ? walletBalance
                  : Math.max(0, current.wallet.balance - totalCost),
            }
          : current.wallet,
        sets: current.sets.map((set) =>
          set.id === activeSet.id
            ? {
                ...set,
                totalOpened: set.totalOpened + openings.length,
                lastOpenedAt: latestOpenedAt,
              }
            : set,
        ),
        recentOpenings: [...openings, ...current.recentOpenings].slice(0, 6),
      }));
    });
  }

  async function requestPackOpening(
    packSetId: string,
    expectedPullCount: number,
    packPrice: number,
  ) {
    try {
      setError("");
      setBatchNotice("");
      setDisplayOpenings([]);
      setDisplayOpeningIndex(0);
      setIsSubmitting(true);

      const payload = await packOpeningClient.open({
        setId: packSetId,
        idempotencyKey: crypto.randomUUID(),
      });

      if (!hasExpectedPullSlots(payload.opening.pulls, expectedPullCount)) {
        throw new Error(
          `Die Packöffnung lieferte nicht genau ${expectedPullCount} eindeutige Kartenslots.`,
        );
      }

      setCurrentOpening(payload.opening);
      requestCompleteRef.current = true;
      dispatchOpeningFlow({ type: "request-succeeded" });
      applyLocalOpeningResult([payload.opening], packPrice);
      releaseOpeningGuardIfComplete();
    } catch (caughtError) {
      clearTimers();
      requestGuardRef.current = false;
      requestCompleteRef.current = false;
      animationCompleteRef.current = false;
      setCurrentOpening(null);
      dispatchOpeningFlow({ type: "request-failed" });
      setError(
        getApiErrorMessage(caughtError, "Pack konnte nicht geöffnet werden."),
      );
      timersRef.current.push(
        window.setTimeout(() => {
          dispatchOpeningFlow({ type: "reset" });
        }, 420),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenPack() {
    if (!activeSet || requestGuardRef.current) {
      return;
    }

    if (!startOpeningFlow({ skipTear: false })) {
      return;
    }

    void requestPackOpening(
      activeSet.id,
      activeSet.packSize,
      activeSet.packPrice ?? 0,
    );
  }

  async function handleOpenDisplay() {
    if (!activeSet || requestGuardRef.current) {
      return;
    }

    try {
      setError("");
      setBatchNotice("");
      setDisplayOpenings([]);
      setDisplayOpeningIndex(0);
      setIsSubmitting(true);
      resetOpeningAnimation();
      requestGuardRef.current = true;

      const payload = await packOpeningClient.openDisplay({
        setId: activeSet.id,
        idempotencyKey: crypto.randomUUID(),
      });

      if (payload.openings.length === 0) {
        throw new Error("Das Display hat keine Pack-Öffnungen erzeugt.");
      }

      if (
        payload.openings.some(
          (opening) => !hasExpectedPullSlots(opening.pulls, activeSet.packSize),
        )
      ) {
        throw new Error(
          `Mindestens ein Display-Pack lieferte nicht genau ${activeSet.packSize} eindeutige Kartenslots.`,
        );
      }

      setBatchNotice(
        `Display geöffnet: ${payload.batch.quantity} Packs, ${payload.batch.totalCost} Credits. Schneide die Packs jetzt der Reihe nach auf.`,
      );
      setDisplayOpenings(payload.openings);
      applyLocalOpeningResult(
        payload.openings,
        payload.batch.totalCost,
        payload.wallet.balance,
      );
    } catch (caughtError) {
      setError(
        getApiErrorMessage(
          caughtError,
          "Display konnte nicht geöffnet werden.",
        ),
      );
    } finally {
      requestGuardRef.current = false;
      setIsSubmitting(false);
    }
  }

  function handlePrepareNextDisplayPack() {
    if (openingFlow.phase !== "ready" || !hasNextDisplayPack) {
      return;
    }

    const nextIndex = displayOpeningIndex + 1;

    if (!displayOpenings[nextIndex]) {
      return;
    }

    setError("");
    setDisplayOpeningIndex(nextIndex);
    resetOpeningAnimation();
  }

  function handlePackCutComplete() {
    if (isSubmitting || isPending) {
      return;
    }

    if (isDisplaySequenceActive) {
      if (openingFlow.phase === "idle") {
        const queuedOpening = displayOpenings[displayOpeningIndex] ?? null;

        if (queuedOpening) {
          startOpeningFlow({
            skipTear: true,
            resolvedOpening: queuedOpening,
          });
        }
      }
      return;
    }

    if (!activeSet || requestGuardRef.current) {
      return;
    }

    if (!startOpeningFlow({ skipTear: true })) {
      return;
    }

    void requestPackOpening(
      activeSet.id,
      activeSet.packSize,
      activeSet.packPrice ?? 0,
    );
  }

  function revealSingle(pullId: string) {
    const pull = currentOpening?.pulls.find(
      (candidate) => candidate.id === pullId,
    );

    if (
      !pull ||
      !landedIds.includes(pull.slotIndex) ||
      openingFlow.phase !== "ready"
    ) {
      return;
    }

    setRevealedIds((currentValue) => addUniqueId(currentValue, pullId));
  }

  function revealAll() {
    if (!currentOpening || openingFlow.phase !== "ready") {
      return;
    }

    setRevealedIds(currentOpening.pulls.map((pull) => pull.id));
  }

  function updateHoverCard(pullId: string, element: HTMLButtonElement) {
    const trayNode = trayCanvasRef.current;

    if (!trayNode) {
      return;
    }

    const trayRect = trayNode.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const tooltipWidth = 272;
    const tooltipHeight = 184;
    const canPlaceLeft = elementRect.left - trayRect.left > tooltipWidth + 24;
    const left = canPlaceLeft
      ? Math.max(elementRect.left - trayRect.left - tooltipWidth - 14, 8)
      : Math.min(
          elementRect.right - trayRect.left + 14,
          Math.max(8, trayRect.width - tooltipWidth - 8),
        );
    const top = Math.min(
      Math.max(
        elementRect.top -
          trayRect.top +
          elementRect.height * 0.5 -
          tooltipHeight * 0.5,
        8,
      ),
      Math.max(8, trayRect.height - tooltipHeight - 8),
    );

    setHoverCard({
      pullId,
      left,
      top,
    });
  }

  if (!activeSet) {
    return (
      <div className="paper-card rounded-[26px] p-5 text-sm leading-7 text-[#f2c1b7]">
        Dieses Pack wurde nicht gefunden oder ist aktuell nicht mehr öffnbar.
      </div>
    );
  }
  const packPriceLabel =
    activeSet.packPrice !== null
      ? `${formatNumber(activeSet.packPrice)} Credits`
      : "frei";
  const displayCostLabel =
    activeSet.displayCost !== null
      ? `${formatNumber(activeSet.displayCost)} Credits`
      : "nach Run-Regel";
  const walletBalanceLabel = snapshot.wallet
    ? `${formatNumber(snapshot.wallet.balance)} Credits`
    : "kein Wallet";

  const packRenderAssets = getPackRenderAssets(
    activeSet.code,
    activeSet.name,
    activeSet.imageUrl,
  );
  const trayCopy =
    openingFlow.phase === "tearing"
      ? "Das Pack wird aufgerissen. Die Ablage bleibt bis zum Stapel leer."
      : openingFlow.phase === "stacking"
        ? "Der verdeckte Kartenstapel kommt direkt aus dem geöffneten Pack."
        : openingFlow.phase === "dealing" && cardsHaveArrived && !isRequestReady
          ? "Alle Rückseiten liegen bereit. Öffnung wird verbucht."
          : openingFlow.phase === "dealing"
            ? "Die Karten werden sichtbar vom Stapel in Slot-Reihenfolge ausgeteilt."
            : openingFlow.phase === "ready" &&
                isDisplaySequenceActive &&
                hasNextDisplayPack
              ? "Dieses Pack ist fertig. Lege als Nächstes das nächste Pack aus dem Display bereit."
              : openingFlow.phase === "ready" &&
                  isDisplaySequenceActive &&
                  displaySequenceComplete
                ? "Das komplette Display ist geöffnet. Alle Karten liegen in deiner Rundensammlung."
                : openingFlow.phase === "ready"
                  ? "Alle Karten liegen verdeckt bereit und können einzeln aufgedeckt werden."
                  : isDisplaySequenceActive
                    ? `Pack ${displayPackNumber} von ${displayOpenings.length} liegt bereit. Schneide es links auf, dann landen die Karten hier.`
                    : "Die Ablage bleibt leer, bis du das Pack öffnest.";
  const openingStatusLabel =
    openingFlow.phase === "tearing"
      ? "Pack wird aufgerissen"
      : openingFlow.phase === "stacking"
        ? "Stapel erscheint"
        : openingFlow.phase === "dealing" && cardsHaveArrived && !isRequestReady
          ? "Öffnung wird verbucht"
          : openingFlow.phase === "dealing"
            ? "Karten werden ausgeteilt"
            : openingFlow.phase === "error"
              ? "Öffnung fehlgeschlagen"
              : displaySequenceComplete
                ? "Display abgeschlossen"
                : isDisplaySequenceActive && openingFlow.phase === "idle"
                  ? "Pack bereit zum Aufschneiden"
                  : isDisplaySequenceActive && openingFlow.phase === "ready"
                    ? "Pack fertig"
                    : openingFlow.phase === "ready"
                      ? "Bereit zum Aufdecken"
                      : "Bereit";

  return (
    <section className="panel-surface opening-workbench rounded-[30px] p-4 sm:p-5 lg:p-6">
      <div className="opening-workbench-head">
        <div className="opening-workbench-title">
          <Link href="/packs" className="opening-inline-back">
            Zurück zu Packs
          </Link>
          <p className="ui-kicker">Pack-Workbench</p>
          <h1 className="mt-3 font-display inscription-text-soft text-[2rem] leading-[0.96] sm:text-[2.4rem] xl:text-[2.7rem]">
            {activeSet.name}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill
              tone={activeSet.productType === "CORE_BOOSTER" ? "gold" : "teal"}
            >
              {activeSet.productType === "CORE_BOOSTER"
                ? "Hauptbooster"
                : "Spezialpack"}
            </StatusPill>
            <StatusPill tone="slate">{activeSet.code}</StatusPill>
            <StatusPill tone="slate">
              Release {formatDate(activeSet.releaseDate)}
            </StatusPill>
            <StatusPill tone="gold">{activeSet.cardPoolSize} Karten</StatusPill>
            <StatusPill tone={activeSet.canBuy ? "teal" : "ember"}>
              {activeSet.canBuy
                ? `${packPriceLabel} pro Pack`
                : activeSet.rewardOnly
                  ? "Nur Reward"
                  : "Gesperrt"}
            </StatusPill>
            <StatusPill tone="slate">Wallet {walletBalanceLabel}</StatusPill>
          </div>
        </div>

        <div className="opening-workbench-toolbar">
          <div className="opening-speed-control paper-card">
            <div className="opening-speed-head">
              <p className="ui-kicker">Tempo</p>
              <span className="opening-speed-value">{openingSpeed}x</span>
            </div>
            <input
              type="range"
              min={openingSpeeds[0]}
              max={openingSpeeds[openingSpeeds.length - 1]}
              step={1}
              value={openingSpeed}
              onChange={(event) =>
                setOpeningSpeed(
                  Number(event.currentTarget.value) as OpeningSpeed,
                )
              }
              disabled={isOpeningInProgress}
              aria-label="Öffnungstempo"
              className="opening-speed-range"
              style={
                {
                  "--slider-progress": sliderProgress,
                } as CSSProperties
              }
            />
            <div className="opening-speed-scale" aria-hidden="true">
              <span>1x</span>
              <span>10x</span>
            </div>
          </div>

          <div className="opening-toolbar-status">
            <StatusPill
              tone={
                isSubmitting ? "ember" : cardsHaveArrived ? "teal" : "slate"
              }
            >
              {openingStatusLabel}
            </StatusPill>
            <StatusPill tone="gold">
              {currentOpening
                ? `${revealedCount}/${currentOpening.pulls.length} aufgedeckt`
                : `${activeSet.packSize} Karten pro Pack`}
            </StatusPill>
            {activeSet.canBuy ? (
              <StatusPill tone="slate">
                Display öffnen ({displayCostLabel})
              </StatusPill>
            ) : null}
            <StatusPill tone="slate">
              {currentOpening
                ? `Session ${formatDateTime(currentOpening.openedAt)}`
                : "Noch keine Öffnung"}
            </StatusPill>
            {isDisplaySequenceActive ? (
              <StatusPill tone={displaySequenceComplete ? "teal" : "ember"}>
                {formatRemainingPacks(displayPacksRemaining)}
              </StatusPill>
            ) : null}
          </div>

          <div className="opening-toolbar-actions">
            <button
              type="button"
              onClick={() => {
                handleOpenPack();
              }}
              disabled={
                !activeSet.canBuy ||
                openingFlow.requestStatus === "pending" ||
                isFlowActive ||
                isPending ||
                (isDisplaySequenceActive && !displaySequenceComplete)
              }
              className="ui-button-primary min-w-[12.5rem] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting || isPending
                ? "Pack wird geöffnet..."
                : `Booster öffnen (${packPriceLabel})`}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleOpenDisplay();
              }}
              disabled={
                !activeSet.canBuy ||
                isSubmitting ||
                isFlowActive ||
                isPending ||
                (isDisplaySequenceActive && !displaySequenceComplete)
              }
              className="ui-button-neutral min-w-[12.5rem] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Display öffnen ({displayCostLabel})
            </button>

            {isDisplaySequenceActive ? (
              <button
                type="button"
                onClick={handlePrepareNextDisplayPack}
                disabled={
                  openingFlow.phase !== "ready" ||
                  !hasNextDisplayPack ||
                  isSubmitting ||
                  isPending
                }
                className="ui-button-primary min-w-[12.5rem] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hasNextDisplayPack
                  ? `Nächstes Pack bereitlegen (${formatRemainingPacks(displayPacksRemaining)})`
                  : "Display abgeschlossen"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={revealAll}
              disabled={
                openingFlow.phase !== "ready" ||
                !currentOpening ||
                revealedCount === currentOpening.pulls.length
              }
              className="ui-button-neutral min-w-[11rem] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Alle aufdecken
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="paper-card-strong mt-4 rounded-[22px] border border-[rgba(204,97,78,0.28)] p-4 text-sm leading-7 text-[#f2c1b7]">
          {error}
        </div>
      ) : null}

      {batchNotice ? (
        <div className="paper-card-strong mt-4 rounded-[22px] border border-[rgba(211,166,94,0.28)] p-4 text-sm leading-7 text-[#efd7b8]">
          {batchNotice}
        </div>
      ) : null}

      {!activeSet.canBuy ? (
        <div className="paper-card-strong mt-4 rounded-[22px] border border-[rgba(204,97,78,0.28)] p-4 text-sm leading-7 text-[#f2c1b7]">
          {activeSet.rewardOnly
            ? "Dieses Pack ist ein Reward-Pack und kann nur als Belohnung geöffnet werden."
            : "Dieses Pack ist in der Kampagne noch nicht freigeschaltet. Schließe ein Turnier ab und wende den nächsten Progression-Checkpoint an."}
        </div>
      ) : null}

      <div className="opening-station-layout opening-station-layout--app">
        <div className="opening-stage-card">
          <div
            className={classes(
              "pack-opening-hero",
              packPhase === "tearing" && "is-tearing",
              packPhase === "revealing" && "is-revealing",
              (openingFlow.phase === "stacking" ||
                openingFlow.phase === "dealing") &&
                "is-dealing",
              canInteractWithPack && "cursor-pointer",
            )}
          >
            {isDisplaySequenceActive ? (
              <div className="display-pack-counter" aria-live="polite">
                <span className="display-pack-counter-number">
                  {displayPacksRemaining}
                </span>
                <span className="display-pack-counter-label">
                  {displayPacksRemaining === 1 ? "Pack übrig" : "Packs übrig"}
                </span>
              </div>
            ) : null}

            <div className="relative z-10 w-full">
              <PackOpeningActor
                imageUrl={packRenderAssets.frontImageUrl}
                label={activeSet.name}
                code={activeSet.code}
                phase={packPhase}
                variantId={openingVariant.id}
                speed={openingSpeed}
                highlightTier={highestRarityTier}
                onCutComplete={handlePackCutComplete}
              />

              {(openingFlow.phase === "stacking" ||
                openingFlow.phase === "dealing" ||
                (openingFlow.phase === "error" &&
                  openingFlow.stackWasShown)) &&
              landedIds.length < activeSet.packSize ? (
                <div
                  ref={stackOriginRef}
                  className={classes(
                    "opening-card-stack opening-card-stack--pack",
                    openingFlow.phase === "stacking" && "is-entering",
                    openingFlow.phase === "error" && "is-retracting",
                  )}
                  style={
                    {
                      "--stack-entrance-duration": `${PACK_OPENING_TIMING.stackEntranceMs / openingSpeed}ms`,
                    } as CSSProperties
                  }
                  aria-label={`${activeSet.packSize - landedIds.length} verdeckte Karten im Stapel`}
                >
                  {Array.from(
                    {
                      length: Math.min(
                        5,
                        Math.max(1, activeSet.packSize - landedIds.length),
                      ),
                    },
                    (_, index) => (
                      <OpeningVisualCardBack
                        key={index}
                        className="opening-card-stack-layer"
                        style={{ "--stack-layer": index } as CSSProperties}
                      />
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="opening-tray-surface">
          <div className="opening-tray-head">
            <div>
              <p className="ui-kicker">Ablage</p>
              <h2 className="mt-2 font-display inscription-text-soft text-[1.45rem] leading-[1.02] sm:text-[1.72rem]">
                Packinhalt
              </h2>
              <p className="opening-tray-copy">{trayCopy}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <StatusPill
                tone={
                  openingFlow.phase === "ready"
                    ? "teal"
                    : isFlowActive || isSubmitting
                      ? "ember"
                      : "slate"
                }
              >
                {openingFlow.phase === "ready"
                  ? "Bereit"
                  : openingFlow.phase === "dealing" &&
                      cardsHaveArrived &&
                      !isRequestReady
                    ? "Wird verbucht"
                    : isFlowActive
                      ? "In Bewegung"
                      : "Leer"}
              </StatusPill>
              {currentOpening ? (
                <StatusPill tone="gold">
                  {currentOpening.pulls.length} Karten
                </StatusPill>
              ) : null}
            </div>
          </div>

          <div ref={trayCanvasRef} className="opening-tray-canvas">
            {openingFlow.phase !== "idle" ? (
              <>
                <div className="reveal-grid reveal-grid--tray">
                  {Array.from({ length: activeSet.packSize }, (_, index) => {
                    const slotIndex = index + 1;
                    const pull = pullsBySlot.get(slotIndex);
                    const isLanded = landedIds.includes(slotIndex);
                    const isRevealed = pull
                      ? revealedIds.includes(pull.id)
                      : false;

                    return (
                      <div
                        key={slotIndex}
                        ref={(node) => {
                          arrivalSlotRefs.current[String(slotIndex)] = node;
                        }}
                        className="reveal-card-slot"
                      >
                        {isLanded && pull && isRequestReady ? (
                          <OpeningRevealCard
                            pull={pull}
                            isRevealed={isRevealed}
                            disabled={openingFlow.phase !== "ready"}
                            onClick={() => revealSingle(pull.id)}
                            onHoverStart={(element) =>
                              updateHoverCard(pull.id, element)
                            }
                            onHoverEnd={() => setHoverCard(null)}
                          />
                        ) : isLanded ? (
                          <OpeningVisualCardBack
                            className={classes(
                              "opening-dealt-card is-locked",
                              openingFlow.phase === "error" && "is-retracting",
                            )}
                          />
                        ) : (
                          <div
                            className="reveal-card-placeholder"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="opening-arrival-layer" aria-hidden="true">
                  {openingFlow.phase === "dealing"
                    ? Array.from({ length: activeSet.packSize }, (_, index) => {
                        const slotIndex = index + 1;
                        const arrivalLayout = arrivalLayouts[String(slotIndex)];

                        if (
                          landedIds.includes(slotIndex) ||
                          !arrivalLayout ||
                          !arrivalLayoutsReady
                        ) {
                          return null;
                        }

                        return (
                          <OpeningVisualCardBack
                            key={`arrival-${slotIndex}`}
                            className="is-arriving is-locked"
                            style={getArrivalStyle(
                              index,
                              activeSet.packSize,
                              openingSpeed,
                              arrivalLayout,
                            )}
                          />
                        );
                      })
                    : null}
                </div>

                {hoveredPull && hoverCard ? (
                  <div
                    className="opening-card-tooltip"
                    style={{
                      left: `${hoverCard.left}px`,
                      top: `${hoverCard.top}px`,
                    }}
                  >
                    <p className="opening-card-tooltip-kicker">
                      {hoveredPullIsRevealed ? "Karteninfo" : "Verdeckte Karte"}
                    </p>
                    <h3 className="opening-card-tooltip-title">
                      {hoveredPullIsRevealed
                        ? hoveredPull.cardName
                        : "Noch nicht aufgedeckt"}
                    </h3>

                    {hoveredPullIsRevealed ? (
                      <div className="opening-card-tooltip-meta">
                        <StatusPill tone="gold">
                          {getRarityAbbreviation(hoveredPull.rarity)}
                        </StatusPill>
                        <StatusPill tone="slate">
                          {hoveredPull.setCode}
                        </StatusPill>
                      </div>
                    ) : null}

                    <p className="opening-card-tooltip-copy">
                      {hoveredPullIsRevealed
                        ? `${getRarityLabel(hoveredPull.rarity)} · ${hoveredPull.setCode}`
                        : "Klicke auf die Karte, um sie aufzudecken."}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="opening-tray-empty">
                <div className="opening-tray-empty-copy">
                  <p className="ui-kicker">Noch leer</p>
                  <p className="mt-3 text-base leading-7 text-[#d4c4b1]">
                    Öffne das Pack links, dann wird die Ablage automatisch
                    gefüllt.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
