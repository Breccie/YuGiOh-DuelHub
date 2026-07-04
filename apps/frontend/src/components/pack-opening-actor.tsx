"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RarityTier } from "@/lib/rarity";

export type PackOpeningPhase = "idle" | "tearing" | "revealing";
export type PackOpeningVariantId = "elegant" | "master" | "pocket";

type PackOpeningVariant = {
  id: PackOpeningVariantId;
  tearDurationMs: number;
  packDurationMs: number;
  visiblePackTransform: string;
  tearStripTransform: string;
  tearGlow: string;
};

type TearPoint = {
  x: number;
  y: number;
};

type TearDirection = "ltr" | "rtl";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const minCutY = 14;
const maxCutY = 82;
const cutEdgeThreshold = 22;
const cutCompleteThreshold = 4;
const minFreeDrawPointDistance = 0.7;
const maxTearPathPoints = 120;

function roundPoint(value: number) {
  return Math.round(value * 10) / 10;
}

function buildDefaultTearPath(cutY: number): TearPoint[] {
  const baseY = clamp(cutY, minCutY, maxCutY);

  return [
    { x: 0, y: baseY },
    { x: 14, y: baseY - 1.6 },
    { x: 28, y: baseY + 1.8 },
    { x: 43, y: baseY - 0.9 },
    { x: 58, y: baseY + 2.1 },
    { x: 74, y: baseY - 1.3 },
    { x: 88, y: baseY + 1.1 },
    { x: 100, y: baseY },
  ].map((point) => ({
    x: roundPoint(point.x),
    y: roundPoint(clamp(point.y, minCutY, maxCutY)),
  }));
}

function normalizePointerPoint(node: HTMLDivElement, clientX: number, clientY: number) {
  const rect = node.getBoundingClientRect();
  const px = clamp((clientX - rect.left) / rect.width, 0, 1);
  const py = clamp((clientY - rect.top) / rect.height, 0, 1);

  return {
    x: roundPoint(px * 100),
    y: roundPoint(clamp(py * 100, minCutY, maxCutY)),
    rawY: py,
    px,
    py,
  };
}

function trimFreeDrawPath(path: TearPoint[]) {
  if (path.length <= maxTearPathPoints) {
    return path;
  }

  return [path[0], ...path.slice(-(maxTearPathPoints - 1))];
}

function appendFreeDrawPoint(path: TearPoint[], point: TearPoint) {
  const previousPath = path.length > 0 ? path : [point];
  const previousPoint = previousPath[previousPath.length - 1];
  const nextPoint = {
    x: roundPoint(clamp(point.x, 0, 100)),
    y: roundPoint(clamp(point.y, minCutY, maxCutY)),
  };
  const distance = Math.hypot(
    nextPoint.x - previousPoint.x,
    nextPoint.y - previousPoint.y,
  );

  if (distance < minFreeDrawPointDistance) {
    return previousPath;
  }

  return trimFreeDrawPath([...previousPath, nextPoint]);
}

function getClipEdgePath(path: TearPoint[]) {
  const edgeByX = new Map<number, TearPoint>();

  for (const point of path) {
    edgeByX.set(Math.round(point.x), point);
  }

  return Array.from(edgeByX.values()).sort((left, right) => left.x - right.x);
}

function ensureCompleteClipPath(path: TearPoint[]) {
  const edgePath = getClipEdgePath(path);
  const firstPoint = edgePath[0] ?? path[0] ?? { x: 0, y: minCutY };
  const lastPoint = edgePath[edgePath.length - 1] ?? firstPoint;

  return [
    { x: 0, y: firstPoint.y },
    ...edgePath.filter((point) => point.x > 0 && point.x < 100),
    { x: 100, y: lastPoint.y },
  ];
}

function completeTearPath(
  path: TearPoint[],
  fallbackY: number,
  direction: TearDirection,
) {
  const anchor = direction === "ltr" ? 0 : 100;
  const endX = direction === "ltr" ? 100 : 0;
  const previousPath = path.length > 0 ? path : [{ x: anchor, y: fallbackY }];
  const lastPoint = previousPath[previousPath.length - 1];

  if (lastPoint.x === endX) {
    return previousPath;
  }

  return trimFreeDrawPath([
    ...previousPath,
    { x: endX, y: roundPoint(clamp(lastPoint.y, minCutY, maxCutY)) },
  ]);
}

function getTearStartDirection(point: TearPoint): TearDirection | null {
  if (point.x <= cutEdgeThreshold) {
    return "ltr";
  }

  if (point.x >= 100 - cutEdgeThreshold) {
    return "rtl";
  }

  return null;
}

function hasReachedTearEnd(point: TearPoint, direction: TearDirection) {
  return direction === "ltr"
    ? point.x >= 100 - cutCompleteThreshold
    : point.x <= cutCompleteThreshold;
}

function toTearPolyline(path: TearPoint[]) {
  return path.map((point) => `${point.x},${point.y}`).join(" ");
}

function toClipPolygon(path: TearPoint[], section: "top" | "body") {
  const edgePath = ensureCompleteClipPath(path);

  const points =
    section === "top"
      ? [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          ...edgePath.slice().reverse(),
        ]
      : [
          ...edgePath,
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ];

  return `polygon(${points.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;
}

function toSeamGlowClip(path: TearPoint[]) {
  const edgePath = ensureCompleteClipPath(path);
  const topEdge = edgePath.map((point) => ({
    x: point.x,
    y: clamp(point.y - 0.8, 0, 100),
  }));
  const bottomEdge = edgePath
    .slice()
    .reverse()
    .map((point) => ({ x: point.x, y: clamp(point.y + 1.2, 0, 100) }));

  return `polygon(${[...topEdge, ...bottomEdge]
    .map((point) => `${point.x}% ${point.y}%`)
    .join(", ")})`;
}

const openingVariants: PackOpeningVariant[] = [
  {
    id: "elegant",
    tearDurationMs: 1260,
    packDurationMs: 1180,
    visiblePackTransform: "translateY(132px) scale(0.88) rotate(-3deg)",
    tearStripTransform: "translate(-58px,-26px) rotate(-9deg)",
    tearGlow:
      "radial-gradient(circle at center, rgba(255,226,188,0.62), rgba(255,226,188,0.14) 46%, transparent 72%)",
  },
  {
    id: "master",
    tearDurationMs: 1120,
    packDurationMs: 980,
    visiblePackTransform: "translateY(164px) scale(0.8) rotate(-8deg)",
    tearStripTransform: "translate(-78px,-32px) rotate(-15deg)",
    tearGlow:
      "radial-gradient(circle at center, rgba(255,170,145,0.78), rgba(255,170,145,0.18) 44%, transparent 72%)",
  },
  {
    id: "pocket",
    tearDurationMs: 1180,
    packDurationMs: 1080,
    visiblePackTransform: "translateY(146px) scale(0.84) rotate(5deg)",
    tearStripTransform: "translate(-48px,-21px) rotate(-7deg)",
    tearGlow:
      "radial-gradient(circle at center, rgba(210,229,255,0.74), rgba(210,229,255,0.18) 44%, transparent 72%)",
  },
];

export function getPackOpeningVariant(variantId: PackOpeningVariantId = "master") {
  return (
    openingVariants.find((variant) => variant.id === variantId) ??
    openingVariants[1]
  );
}

type PackOpeningActorProps = {
  imageUrl: string | null;
  backImageUrl?: string | null;
  label: string;
  code: string;
  phase?: PackOpeningPhase;
  variantId?: PackOpeningVariantId;
  speed?: number;
  highlightTier?: RarityTier;
  onCutComplete?: () => void;
};

const rarityHighlightProfiles: Record<
  RarityTier,
  {
    aura: string;
    seamGlow?: string;
    idleOpacity: number;
    tearOpacity: number;
  }
> = {
  none: {
    aura:
      "radial-gradient(ellipse at center, rgba(212,225,241,0.14), transparent 72%)",
    idleOpacity: 0.22,
    tearOpacity: 0.28,
  },
  rare: {
    aura:
      "radial-gradient(ellipse at center, rgba(194,214,255,0.28), transparent 70%)",
    seamGlow:
      "radial-gradient(circle at center, rgba(199,220,255,0.58), rgba(199,220,255,0.12) 46%, transparent 74%)",
    idleOpacity: 0.26,
    tearOpacity: 0.36,
  },
  super: {
    aura:
      "radial-gradient(ellipse at center, rgba(247,211,145,0.34), transparent 70%)",
    seamGlow:
      "radial-gradient(circle at center, rgba(247,214,156,0.74), rgba(247,214,156,0.16) 44%, transparent 74%)",
    idleOpacity: 0.32,
    tearOpacity: 0.46,
  },
  ultra: {
    aura:
      "radial-gradient(ellipse at center, rgba(255,229,182,0.42), transparent 70%)",
    seamGlow:
      "radial-gradient(circle at center, rgba(255,243,214,0.9), rgba(255,209,152,0.22) 44%, transparent 74%)",
    idleOpacity: 0.38,
    tearOpacity: 0.58,
  },
  secret: {
    aura:
      "radial-gradient(ellipse at center, rgba(212,198,255,0.26), rgba(255,227,180,0.34) 42%, transparent 74%)",
    seamGlow:
      "radial-gradient(circle at center, rgba(255,255,255,0.92), rgba(214,198,255,0.24) 28%, rgba(255,223,175,0.22) 52%, transparent 76%)",
    idleOpacity: 0.42,
    tearOpacity: 0.68,
  },
};

/* eslint-disable @next/next/no-img-element */
export function PackOpeningActor({
  imageUrl,
  backImageUrl = null,
  label,
  code,
  phase = "idle",
  variantId = "master",
  speed = 1,
  highlightTier = "none",
  onCutComplete,
}: PackOpeningActorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [shine, setShine] = useState({ x: 52, y: 20, opacity: 0.2 });
  const [cutPosition, setCutPosition] = useState(0.32);
  const cutPositionRef = useRef(cutPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [tearPath, setTearPath] = useState<TearPoint[]>([]);
  const tearPathRef = useRef<TearPoint[]>([]);
  const tearDirectionRef = useRef<TearDirection>("ltr");
  const isCompletingRef = useRef(false);
  const variant = getPackOpeningVariant(variantId);
  const speedScale = 1 / Math.max(1, speed);
  const tearDurationMs = variant.tearDurationMs * speedScale;
  const packDurationMs = variant.packDurationMs * speedScale;
  const packFadeMs = 680 * speedScale;
  const highlightProfile = rarityHighlightProfiles[highlightTier];
  const cutPercent = Math.round(cutPosition * 10000) / 100;
  const visibleTearPath = tearPath.length > 1 ? tearPath : buildDefaultTearPath(cutPercent);
  const tornStripClip = toClipPolygon(visibleTearPath, "top");
  const tornBodyClip = toClipPolygon(visibleTearPath, "body");
  const tornSeamGlowClip = toSeamGlowClip(visibleTearPath);
  const tearPolyline = toTearPolyline(visibleTearPath);
  const intactClipPath = "inset(0 0 0 0)";
  const tornClipPath = "inset(0 0 0 0)";
  const tearTransition = `clip-path ${tearDurationMs}ms cubic-bezier(0.2,0.92,0.24,1)`;
  const effectiveTearGlow = highlightProfile.seamGlow
    ? `${highlightProfile.seamGlow}, ${variant.tearGlow}`
    : variant.tearGlow;

  function setSyncedTearPath(nextPath: TearPoint[]) {
    tearPathRef.current = nextPath;
    setTearPath(nextPath);
  }

  function resetPose() {
    setRotation({ x: 0, y: 0 });
    setShine({ x: 52, y: 20, opacity: 0.18 });
  }

  function updateFromPointer(clientX: number, clientY: number) {
    if (phase !== "idle") {
      return;
    }

    const node = frameRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const px = clamp((clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((clientY - rect.top) / rect.height, 0, 1);
    const relX = px - 0.5;
    const relY = py - 0.5;

    setRotation({
      x: clamp(-relY * 18, -10, 10),
      y: clamp(relX * 18, -10, 10),
    });
    setShine({
      x: px * 100,
      y: py * 100,
      opacity: 0.28,
    });

    const clampedCut = clamp(py, minCutY / 100, maxCutY / 100);
    setCutPosition(clampedCut);
  }

  function completeCut(target: HTMLDivElement, pointerId: number) {
    if (isCompletingRef.current) {
      return;
    }

    isCompletingRef.current = true;
    setIsDragging(false);
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // ignore if capture was already released
    }

    setSyncedTearPath(
      completeTearPath(tearPathRef.current, cutPercent, tearDirectionRef.current),
    );
    onCutComplete?.();
  }

  function updateTearPath(clientX: number, clientY: number) {
    const node = frameRef.current;

    if (!node) {
      return null;
    }

    const point = normalizePointerPoint(node, clientX, clientY);
    const nextPath = appendFreeDrawPoint(tearPathRef.current, {
      x: point.x,
      y: point.y,
    });

    setSyncedTearPath(nextPath);
    setCutPosition(clamp(point.rawY, minCutY / 100, maxCutY / 100));

    return point;
  }

  function beginCut(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "idle") {
      return;
    }

    const node = frameRef.current;
    if (!node) {
      return;
    }

    const point = normalizePointerPoint(node, event.clientX, event.clientY);
    const direction = getTearStartDirection(point);

    if (!direction) {
      updateFromPointer(event.clientX, event.clientY);
      return;
    }

    isCompletingRef.current = false;
    tearDirectionRef.current = direction;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    const anchorX = direction === "ltr" ? 0 : 100;
    const initialCursorX =
      direction === "ltr" ? Math.max(1, point.x) : Math.min(99, point.x);
    setSyncedTearPath([
      { x: anchorX, y: point.y },
      { x: initialCursorX, y: point.y },
    ]);
    setCutPosition(clamp(point.rawY, minCutY / 100, maxCutY / 100));
    updateFromPointer(event.clientX, event.clientY);
  }

  function endCut(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore if capture was already released
    }

    const lastPoint = tearPathRef.current[tearPathRef.current.length - 1];

    if (lastPoint && hasReachedTearEnd(lastPoint, tearDirectionRef.current)) {
      completeCut(event.currentTarget, event.pointerId);
      return;
    }

    setSyncedTearPath([]);
  }

  useEffect(() => {
    cutPositionRef.current = cutPosition;
  }, [cutPosition]);

  useEffect(() => {
    if (phase === "idle") {
      isCompletingRef.current = false;
      tearPathRef.current = [];
    }

    const frameId = window.requestAnimationFrame(() => {
      if (phase === "idle") {
        setIsDragging(false);
        setTearPath([]);
        return;
      }

      setRotation({ x: 0, y: 0 });
      setShine({ x: 52, y: 20, opacity: 0.18 });

      if (phase === "tearing" && tearPathRef.current.length < 2) {
        const fallbackCutPercent = Math.round(cutPositionRef.current * 10000) / 100;
        const nextPath = buildDefaultTearPath(fallbackCutPercent);

        tearPathRef.current = nextPath;
        setTearPath(nextPath);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [phase]);

  return (
    <div className="relative mx-auto flex w-full max-w-[340px] justify-center">
      <div
        className="pointer-events-none absolute inset-x-[8%] bottom-[34px] h-10 blur-2xl"
        style={{
          opacity:
            phase === "idle"
              ? highlightProfile.idleOpacity
              : phase === "tearing"
                ? highlightProfile.tearOpacity
                : 0.18,
          background: highlightProfile.aura,
          transition: `opacity ${Math.max(180, 260 * speedScale)}ms ease-out`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-[22%] bottom-[-6px] h-[146px] opacity-[0.44] blur-[0.7px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.64),transparent_86%)]"
        style={{
          opacity: phase === "idle" ? 0.44 : 0,
          transform:
            phase === "idle"
              ? "translateY(0)"
              : phase === "tearing"
                ? "translateY(4px)"
                : "translateY(26px)",
          transition: `transform ${packDurationMs}ms cubic-bezier(0.22,1,0.36,1), opacity ${Math.max(120, (variant.packDurationMs - 40) * speedScale)}ms ease-out`,
        }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            width={351}
            height={550}
            sizes="260px"
            className="mx-auto h-auto w-[258px] scale-y-[-1] opacity-[0.82]"
            unoptimized
          />
        ) : null}
      </div>

      <div
        ref={frameRef}
        onPointerDown={beginCut}
        onPointerMove={(event) => {
          if (isDragging) {
            const point = updateTearPath(event.clientX, event.clientY);

            updateFromPointer(event.clientX, event.clientY);

            if (point && hasReachedTearEnd(point, tearDirectionRef.current)) {
              completeCut(event.currentTarget, event.pointerId);
            }
          }
        }}
        onPointerUp={endCut}
        onPointerCancel={endCut}
        onPointerLeave={() => {
          if (!isDragging) {
            resetPose();
          }
        }}
        className="relative z-10 h-[424px] w-[270px] [perspective:1400px]"
        style={{ touchAction: "none" }}
      >
        <div
          className="relative h-full w-full [transform-style:preserve-3d] transition-transform duration-150 ease-out"
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          }}
        >
          <div className="pointer-events-none absolute bottom-[88px] h-28 w-[228px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(198,213,236,0.18),transparent_72%)] blur-3xl" />
          {backImageUrl ? (
            <div
              className="pointer-events-none absolute inset-[18px] opacity-[0.94]"
              style={{
                transform: "translateZ(-2px) rotateY(180deg)",
              }}
            >
              <img
                src={backImageUrl}
                alt=""
                className="h-full w-full object-contain drop-shadow-[0_14px_26px_rgba(0,0,0,0.3)]"
                decoding="async"
                draggable={false}
                loading="eager"
              />
            </div>
          ) : null}

          <div
            className="relative h-full w-full"
            style={{
              opacity: 1,
              transform:
                phase === "idle"
                  ? "translateY(0) scale(1) rotate(0deg)"
                  : phase === "tearing"
                    ? "translateY(8px) scale(0.98) rotate(-1.5deg)"
                    : "translateY(2px) scale(0.98) rotate(-1deg)",
              transition: `transform ${packDurationMs}ms cubic-bezier(0.22,1,0.36,1), opacity ${Math.max(120, (variant.packDurationMs - 40) * speedScale)}ms ease-out`,
            }}
          >
            {imageUrl ? (
              <>
                <div
                  className="absolute pack-opening-tear-line"
                  style={{
                    opacity:
                      phase === "revealing"
                        ? 0
                        : phase === "tearing" || isDragging
                          ? 1
                          : phase === "idle"
                            ? 0.16
                            : 0,
                    transition: `opacity ${packFadeMs}ms ease-out`,
                  }}
                >
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="h-full w-full overflow-visible"
                    aria-hidden="true"
                  >
                    <polyline
                      points={tearPolyline}
                      fill="none"
                      stroke="rgba(255, 202, 154, 0.34)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3.2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <polyline
                      points={tearPolyline}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.92)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.35"
                      vectorEffect="non-scaling-stroke"
                    />
                    {isDragging ? (
                      <circle
                        cx={visibleTearPath[visibleTearPath.length - 1].x}
                        cy={visibleTearPath[visibleTearPath.length - 1].y}
                        r="1.7"
                        fill="rgba(255, 238, 207, 0.96)"
                      />
                    ) : null}
                  </svg>
                </div>
                <div
                  className="absolute inset-0 transition-opacity duration-200"
                  style={{
                    clipPath: intactClipPath,
                    opacity: phase === "idle" ? 1 : 0,
                    transition: `${tearTransition}, opacity 220ms ease-out`,
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={label}
                    className="h-full w-full object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,0.42)]"
                    decoding="async"
                    draggable={false}
                    loading="eager"
                  />
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      opacity: phase === "idle" ? shine.opacity : 0.12,
                      background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.22), transparent 18%), linear-gradient(120deg, transparent 38%, rgba(255,255,255,0.05) 48%, rgba(255,255,255,0.12) 51%, rgba(255,255,255,0.04) 56%, transparent 66%)`,
                      transition: "opacity 180ms ease-out",
                    }}
                  />
                </div>

                <div
                  className="pointer-events-none absolute inset-0 overflow-visible"
                  style={{
                    clipPath: tornClipPath,
                    opacity: phase === "idle" ? 0 : 1,
                    transition: `${tearTransition}, opacity 160ms ease-out`,
                  }}
                >
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      clipPath: tornBodyClip,
                      opacity: phase === "revealing" ? 0 : 1,
                      transform:
                        phase === "tearing"
                          ? "translateY(22px)"
                          : phase === "revealing"
                            ? "translateY(54px) rotate(1.5deg)"
                            : "translateY(0)",
                      transition: `transform ${tearDurationMs}ms cubic-bezier(0.22,1,0.36,1), opacity ${packFadeMs}ms ease-out`,
                    }}
                  >
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.24)]"
                      decoding="async"
                      draggable={false}
                      loading="eager"
                    />
                  </div>

                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      clipPath: tornStripClip,
                      opacity: phase === "revealing" ? 0 : 1,
                      transform:
                        phase === "idle"
                          ? "translateY(0)"
                          : phase === "tearing"
                            ? "translateY(-22px)"
                            : "translateY(-58px) rotate(-1.5deg)",
                      transition: `transform ${tearDurationMs}ms cubic-bezier(0.22,1,0.36,1), opacity ${packFadeMs}ms ease-out`,
                    }}
                  >
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.22)]"
                      decoding="async"
                      draggable={false}
                      loading="eager"
                    />
                  </div>

                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: tornSeamGlowClip,
                      opacity: phase === "idle" ? 0 : phase === "tearing" ? 0.84 : 0,
                      transition: `opacity ${Math.max(100, (variant.tearDurationMs - 120) * speedScale)}ms ease-out`,
                      background: effectiveTearGlow,
                      filter: "blur(1px)",
                    }}
                  />
                </div>

                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    opacity: phase === "idle" ? shine.opacity : phase === "tearing" ? 0.18 : 0.08,
                    background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.16), transparent 16%), linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.04) 48%, rgba(255,255,255,0.08) 51%, rgba(255,255,255,0.03) 56%, transparent 66%)`,
                    transition: "opacity 180ms ease-out",
                  }}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-2xl font-semibold text-[#f4eadc]">
                {code}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
/* eslint-enable @next/next/no-img-element */
