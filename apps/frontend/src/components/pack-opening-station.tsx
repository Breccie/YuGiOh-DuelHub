"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import type { OpenDisplayResponse, PackDashboardSnapshotDto } from "@ygo/contracts";
import {
  getPackOpeningVariant,
  PackOpeningActor,
  type PackOpeningPhase,
} from "@/components/pack-opening-actor";
import { StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
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
};

type HoverCardState = {
  pullId: string;
  left: number;
  top: number;
};

const openingSpeeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
type OpeningSpeed = (typeof openingSpeeds)[number];

const cardDealBaseDelay = 220;
const cardDealStepDelay = 170;
const cardDealDuration = 1050;
const packFadeDuration = 680;

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
  tearDurationMs: number,
  speed: OpeningSpeed,
  arrivalLayout: ArrivalLayout,
) {
  const stackDepth = index;
  const dealStart =
    tearDurationMs + packFadeDuration + cardDealBaseDelay + index * cardDealStepDelay;
  const speedScale = 1 / speed;

  return {
    "--arrival-x": `${arrivalLayout.x + stackDepth * 1.15}px`,
    "--arrival-y": `${arrivalLayout.y + stackDepth * 2}px`,
    "--arrival-rotate": `${-2.2 + stackDepth * -0.32}deg`,
    "--arrival-source-scale": "1",
    "--arrival-delay": `${dealStart * speedScale}ms`,
    "--arrival-duration": `${cardDealDuration * speedScale}ms`,
    "--arrival-z": String(pullCount - index),
    left: `${arrivalLayout.left}px`,
    top: `${arrivalLayout.top}px`,
    width: `${arrivalLayout.width}px`,
    height: `${arrivalLayout.height}px`,
  } as CSSProperties;
}

function scaleDuration(durationMs: number, speed: OpeningSpeed) {
  return durationMs / speed;
}

function addUniqueId(values: string[], nextValue: string) {
  return values.includes(nextValue) ? values : [...values, nextValue];
}

function formatRemainingPacks(count: number) {
  return count === 1 ? "1 Pack übrig" : `${count} Packs übrig`;
}

function noop() {}

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
  const [currentOpening, setCurrentOpening] = useState<OpeningSummary | null>(null);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [landedIds, setLandedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [batchNotice, setBatchNotice] = useState("");
  const [displayOpenings, setDisplayOpenings] = useState<DisplayOpeningSummary[]>([]);
  const [displayOpeningIndex, setDisplayOpeningIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [packPhase, setPackPhase] = useState<PackOpeningPhase>("idle");
  const [openingSpeed, setOpeningSpeed] = useState<OpeningSpeed>(1);
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const timersRef = useRef<number[]>([]);
  const packOriginRef = useRef<HTMLDivElement | null>(null);
  const trayCanvasRef = useRef<HTMLDivElement | null>(null);
  const arrivalSlotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [arrivalLayouts, setArrivalLayouts] = useState<Record<string, ArrivalLayout>>({});
  const [arrivalLayoutsReady, setArrivalLayoutsReady] = useState(false);

  const activeSet = snapshot.sets.find((set) => set.id === setId) ?? null;
  const isDisplaySequenceActive = displayOpenings.length > 0;
  const displayPackNumber = isDisplaySequenceActive ? displayOpeningIndex + 1 : 0;
  const hasNextDisplayPack =
    isDisplaySequenceActive && displayOpeningIndex < displayOpenings.length - 1;
  const cardsHaveArrived = currentOpening
    ? landedIds.length === currentOpening.pulls.length
    : false;
  const displayPacksRemaining = isDisplaySequenceActive
    ? Math.max(
        0,
        displayOpenings.length -
          displayOpeningIndex -
          (currentOpening ? 1 : 0),
      )
    : 0;
  const revealedCount = currentOpening
    ? currentOpening.pulls.filter((pull) => revealedIds.includes(pull.id)).length
    : 0;
  const isOpeningInProgress =
    isSubmitting ||
    packPhase !== "idle" ||
    (currentOpening !== null && !cardsHaveArrived);
  const displaySequenceComplete =
    isDisplaySequenceActive && currentOpening !== null && cardsHaveArrived && !hasNextDisplayPack;
  const canInteractWithPack =
    !isSubmitting &&
    !isPending &&
    Boolean(activeSet?.canBuy) &&
    (!isDisplaySequenceActive || currentOpening === null);
  const sliderProgress = `${((openingSpeed - 1) / (openingSpeeds.length - 1)) * 100}%`;
  const highestRarityTier = useMemo(
    () =>
      getHighestRarityTier(currentOpening?.pulls.map((pull) => pull.rarity) ?? []),
    [currentOpening],
  );

  const hoveredPull =
    currentOpening?.pulls.find((pull) => pull.id === hoverCard?.pullId) ?? null;
  const hoveredPullIsRevealed = hoveredPull
    ? revealedIds.includes(hoveredPull.id)
    : false;

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentOpening || cardsHaveArrived) {
      return;
    }

    let frameId = 0;
    let measureAttempts = 0;

    function measureArrivalLayouts() {
      const originNode = packOriginRef.current;
      const trayNode = trayCanvasRef.current;

      if (!originNode || !trayNode || !currentOpening) {
        return;
      }

      const originRect = originNode.getBoundingClientRect();
      const trayRect = trayNode.getBoundingClientRect();
      const origin = {
        x: originRect.left + originRect.width * 0.5,
        y: originRect.top + originRect.height * 0.42,
      };
      const nextLayouts: Record<string, ArrivalLayout> = {};

      for (const pull of currentOpening.pulls) {
        const slotNode = arrivalSlotRefs.current[pull.id];

        if (!slotNode) {
          continue;
        }

        const slotRect = slotNode.getBoundingClientRect();
        const target = {
          x: slotRect.left + slotRect.width * 0.5,
          y: slotRect.top + slotRect.height * 0.5,
        };

        nextLayouts[pull.id] = {
          x: Math.round(origin.x - target.x),
          y: Math.round(origin.y - target.y),
          left: Math.round(slotRect.left - trayRect.left),
          top: Math.round(slotRect.top - trayRect.top),
          width: Math.round(slotRect.width),
          height: Math.round(slotRect.height),
        };
      }

      measureAttempts += 1;

      if (
        Object.keys(nextLayouts).length < currentOpening.pulls.length &&
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
  }, [cardsHaveArrived, currentOpening]);

  useEffect(() => {
    if (!currentOpening || !arrivalLayoutsReady || cardsHaveArrived) {
      return;
    }

    const tearDuration = scaleDuration(openingVariant.tearDurationMs, openingSpeed);

    clearTimers();
    timersRef.current.push(
      window.setTimeout(() => {
        setPackPhase("revealing");
      }, tearDuration),
    );

    currentOpening.pulls.forEach((pull, index) => {
      const arrivalStart =
        tearDuration +
        scaleDuration(
          packFadeDuration + cardDealBaseDelay + index * cardDealStepDelay,
          openingSpeed,
        );
      const arrivalEnd = arrivalStart + scaleDuration(cardDealDuration, openingSpeed);

      timersRef.current.push(
        window.setTimeout(() => {
          setLandedIds((currentValue) => addUniqueId(currentValue, pull.id));
        }, arrivalEnd),
      );
    });

    const allCardsLandedAt =
      tearDuration +
      scaleDuration(
        packFadeDuration +
          cardDealBaseDelay +
          (currentOpening.pulls.length - 1) * cardDealStepDelay +
          cardDealDuration,
        openingSpeed,
      );

    timersRef.current.push(
      window.setTimeout(() => {
        setPackPhase("idle");
      }, allCardsLandedAt + scaleDuration(160, openingSpeed)),
    );
  }, [
    arrivalLayoutsReady,
    cardsHaveArrived,
    currentOpening,
    openingSpeed,
    openingVariant.tearDurationMs,
  ]);

  function clearTimers() {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }

    timersRef.current = [];
  }

  function resetOpeningAnimation(phase: PackOpeningPhase = "tearing") {
    clearTimers();
    setCurrentOpening(null);
    setRevealedIds([]);
    setLandedIds([]);
    setArrivalLayouts({});
    setArrivalLayoutsReady(false);
    setHoverCard(null);
    arrivalSlotRefs.current = {};
    setPackPhase(phase);
  }

  function playOpening(opening: OpeningSummary | DisplayOpeningSummary) {
    resetOpeningAnimation("tearing");
    setCurrentOpening(opening);
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

  async function handleOpenPack() {
    if (!activeSet) {
      return;
    }

    try {
      setError("");
      setBatchNotice("");
      setDisplayOpenings([]);
      setDisplayOpeningIndex(0);
      setIsSubmitting(true);
      resetOpeningAnimation("tearing");

      const payload = await packOpeningClient.open({
        setId: activeSet.id,
        idempotencyKey: crypto.randomUUID(),
      });

      setCurrentOpening(payload.opening);
      applyLocalOpeningResult([payload.opening], activeSet.packPrice ?? 0);
    } catch (caughtError) {
      setPackPhase("idle");
      setError(getApiErrorMessage(caughtError, "Pack konnte nicht geöffnet werden."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpenDisplay() {
    if (!activeSet) {
      return;
    }

    try {
      setError("");
      setBatchNotice("");
      setDisplayOpenings([]);
      setDisplayOpeningIndex(0);
      setIsSubmitting(true);
      resetOpeningAnimation("idle");

      const payload = await packOpeningClient.openDisplay({
        setId: activeSet.id,
        idempotencyKey: crypto.randomUUID(),
      });

      if (payload.openings.length === 0) {
        throw new Error("Das Display hat keine Pack-Öffnungen erzeugt.");
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
      setPackPhase("idle");
      setError(getApiErrorMessage(caughtError, "Display konnte nicht geöffnet werden."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrepareNextDisplayPack() {
    if (!cardsHaveArrived || !hasNextDisplayPack) {
      return;
    }

    const nextIndex = displayOpeningIndex + 1;

    if (!displayOpenings[nextIndex]) {
      return;
    }

    setError("");
    setDisplayOpeningIndex(nextIndex);
    resetOpeningAnimation("idle");
  }

  function handlePackCutComplete() {
    if (isSubmitting || isPending) {
      return;
    }

    if (isDisplaySequenceActive) {
      if (!currentOpening) {
        const queuedOpening = displayOpenings[displayOpeningIndex] ?? null;

        if (queuedOpening) {
          playOpening(queuedOpening);
        }
      }
      return;
    }

    void handleOpenPack();
  }

  function revealSingle(pullId: string) {
    if (!landedIds.includes(pullId)) {
      return;
    }

    setRevealedIds((currentValue) => addUniqueId(currentValue, pullId));
  }

  function revealAll() {
    if (!currentOpening || !cardsHaveArrived) {
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
    const canPlaceLeft =
      elementRect.left - trayRect.left > tooltipWidth + 24;
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
    activeSet.packPrice !== null ? `${formatNumber(activeSet.packPrice)} Credits` : "frei";
  const displayCostLabel =
    activeSet.displayCost !== null
      ? `${formatNumber(activeSet.displayCost)} Credits`
      : "nach Run-Regel";
  const walletBalanceLabel =
    snapshot.wallet ? `${formatNumber(snapshot.wallet.balance)} Credits` : "kein Wallet";

  const packRenderAssets = getPackRenderAssets(
    activeSet.code,
    activeSet.name,
    activeSet.imageUrl,
  );
  const trayCopy = currentOpening
    ? isDisplaySequenceActive && cardsHaveArrived && hasNextDisplayPack
      ? "Dieses Pack ist fertig. Lege als Nächstes das nächste Pack aus dem Display bereit."
      : isDisplaySequenceActive && displaySequenceComplete
        ? "Das komplette Display ist geöffnet. Alle Karten liegen in deiner Rundensammlung."
        : cardsHaveArrived
      ? "Alle Karten liegen verdeckt bereit und können einzeln aufgedeckt werden."
      : landedIds.length > 0
        ? "Die Karten landen nacheinander in der Ablage."
        : "Das Pack entlädt gerade seinen Inhalt."
    : isDisplaySequenceActive
      ? `Pack ${displayPackNumber} von ${displayOpenings.length} liegt bereit. Schneide es links auf, dann landen die Karten hier.`
      : "Die Ablage bleibt leer, bis du das Pack öffnest.";
  const openingStatusLabel = isSubmitting
    ? "Öffnung läuft"
    : displaySequenceComplete
      ? "Display abgeschlossen"
      : isDisplaySequenceActive && !currentOpening
        ? "Pack bereit zum Aufschneiden"
        : isDisplaySequenceActive && cardsHaveArrived
          ? "Pack fertig"
        : isDisplaySequenceActive
          ? `Display-Pack ${displayPackNumber}/${displayOpenings.length}`
          : cardsHaveArrived
            ? "Bereit zum Aufdecken"
            : currentOpening
              ? "Karten unterwegs"
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
                setOpeningSpeed(Number(event.currentTarget.value) as OpeningSpeed)
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
            <StatusPill tone={isSubmitting ? "ember" : cardsHaveArrived ? "teal" : "slate"}>
              {openingStatusLabel}
            </StatusPill>
            <StatusPill tone="gold">
              {currentOpening
                ? `${revealedCount}/${currentOpening.pulls.length} aufgedeckt`
                : `${activeSet.packSize} Karten pro Pack`}
            </StatusPill>
            {activeSet.canBuy ? (
              <StatusPill tone="slate">Display öffnen ({displayCostLabel})</StatusPill>
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
                void handleOpenPack();
              }}
              disabled={
                !activeSet.canBuy ||
                isSubmitting ||
                isPending ||
                (isDisplaySequenceActive && !displaySequenceComplete)
              }
              className="ui-button-primary min-w-[12.5rem] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting || isPending
                ? "Pack wird geöffnet..."
                : `Pack öffnen (${packPriceLabel})`}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleOpenDisplay();
              }}
              disabled={
                !activeSet.canBuy ||
                isSubmitting ||
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
                disabled={!cardsHaveArrived || !hasNextDisplayPack || isSubmitting || isPending}
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
                !cardsHaveArrived ||
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
              (isSubmitting || (currentOpening && !cardsHaveArrived)) && "is-dealing",
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

            <div ref={packOriginRef} className="relative z-10 w-full">
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
                tone={cardsHaveArrived ? "teal" : currentOpening ? "ember" : "slate"}
              >
                {cardsHaveArrived ? "Bereit" : currentOpening ? "Im Transfer" : "Leer"}
              </StatusPill>
              {currentOpening ? (
                <StatusPill tone="gold">{currentOpening.pulls.length} Karten</StatusPill>
              ) : null}
            </div>
          </div>

          <div ref={trayCanvasRef} className="opening-tray-canvas">
            {currentOpening ? (
              <>
                <div className="reveal-grid reveal-grid--tray">
                  {currentOpening.pulls.map((pull) => {
                    const isLanded = landedIds.includes(pull.id);
                    const isRevealed = revealedIds.includes(pull.id);

                    return (
                      <div
                        key={pull.id}
                        ref={(node) => {
                          arrivalSlotRefs.current[pull.id] = node;
                        }}
                        className="reveal-card-slot"
                      >
                        {isLanded ? (
                          <OpeningRevealCard
                            pull={pull}
                            isRevealed={isRevealed}
                            disabled={false}
                            onClick={() => revealSingle(pull.id)}
                            onHoverStart={(element) => updateHoverCard(pull.id, element)}
                            onHoverEnd={() => setHoverCard(null)}
                          />
                        ) : (
                          <div className="reveal-card-placeholder" aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="opening-arrival-layer" aria-hidden="true">
                  {currentOpening.pulls.map((pull, index) => {
                    const arrivalLayout = arrivalLayouts[pull.id];

                    if (landedIds.includes(pull.id) || !arrivalLayout || !arrivalLayoutsReady) {
                      return null;
                    }

                    return (
                      <OpeningRevealCard
                        key={`arrival-${pull.id}`}
                        pull={pull}
                        isRevealed={false}
                        disabled={true}
                        onClick={noop}
                        shellClassName="is-arriving is-locked"
                        shellStyle={getArrivalStyle(
                          index,
                          currentOpening.pulls.length,
                          openingVariant.tearDurationMs,
                          openingSpeed,
                          arrivalLayout,
                        )}
                      />
                    );
                  })}
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
                      {hoveredPullIsRevealed ? hoveredPull.cardName : "Noch nicht aufgedeckt"}
                    </h3>

                    {hoveredPullIsRevealed ? (
                      <div className="opening-card-tooltip-meta">
                        <StatusPill tone="gold">
                          {getRarityAbbreviation(hoveredPull.rarity)}
                        </StatusPill>
                        <StatusPill tone="slate">{hoveredPull.setCode}</StatusPill>
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
                    Öffne das Pack links, dann wird die Ablage automatisch gefüllt.
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
