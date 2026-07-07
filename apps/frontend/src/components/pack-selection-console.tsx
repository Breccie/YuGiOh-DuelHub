"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ClaimRewardResponse,
  PackOpeningSummaryDto,
  RunRewardGrantDto,
  RunRewardsResponse,
} from "@ygo/contracts";
import { AssetIcon, type AssetIconName } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import { consoleNavItems } from "@/components/console-nav-items";
import {
  ConsoleProfileMenuChip,
  ConsoleSidebarUtilityActions,
  ConsoleWindowChromeButton as WindowChromeButton,
} from "@/components/console-shell-primitives";
import { InteractiveBoosterPack } from "@/components/interactive-booster-pack";
import { apiGetJson, apiPostJson, getApiErrorMessage } from "@/lib/api-client";
import { getPreferredPackHeroImage } from "@/lib/pack-renders";

type PackSelectionConsoleProps = {
  viewer: {
    displayName: string;
  };
  activeRunId: string | null;
  collectionProgress: {
    owned: number;
    total: number;
  };
  latestBanlistName: string;
  selectedSetId: string | null;
  sets: Array<{
    id: string;
    code: string;
    name: string;
    releaseDate: string;
    productType: string;
    packSize: number;
    cardPoolSize: number;
    imageUrl: string | null;
    totalOpened: number;
  }>;
  recentCollectionCards: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
    setCode: string | null;
  }>;
  activeDeck: null | {
    id: string;
    name: string;
    isLegal: boolean;
    banlistName: string;
    mainCount: number;
    extraCount: number;
    sideCount: number;
    cards: Array<{
      id: string;
      name: string;
      imageUrl: string | null;
      quantity: number;
      issues: string[];
    }>;
  };
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

type TimelineDragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startScrollLeft: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  hasDragged: boolean;
};

const TIMELINE_MOMENTUM_STALE_MS = 90;
const TIMELINE_MOMENTUM_FRICTION_PER_FRAME = 0.975;
const TIMELINE_MOMENTUM_STOP_VELOCITY = 0.012;
const TIMELINE_MOMENTUM_MAX_VELOCITY = 1.8;

const emptyTimelineDragState: TimelineDragState = {
  active: false,
  pointerId: null,
  startX: 0,
  startScrollLeft: 0,
  lastX: 0,
  lastTime: 0,
  velocityX: 0,
  hasDragged: false,
};

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getEraLabel(value: string) {
  const year = new Date(value).getUTCFullYear();

  if (year <= 2003) {
    return "DM Ära";
  }

  if (year <= 2007) {
    return "GX Ära";
  }

  if (year <= 2011) {
    return "5D's Ära";
  }

  if (year <= 2014) {
    return "ZEXAL Ära";
  }

  if (year <= 2017) {
    return "ARC-V Ära";
  }

  return "Moderne Ära";
}

function SidebarNavItem({
  href,
  label,
  active,
  iconName,
}: {
  href: string;
  label: string;
  active?: boolean;
  iconName: AssetIconName;
}) {
  return (
    <Link
      href={href}
      className={classes(
        "group relative flex items-center gap-4 border-y border-transparent px-6 py-8 text-sm uppercase tracking-[0.22em] transition",
        active
          ? "border-y-[rgba(196,69,48,0.14)] bg-[linear-gradient(90deg,rgba(124,32,22,0.34),rgba(124,32,22,0.12),transparent)] text-[#f4ddc2]"
          : "text-[#baa58d] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#f1deca]",
      )}
    >
      {active ? (
        <span className="absolute right-0 top-1/2 h-10 w-px -translate-y-1/2 bg-[#d04f36] shadow-[0_0_22px_rgba(208,79,54,0.95)]" />
      ) : null}
      <AssetIcon name={iconName} className="h-5 w-5 text-current" />
      <span>{label}</span>
    </Link>
  );
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={classes(
        "rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[linear-gradient(180deg,rgba(10,13,18,0.82),rgba(7,9,13,0.92))] shadow-[0_28px_56px_rgba(0,0,0,0.38)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function MetricChip({
  iconName,
  label,
  value,
}: {
  iconName: AssetIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,13,18,0.62)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
      <AssetIcon name={iconName} className="h-6 w-6 text-[#d0b38c]" />
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[#9f8c77]">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#efdfcb]">{value}</p>
      </div>
    </div>
  );
}

function CardArtwork({
  src,
  alt,
  sizes,
  fallbackLabel,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  fallbackLabel: string;
}) {
  const [failed, setFailed] = useState(!src);

  if (!src || failed) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-[0.7rem] font-semibold text-[#e8d8c3]">
        {fallbackLabel}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

function formatRewardReason(reason: string | null) {
  if (!reason) {
    return "Tournament Reward";
  }

  const parts = reason.split(" | ");
  const tournamentPart = parts[0] === "TOURNAMENT_REWARD" ? "Turnier" : parts[0];
  const rankPart = parts.find((part) => part.startsWith("rank:"));
  const note = parts.at(-1);
  const labels = [
    tournamentPart,
    rankPart ? `Platz ${rankPart.replace("rank:", "")}` : null,
    note && !note.startsWith("rank:") && note !== tournamentPart ? note : null,
  ].filter(Boolean);

  return labels.join(" / ");
}

function RewardInbox({ activeRunId }: { activeRunId: string | null }) {
  const [rewards, setRewards] = useState<RunRewardGrantDto[]>([]);
  const [claimedOpenings, setClaimedOpenings] = useState<PackOpeningSummaryDto[]>([]);
  const [pendingRewardId, setPendingRewardId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRewards() {
      if (!activeRunId) {
        return;
      }

      try {
        const payload = await apiGetJson<RunRewardsResponse>(
          `/api/v1/runs/${activeRunId}/rewards`,
          { cache: "no-store" },
        );

        if (!cancelled) {
          setRewards(payload.rewards);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(getApiErrorMessage(error, "Rewards konnten nicht geladen werden."));
        }
      }
    }

    void loadRewards();

    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  async function claimReward(rewardGrantId: string) {
    if (!activeRunId) {
      return;
    }

    setPendingRewardId(rewardGrantId);
    setMessage(null);

    try {
      const payload = await apiPostJson<ClaimRewardResponse, Record<string, never>>(
        `/api/v1/runs/${activeRunId}/rewards/${rewardGrantId}/claim`,
        {},
      );

      setRewards((current) =>
        current.map((reward) =>
          reward.id === payload.reward.id ? payload.reward : reward,
        ),
      );
      setClaimedOpenings(payload.openings);
      setMessage(`${payload.openings.length} Reward-Pack(s) geöffnet.`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Reward konnte nicht geöffnet werden."));
    } finally {
      setPendingRewardId(null);
    }
  }

  const pendingRewards = rewards.filter(
    (reward) =>
      reward.status === "PENDING" && reward.packSetId && reward.packQuantity > 0,
  );
  const revealedCards = claimedOpenings.flatMap((opening) =>
    opening.pulls.map((pull) => ({
      ...pull,
      openingId: opening.id,
      setName: opening.set.name,
    })),
  );

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
            Reward-Inbox
          </p>
          <p className="mt-1 text-sm text-[#bda88f]">
            {pendingRewards.length > 0
              ? `${pendingRewards.length} offene Tournament-Pack-Rewards`
              : "Keine offenen Tournament-Pack-Rewards"}
          </p>
        </div>
        <Link
          href="/tournaments"
          className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[#b19b84] transition hover:text-[#f0ddc8]"
        >
          <span>Turniere</span>
          <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pendingRewards.map((reward) => (
          <article
            key={reward.id}
            className="rounded-[16px] border border-[rgba(207,91,66,0.28)] bg-[rgba(207,91,66,0.08)] p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#d9a478]">
                  {formatRewardReason(reward.reason)}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[#f2dfc7]">
                  {reward.packSet?.name ?? "Tournament Pack"}
                </h3>
                <p className="mt-1 text-sm text-[#bea990]">
                  {reward.packQuantity}x {reward.packSet?.code ?? "Reward-Pack"}
                </p>
              </div>
              <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(9,11,15,0.64)] px-3 text-sm font-semibold text-[#f3dec4]">
                x{reward.packQuantity}
              </span>
            </div>

            <button
              type="button"
              onClick={() => claimReward(reward.id)}
              disabled={pendingRewardId === reward.id}
              className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[4px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#fff0e1] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              <span>
                {pendingRewardId === reward.id ? "Öffnet..." : "Reward öffnen"}
              </span>
              <AssetIcon name="package" className="h-4 w-4 text-current" />
            </button>
          </article>
        ))}

        {pendingRewards.length === 0 ? (
          <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[#bba78e]">
            Tournament-Pack-Belohnungen erscheinen hier nach dem Turnierabschluss.
          </div>
        ) : null}
      </div>

      {revealedCards.length > 0 ? (
        <div className="mt-5">
          <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
            Geöffnete Reward-Karten
          </p>
          <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
            {revealedCards.slice(0, 18).map((card) => (
              <article
                key={`${card.openingId}:${card.id}`}
                className="relative shrink-0 rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-2"
              >
                <div className="relative h-[154px] w-[102px] overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#171d26_0%,#0b1016_100%)]">
                  <CardArtwork
                    src={card.cardImageUrl}
                    alt={card.cardName}
                    sizes="102px"
                    fallbackLabel={card.cardName}
                  />
                </div>
                <p className="mt-2 max-w-[102px] truncate text-[0.72rem] font-semibold text-[#f0ddc3]">
                  {card.cardName}
                </p>
                <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-[#a99680]">
                  {card.rarity ?? "Karte"} / {card.setCode}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-[14px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-3 text-sm text-[#f0ddc3]">
          {message}
        </p>
      ) : null}
    </Panel>
  );
}

function DeckCount({
  iconName,
  value,
  label,
  accent,
}: {
  iconName: AssetIconName;
  value: number;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]"
        style={{ color: accent }}
      >
        <AssetIcon name={iconName} className="h-5 w-5 text-current" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-[#f0dfcc]">{value}</p>
        <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9d8a75]">
          {label}
        </p>
      </div>
    </div>
  );
}

export function PackSelectionConsole({
  viewer,
  activeRunId,
  collectionProgress,
  latestBanlistName,
  selectedSetId,
  sets,
  recentCollectionCards,
  activeDeck,
}: PackSelectionConsoleProps) {
  const timelineSets = useMemo(() => {
    const orderedSets = [...sets].sort(
      (left, right) =>
        new Date(left.releaseDate).getTime() - new Date(right.releaseDate).getTime(),
    );
    const coreSets = orderedSets.filter(
      (set) => set.productType === "CORE_BOOSTER",
    );
    return coreSets.length ? coreSets : orderedSets;
  }, [sets]);

  const [currentSetId, setCurrentSetId] = useState(
    selectedSetId ?? timelineSets[0]?.id ?? sets[0]?.id ?? "",
  );
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const timelineRowRef = useRef<HTMLDivElement | null>(null);
  const timelineDragRef = useRef<TimelineDragState>(emptyTimelineDragState);
  const timelineMomentumFrameRef = useRef<number | null>(null);
  const suppressTimelineClickRef = useRef(false);

  const selectedSet =
    timelineSets.find((set) => set.id === currentSetId) ??
    timelineSets[0] ??
    sets[0] ??
    null;

  if (!selectedSet) {
    return (
      <div className="min-h-screen bg-[#06080b] px-6 py-10 text-[#f2e6d2]">
        Keine Packs gefunden.
      </div>
    );
  }

  const heroPackImage = getPreferredPackHeroImage(
    selectedSet.code,
    selectedSet.name,
    selectedSet.imageUrl,
  );
  const compactHeroTitle = selectedSet.name.length > 24;
  const heroEra = getEraLabel(selectedSet.releaseDate);
  const visibleRecentCards = recentCollectionCards.slice(0, 8);
  const visibleDeckCards = activeDeck?.cards.slice(0, 10) ?? [];

  function scrollTimeline(direction: "left" | "right") {
    stopTimelineMomentum();
    timelineRowRef.current?.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  }

  function stopTimelineMomentum() {
    if (timelineMomentumFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(timelineMomentumFrameRef.current);
    timelineMomentumFrameRef.current = null;
  }

  function startTimelineMomentum(initialVelocityX: number) {
    const row = timelineRowRef.current;

    const clampedVelocityX = Math.max(
      -TIMELINE_MOMENTUM_MAX_VELOCITY,
      Math.min(TIMELINE_MOMENTUM_MAX_VELOCITY, initialVelocityX),
    );

    if (!row || Math.abs(clampedVelocityX) < 0.08) {
      return;
    }

    stopTimelineMomentum();

    let velocityX = clampedVelocityX;
    let previousTime = performance.now();

    const step = (time: number) => {
      const deltaTime = Math.min(time - previousTime, 32);
      previousTime = time;

      row.scrollLeft -= velocityX * deltaTime;
      velocityX *= Math.pow(
        TIMELINE_MOMENTUM_FRICTION_PER_FRAME,
        deltaTime / 16.67,
      );

      const atStart = row.scrollLeft <= 0;
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;

      if (Math.abs(velocityX) < TIMELINE_MOMENTUM_STOP_VELOCITY || atStart || atEnd) {
        timelineMomentumFrameRef.current = null;
        return;
      }

      timelineMomentumFrameRef.current = requestAnimationFrame(step);
    };

    timelineMomentumFrameRef.current = requestAnimationFrame(step);
  }

  function handleTimelinePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const row = timelineRowRef.current;

    if (!row) {
      return;
    }

    stopTimelineMomentum();

    const now = performance.now();

    timelineDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: row.scrollLeft,
      lastX: event.clientX,
      lastTime: now,
      velocityX: 0,
      hasDragged: false,
    };
  }

  function handleTimelinePointerMove(event: PointerEvent<HTMLDivElement>) {
    const row = timelineRowRef.current;
    const drag = timelineDragRef.current;

    if (!row || !drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const now = performance.now();
    const deltaTime = Math.max(now - drag.lastTime, 1);
    const moveX = event.clientX - drag.lastX;

    drag.velocityX = moveX / deltaTime;
    drag.lastX = event.clientX;
    drag.lastTime = now;

    if (Math.abs(deltaX) > 8) {
      if (!drag.hasDragged) {
        drag.hasDragged = true;
        setIsTimelineDragging(true);
      }

      if (!row.hasPointerCapture(event.pointerId)) {
        row.setPointerCapture(event.pointerId);
      }
    }

    row.scrollLeft = drag.startScrollLeft - deltaX;

    if (drag.hasDragged) {
      event.preventDefault();
    }
  }

  function finishTimelineDrag(event: PointerEvent<HTMLDivElement>) {
    const row = timelineRowRef.current;
    const drag = timelineDragRef.current;

    if (!drag.active || drag.pointerId !== event.pointerId) {
      return;
    }

    if (row?.hasPointerCapture(event.pointerId)) {
      row.releasePointerCapture(event.pointerId);
    }

    suppressTimelineClickRef.current = drag.hasDragged;
    const releasedAt = performance.now();
    const velocityX =
      releasedAt - drag.lastTime > TIMELINE_MOMENTUM_STALE_MS
        ? 0
        : drag.velocityX;
    timelineDragRef.current = emptyTimelineDragState;
    setIsTimelineDragging(false);

    if (drag.hasDragged) {
      startTimelineMomentum(velocityX);
    }
  }

  function handleTimelineClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressTimelineClickRef.current) {
      return;
    }

    suppressTimelineClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />
      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <aside className="app-sidebar border-b border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,15,0.78),rgba(5,7,10,0.9))] shadow-[18px_0_46px_rgba(0,0,0,0.34)] backdrop-blur-[18px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[196px] lg:border-b-0 lg:border-r lg:border-r-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-0 lg:py-0">
            <div className="border-b border-[rgba(255,255,255,0.08)] lg:px-6 lg:pb-8 lg:pt-6">
              <ConsoleBrand size="sm" />
            </div>

            <nav className="hidden lg:block lg:pt-2">
              {consoleNavItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  iconName={item.iconName}
                  active={item.href === "/packs"}
                />
              ))}
            </nav>

            <ConsoleSidebarUtilityActions />
          </div>

          <nav
            className="grid border-t border-[rgba(255,255,255,0.08)] lg:hidden"
            style={{ gridTemplateColumns: `repeat(${consoleNavItems.length}, minmax(0, 1fr))` }}
          >
            {consoleNavItems.map((item) => {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classes(
                    "flex flex-col items-center gap-2 px-1 py-3 text-[0.58rem] uppercase tracking-[0.16em] transition",
                    item.href === "/packs"
                      ? "bg-[rgba(207,91,66,0.14)] text-[#f4d9c4]"
                      : "text-[#aa9983] hover:bg-[rgba(255,255,255,0.04)]",
                  )}
                >
                  <AssetIcon name={item.iconName} className="h-5 w-5 text-current" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="relative flex-1 overflow-hidden lg:ml-[196px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-3 pb-4 pt-3 sm:px-4 lg:px-5">
            <section className="relative xl:min-h-[520px]">
              <div className="relative">
                <div className="hidden justify-end gap-3 xl:flex">
                  <WindowChromeButton name="window-min" label="Minimieren" />
                  <WindowChromeButton name="window-max" label="Fenster" />
                  <WindowChromeButton name="window-close" label="Schließen" />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-3 xl:mt-2">
                  <MetricChip
                    iconName="book"
                    label="Sammlung"
                    value={`${formatNumber(collectionProgress.owned)} / ${formatNumber(collectionProgress.total)}`}
                  />
                  <MetricChip
                    iconName="scale"
                    label="Banlist"
                    value={latestBanlistName}
                  />
                  <MetricChip iconName="hourglass" label="Aktive Ära" value={heroEra} />

                  <ConsoleProfileMenuChip viewer={{ displayName: viewer.displayName }} />
                </div>
              </div>

              <div className="relative mt-5 grid gap-8 xl:grid-cols-[360px_520px_minmax(0,1fr)] xl:items-end">
                <div className="xl:translate-y-[28px] xl:self-end">
                  <InteractiveBoosterPack
                    imageSrc={heroPackImage}
                    label={selectedSet.name}
                    code={selectedSet.code}
                  />
                </div>

                <div className="max-w-[520px]">
                  <p className="text-[0.8rem] uppercase tracking-[0.26em] text-[#cb5c44]">
                    Nächster chronologischer Booster
                  </p>
                  <h1
                    className={classes(
                      "font-display inscription-text mt-3 text-4xl leading-[0.92] uppercase tracking-[0.025em] sm:text-5xl",
                      compactHeroTitle ? "xl:text-[3.3rem]" : "xl:text-[4rem]",
                    )}
                  >
                    {selectedSet.name}
                  </h1>

                  <div className="mt-6 flex flex-wrap gap-7 text-sm text-[#d9c6ad]">
                    <div className="flex items-center gap-2">
                      <AssetIcon name="clock" className="h-4 w-4 text-[#c7ae8d]" />
                      <span>{formatReleaseDate(selectedSet.releaseDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AssetIcon name="book" className="h-4 w-4 text-[#c7ae8d]" />
                      <span>{selectedSet.cardPoolSize} Karten</span>
                    </div>
                  </div>

                  <div className="mt-7 flex max-w-[320px] flex-col gap-3">
                    <div className="flex rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] p-1 text-xs uppercase tracking-[0.16em]">
                      <span className="flex-1 rounded-full bg-[rgba(207,91,66,0.18)] px-3 py-2 text-center text-[#fff0df]">
                        Booster
                      </span>
                      <Link
                        href="/packs/promos"
                        className="flex-1 rounded-full px-3 py-2 text-center text-[#bfa88e] transition hover:text-[#fff0df]"
                      >
                        Promo-Karten
                      </Link>
                    </div>

                    <Link
                      href={`/packs/${selectedSet.id}`}
                      className="flex min-h-[56px] items-center justify-center gap-3 rounded-[4px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-5 text-base font-semibold uppercase tracking-[0.14em] text-[#fff0e1] shadow-[0_0_32px_rgba(151,29,20,0.28)] transition hover:brightness-110"
                    >
                      <span>Booster öffnen</span>
                      <AssetIcon name="package" className="h-5 w-5 text-current" />
                    </Link>

                    <Link
                      href={`/packs/${selectedSet.id}`}
                      className="flex min-h-[48px] items-center justify-center gap-3 rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[rgba(13,16,21,0.88)] px-5 text-sm uppercase tracking-[0.18em] text-[#ceb99f] transition hover:border-[rgba(202,80,59,0.28)] hover:text-[#f2dfcb]"
                    >
                      <span>Booster kaufen</span>
                      <AssetIcon name="cart" className="h-4 w-4 text-current" />
                    </Link>

                  </div>
                </div>

                <div className="hidden xl:block" />
              </div>
            </section>

            <section className="mt-2 grid gap-4 xl:grid-cols-[minmax(0,1fr)_392px] xl:grid-rows-[auto_auto]">
              <div className="xl:col-span-2">
                <RewardInbox activeRunId={activeRunId} />
              </div>

              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                    Chronologische Reihe
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollTimeline("left")}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#c9b79f] transition hover:border-[rgba(207,91,66,0.26)] hover:text-[#f2dfcb]"
                      aria-label="Packreihe nach links scrollen"
                    >
                      <AssetIcon name="chevron-left" className="h-4 w-4 text-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollTimeline("right")}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#c9b79f] transition hover:border-[rgba(207,91,66,0.26)] hover:text-[#f2dfcb]"
                      aria-label="Packreihe nach rechts scrollen"
                    >
                      <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                    </button>
                    <Link
                      href="/packs"
                      className="ml-2 inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[#b19b84] transition hover:text-[#f0ddc8]"
                    >
                      <span>Alle anzeigen</span>
                      <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                    </Link>
                  </div>
                </div>

                <div
                  ref={timelineRowRef}
                  className={classes(
                    "no-scrollbar mt-4 flex select-none gap-3 overflow-x-auto pb-3",
                    isTimelineDragging ? "cursor-grabbing" : "cursor-grab",
                  )}
                  onClickCapture={handleTimelineClickCapture}
                  onPointerDown={handleTimelinePointerDown}
                  onPointerMove={handleTimelinePointerMove}
                  onPointerUp={finishTimelineDrag}
                  onPointerCancel={finishTimelineDrag}
                  style={{ touchAction: "pan-y" }}
                >
                  {timelineSets.map((set) => {
                    const selected = set.id === selectedSet.id;
                    const timelineImage = getPreferredPackHeroImage(
                      set.code,
                      set.name,
                      set.imageUrl,
                    );

                    return (
                      <button
                        key={set.id}
                        type="button"
                        onClick={() => setCurrentSetId(set.id)}
                        className={classes(
                          "group relative shrink-0 rounded-[16px] border p-2 transition",
                          selected
                            ? "border-[rgba(207,91,66,0.48)] bg-[rgba(207,91,66,0.08)] shadow-[0_0_0_1px_rgba(207,91,66,0.16)]"
                            : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.16)]",
                        )}
                      >
                        <div className="relative flex h-[150px] w-[98px] items-center justify-center overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,21,28,0.96),rgba(10,12,16,0.98))] px-1 py-2">
                          {timelineImage ? (
                            <Image
                              src={timelineImage}
                              alt={set.name}
                              fill
                              loading={selected ? "eager" : "lazy"}
                              sizes="102px"
                              className="object-contain object-center"
                              draggable={false}
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[#eedfca]">
                              {set.code}
                            </div>
                          )}
                        </div>

                        {selected ? (
                          <div className="absolute inset-x-0 -bottom-2 flex justify-center">
                            <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#cf5b42]" />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel className="p-4 sm:p-5 xl:row-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                      Deck - {activeDeck?.name ?? "Kein Deck"}
                    </p>
                    <p className="mt-2 text-sm text-[#bca792]">
                      {activeDeck
                        ? `${activeDeck.banlistName} · ${activeDeck.isLegal ? "legal" : "mit Problemen"}`
                        : "Noch kein Deck erstellt."}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Link
                      href="/decks"
                      className="rounded-full p-2 text-[#cab69b] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f0dcc7]"
                      aria-label="Deck bearbeiten"
                    >
                      <AssetIcon name="edit" className="h-5 w-5 text-current" />
                    </Link>
                    <button
                      type="button"
                      className="rounded-full p-2 text-[#cab69b] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f0dcc7]"
                      aria-label="Deckoptionen"
                    >
                      <AssetIcon name="dots" className="h-5 w-5 text-current" />
                    </button>
                  </div>
                </div>

                {activeDeck ? (
                  <>
                    <div className="mt-5 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
                      <div className="grid grid-cols-5 gap-3">
                        {visibleDeckCards.map((card) => (
                          <div key={card.id} className="space-y-2">
                            <div className="relative overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#171d26_0%,#0b1016_100%)]">
                              <div className="relative aspect-[59/86]">
                                <CardArtwork
                                  src={card.imageUrl}
                                  alt={card.name}
                                  sizes="88px"
                                  fallbackLabel={card.name}
                                />
                              </div>
                              <div className="absolute bottom-2 right-2 rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(6,7,10,0.84)] px-2 py-0.5 text-[0.65rem] font-semibold text-[#f0dfcc]">
                                ×{card.quantity}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
                      <div className="grid grid-cols-3 gap-3">
                        <DeckCount
                          iconName="book"
                          value={activeDeck.mainCount}
                          label="Hauptdeck"
                          accent="#d3b08a"
                        />
                        <DeckCount
                          iconName="grid"
                          value={activeDeck.extraCount}
                          label="Extra Deck"
                          accent="#b88ae9"
                        />
                        <DeckCount
                          iconName="nav-packs"
                          value={activeDeck.sideCount}
                          label="Side Deck"
                          accent="#8ea7e3"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-5 rounded-[18px] border border-dashed border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.02)] px-4 py-6 text-sm text-[#b9aa96]">
                    Erstelle ein Deck, dann erscheint hier deine aktuelle Liste.
                  </div>
                )}
              </Panel>

              <Panel className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                    Sammlung - Neueste Zugänge
                  </p>
                  <Link
                    href="/collection"
                    className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[#b19b84] transition hover:text-[#f0ddc8]"
                  >
                    <span>Alle anzeigen</span>
                    <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                  </Link>
                </div>

                <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">
                  {visibleRecentCards.map((card) => (
                    <article
                      key={card.id}
                      className="relative shrink-0 rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-2"
                    >
                      <div className="absolute left-3 top-3 z-10 rounded-full border border-[rgba(207,91,66,0.42)] bg-[rgba(126,23,15,0.9)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#fff0e2]">
                        Neu
                      </div>

                      <div className="relative h-[154px] w-[102px] overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#171d26_0%,#0b1016_100%)]">
                        <CardArtwork
                          src={card.imageUrl}
                          alt={card.name}
                          sizes="102px"
                          fallbackLabel={card.name}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="max-w-[70px] truncate text-[0.7rem] uppercase tracking-[0.12em] text-[#d4b18e]">
                          {card.rarity ?? "Karte"}
                        </span>
                        <span className="text-[0.68rem] uppercase tracking-[0.12em] text-[#8f8376]">
                          {card.setCode ?? "Set"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </Panel>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
