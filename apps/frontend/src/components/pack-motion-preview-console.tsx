"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";

type PackMotionPreviewConsoleProps = {
  viewer: {
    displayName: string;
  };
  collectionValue: string;
  latestBanlistName: string;
  activeEra: string;
  pack: {
    name: string;
    code: string;
    imageUrl: string | null;
  };
  sampleCards: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
  }>;
};

type OpeningVariant = {
  id: "elegant" | "master" | "pocket";
  title: string;
  subtitle: string;
  verdict: string;
  accentClassName: string;
  stageGlowClassName: string;
  cardSpread: Array<{ x: number; y: number; rotate: number }>;
  hiddenCardTransform: string;
  visiblePackTransform: string;
  cardEase: string;
  tearDurationMs: number;
  packDurationMs: number;
  cardDurationMs: number;
  tearStripTransform: string;
  tearGlow: string;
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const openingVariants: OpeningVariant[] = [
  {
    id: "elegant",
    title: "A · langsam und edel",
    subtitle: "Die Folie öffnet sich ruhig, die Karten steigen nacheinander kontrolliert auf.",
    verdict: "Am besten für die cineastische Produktwirkung der App.",
    accentClassName: "text-[#e2c89f]",
    stageGlowClassName:
      "bg-[radial-gradient(circle_at_center,rgba(196,160,112,0.16),transparent_64%)]",
    cardSpread: [
      { x: -120, y: -92, rotate: -12 },
      { x: 0, y: -126, rotate: 0 },
      { x: 120, y: -92, rotate: 12 },
    ],
    hiddenCardTransform: "translate(-50%, 54px) scale(0.72) rotate(0deg)",
    visiblePackTransform: "translateY(132px) scale(0.88) rotate(-3deg)",
    cardEase: "cubic-bezier(0.22,1,0.36,1)",
    tearDurationMs: 1260,
    packDurationMs: 1180,
    cardDurationMs: 1180,
    tearStripTransform: "translate(-58px,-26px) rotate(-9deg)",
    tearGlow:
      "radial-gradient(circle at center, rgba(255,226,188,0.62), rgba(255,226,188,0.14) 46%, transparent 72%)",
  },
  {
    id: "master",
    title: "B · eher wie Master Duel",
    subtitle: "Härterer Lichtimpuls, schnellere Aufrissbewegung und stärkere Kartenfächerung.",
    verdict: "Am dynamischsten und am stärksten nach Duel-Spektakel.",
    accentClassName: "text-[#f0b49f]",
    stageGlowClassName:
      "bg-[radial-gradient(circle_at_center,rgba(217,88,63,0.22),transparent_62%)]",
    cardSpread: [
      { x: -138, y: -102, rotate: -20 },
      { x: 0, y: -146, rotate: 0 },
      { x: 138, y: -102, rotate: 20 },
    ],
    hiddenCardTransform: "translate(-50%, 86px) scale(0.58) rotate(0deg)",
    visiblePackTransform: "translateY(164px) scale(0.8) rotate(-8deg)",
    cardEase: "cubic-bezier(0.18,0.98,0.22,1.18)",
    tearDurationMs: 1120,
    packDurationMs: 980,
    cardDurationMs: 980,
    tearStripTransform: "translate(-78px,-32px) rotate(-15deg)",
    tearGlow:
      "radial-gradient(circle at center, rgba(255,170,145,0.78), rgba(255,170,145,0.18) 44%, transparent 72%)",
  },
  {
    id: "pocket",
    title: "C · eher wie Pokémon Pocket",
    subtitle: "Die Karten poppen weicher heraus, mit mehr Bounce und leichterem Belohnungsgefühl.",
    verdict: "Am charmantesten, aber etwas weniger erwachsen als die Referenz.",
    accentClassName: "text-[#c9d9ff]",
    stageGlowClassName:
      "bg-[radial-gradient(circle_at_center,rgba(122,156,224,0.2),transparent_60%)]",
    cardSpread: [
      { x: -112, y: -84, rotate: -14 },
      { x: 0, y: -132, rotate: 0 },
      { x: 112, y: -84, rotate: 14 },
    ],
    hiddenCardTransform: "translate(-50%, 96px) scale(0.56) rotate(0deg)",
    visiblePackTransform: "translateY(146px) scale(0.84) rotate(5deg)",
    cardEase: "cubic-bezier(0.32,1.3,0.64,1)",
    tearDurationMs: 1180,
    packDurationMs: 1080,
    cardDurationMs: 1160,
    tearStripTransform: "translate(-48px,-21px) rotate(-7deg)",
    tearGlow:
      "radial-gradient(circle at center, rgba(210,229,255,0.74), rgba(210,229,255,0.18) 44%, transparent 72%)",
  },
];

/* eslint-disable @next/next/no-img-element */
function PreviewPackActor({
  imageUrl,
  label,
  code,
  phase = "idle",
  variant,
}: {
  imageUrl: string | null;
  label: string;
  code: string;
  phase?: "idle" | "tearing" | "revealing";
  variant?: OpeningVariant;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [shine, setShine] = useState({ x: 52, y: 20, opacity: 0.2 });
  const tornStripClip =
    "polygon(0 0,100% 0,100% 29%,94% 36%,88% 31%,78% 40%,68% 34%,58% 42%,48% 35%,38% 44%,28% 37%,18% 47%,8% 39%,0 45%)";
  const tornBodyClip =
    "polygon(0 45%,8% 39%,18% 47%,28% 37%,38% 44%,48% 35%,58% 42%,68% 34%,78% 40%,88% 31%,94% 36%,100% 29%,100% 100%,0 100%)";
  const tornSeamGlowClip =
    "polygon(0 43%,8% 37%,18% 45%,28% 35%,38% 42%,48% 33%,58% 40%,68% 32%,78% 38%,88% 29%,94% 34%,100% 27%,100% 33%,94% 40%,88% 35%,78% 44%,68% 36%,58% 43%,48% 36%,38% 45%,28% 38%,18% 48%,8% 42%,0 48%)";
  const intactClipPath = phase === "idle" ? "inset(0 0 0 0)" : "inset(0 100% 0 0)";
  const tornClipPath = phase === "idle" ? "inset(0 0 0 100%)" : "inset(0 0 0 0)";
  const tearTransition = variant
    ? `clip-path ${variant.tearDurationMs}ms cubic-bezier(0.2,0.92,0.24,1)`
    : "clip-path 960ms cubic-bezier(0.2,0.92,0.24,1)";

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
  }

  return (
    <div
      ref={frameRef}
      onPointerMove={(event) => updateFromPointer(event.clientX, event.clientY)}
      onPointerLeave={resetPose}
      className="relative z-10 h-[345px] w-[220px] [perspective:1400px]"
    >
      <div
        className="relative h-full w-full [transform-style:preserve-3d] transition-transform duration-150 ease-out"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
        }}
      >
        <div
          className="relative h-full w-full"
          style={{
            opacity: phase === "revealing" ? 0 : 1,
            transform:
              phase === "idle"
                ? "translateY(0) scale(1) rotate(0deg)"
                : phase === "tearing"
                  ? "translateY(0) scale(1) rotate(0deg)"
                : variant?.visiblePackTransform ?? "translateY(140px) scale(0.84) rotate(-4deg)",
            transition: variant
              ? `transform ${variant.packDurationMs}ms cubic-bezier(0.22,1,0.36,1), opacity ${Math.max(420, variant.packDurationMs - 40)}ms ease-out`
              : "transform 720ms cubic-bezier(0.22,1,0.36,1), opacity 720ms ease-out",
          }}
        >
          {imageUrl ? (
            <>
              <div
                className="absolute inset-0 transition-opacity duration-200"
                style={{
                  clipPath: intactClipPath,
                  opacity: phase === "revealing" ? 0 : 1,
                  transition: `${tearTransition}, opacity 220ms ease-out`,
                }}
              >
                <img
                  src={imageUrl}
                  alt={label}
                  className="h-full w-full object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,0.42)]"
                  decoding="async"
                  draggable={false}
                  fetchPriority="high"
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

              {variant ? (
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
                    style={{ clipPath: tornBodyClip }}
                  >
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.24)]"
                      decoding="async"
                      draggable={false}
                      fetchPriority="high"
                      loading="eager"
                    />
                  </div>

                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      clipPath: tornStripClip,
                      transform:
                        phase === "idle"
                          ? "translate(0,0) rotate(0deg)"
                          : phase === "tearing"
                            ? variant.tearStripTransform
                            : "translate(-96px,-42px) rotate(-18deg)",
                      transition: `transform ${variant.tearDurationMs}ms cubic-bezier(0.22,1,0.36,1)`,
                    }}
                  >
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.22)]"
                      decoding="async"
                      draggable={false}
                      fetchPriority="high"
                      loading="eager"
                    />
                  </div>

                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: tornSeamGlowClip,
                      opacity: phase === "idle" ? 0 : phase === "tearing" ? 0.84 : 0.28,
                      transition: `opacity ${Math.max(360, variant.tearDurationMs - 120)}ms ease-out`,
                      background: variant.tearGlow,
                      filter: "blur(1px)",
                    }}
                  />
                </div>
              ) : null}
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
            <div className="flex h-[340px] items-center justify-center rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-center text-2xl text-[#f4eadc]">
              {code}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
/* eslint-enable @next/next/no-img-element */

function OpeningPreviewPanel({
  pack,
  sampleCards,
  variant,
}: {
  pack: PackMotionPreviewConsoleProps["pack"];
  sampleCards: PackMotionPreviewConsoleProps["sampleCards"];
  variant: OpeningVariant;
}) {
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState<"idle" | "tearing" | "revealing">("idle");
  const timersRef = useRef<number[]>([]);
  const visibleCards = useMemo(() => sampleCards.slice(0, 3), [sampleCards]);

  const sparks =
    variant.id === "pocket"
      ? [
          { left: "22%", top: "22%", delay: "0s" },
          { left: "76%", top: "26%", delay: "0.25s" },
          { left: "30%", top: "64%", delay: "0.4s" },
          { left: "72%", top: "70%", delay: "0.7s" },
        ]
      : [];

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  function clearTimers() {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }

    timersRef.current = [];
  }

  function handleStart() {
    clearTimers();
    setRunId((current) => current + 1);
    setPhase("tearing");

    timersRef.current.push(
      window.setTimeout(() => {
        setPhase("revealing");
      }, variant.tearDurationMs),
    );
  }

  function handleReset() {
    clearTimers();
    setPhase("idle");
  }

  const flashActive = phase !== "idle";
  const cardsVisible = phase === "revealing";

  return (
    <div className="rounded-[28px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(10,13,18,0.72),rgba(7,9,13,0.92))] p-5 shadow-[0_24px_54px_rgba(0,0,0,0.34)]">
      <div className="mb-4">
        <p className={classes("font-display text-[1.65rem] leading-none", variant.accentClassName)}>
          {variant.title}
        </p>
        <p className="mt-3 max-w-[44ch] text-sm leading-7 text-[#cdbba4]">{variant.subtitle}</p>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,16,0.44),rgba(7,9,13,0.86))] px-4 pb-8 pt-6">
        <div className={classes("pointer-events-none absolute inset-[12%] blur-3xl", variant.stageGlowClassName)} />

        {variant.id === "master" ? (
          <>
            <div className="pointer-events-none absolute inset-x-[10%] top-[28%] h-px bg-[linear-gradient(90deg,transparent,rgba(245,166,141,0.92),transparent)] opacity-80" />
            <div className="pointer-events-none absolute inset-y-[18%] right-[18%] w-px bg-[linear-gradient(180deg,transparent,rgba(207,91,66,0.48),transparent)]" />
          </>
        ) : null}

        {sparks.map((spark) => (
          <span
            key={`${runId}-${spark.left}-${spark.top}`}
            className="pointer-events-none absolute block h-2.5 w-2.5 rounded-full bg-[rgba(220,233,255,0.92)] opacity-0 shadow-[0_0_16px_rgba(214,226,255,0.72)]"
            style={{
              left: spark.left,
              top: spark.top,
              animation:
                flashActive && variant.id === "pocket"
                  ? `packPocketSparkle 1.2s ease-out ${spark.delay}`
                  : undefined,
            }}
          />
        ))}

        <div className="relative mx-auto h-[420px] max-w-[360px]">
          <div className="absolute inset-x-[20%] bottom-[42px] h-12 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(211,222,241,0.22),transparent_72%)] blur-2xl" />

          <div
            key={`flash-${variant.id}-${runId}`}
            className="pointer-events-none absolute inset-[14%]"
            style={{
              opacity: phase === "tearing" ? 0.96 : 0,
              transform: phase === "tearing" ? "scale(1.02)" : "scale(1.18)",
              transition:
                variant.id === "master"
                  ? "opacity 360ms ease-out, transform 760ms cubic-bezier(0.22,1,0.36,1)"
                  : "opacity 420ms ease-out, transform 920ms cubic-bezier(0.22,1,0.36,1)",
              background:
                variant.id === "master"
                  ? "radial-gradient(circle at center, rgba(255,177,155,0.74), rgba(255,177,155,0.08) 48%, transparent 68%)"
                  : variant.id === "pocket"
                    ? "radial-gradient(circle at center, rgba(208,229,255,0.78), rgba(208,229,255,0.08) 44%, transparent 68%)"
                    : "radial-gradient(circle at center, rgba(255,228,197,0.68), rgba(255,228,197,0.06) 44%, transparent 68%)",
            }}
          />

          <div
            className="absolute left-1/2 top-[166px] flex -translate-x-1/2 -translate-y-1/2 justify-center"
          >
            <PreviewPackActor
              imageUrl={pack.imageUrl}
              label={pack.name}
              code={pack.code}
              phase={phase}
              variant={variant}
            />
          </div>

          {visibleCards.map((card, index) => {
            const spread = variant.cardSpread[index] ?? variant.cardSpread[1];

            return (
              <div
                key={`${variant.id}-${card.id}-${index}`}
                className="absolute left-1/2 top-[190px] z-20"
                style={{
                  opacity: cardsVisible ? 1 : 0,
                  transform: cardsVisible
                    ? `translate(calc(-50% + ${spread.x}px), calc(-50% + ${spread.y}px)) rotate(${spread.rotate}deg) scale(1)`
                    : variant.hiddenCardTransform,
                  transition: `transform ${variant.cardDurationMs}ms ${variant.cardEase} ${520 + index * 140}ms, opacity ${Math.max(520, variant.cardDurationMs - 80)}ms ease ${520 + index * 140}ms`,
                }}
              >
                <div className="relative w-[112px] rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-1.5 shadow-[0_22px_44px_rgba(0,0,0,0.42)]">
                  <div className="relative aspect-[59/86] overflow-hidden rounded-[9px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#171d26_0%,#0b1016_100%)]">
                    {card.imageUrl ? (
                      <Image
                        src={card.imageUrl}
                        alt={card.name}
                        fill
                        sizes="112px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-[#ead6b4]">
                        {card.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className={classes("text-sm font-medium", variant.accentClassName)}>{variant.verdict}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[rgba(12,15,20,0.72)] px-4 text-sm uppercase tracking-[0.14em] text-[#dbc4a5] transition hover:border-[rgba(210,175,122,0.24)] hover:text-[#f5e4cd]"
          >
            <AssetIcon name="rotate" className="h-4 w-4 text-current" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[8px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-4 text-sm uppercase tracking-[0.14em] text-[#fff0e1] transition hover:brightness-110"
          >
            <AssetIcon name="play" className="h-4 w-4 text-current" />
            <span>Öffnung testen</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function PackMotionPreviewConsole({
  viewer,
  collectionValue,
  latestBanlistName,
  activeEra,
  pack,
  sampleCards,
}: PackMotionPreviewConsoleProps) {
  return (
    <DuelConsoleScaffold
      activePath="/packs"
      viewer={{
        displayName: viewer.displayName,
      }}
      metrics={[
        {
          icon: "book",
          label: "Sammlung",
          value: collectionValue,
        },
        {
          icon: "scale",
          label: "Banlist",
          value: latestBanlistName,
        },
        {
          icon: "hourglass",
          label: "Aktive Ära",
          value: activeEra,
        },
      ]}
    >
      <section className="grid gap-3 pt-4">
        <h1 className="font-display inscription-text text-[3.9rem] leading-[0.92] tracking-[0.02em] sm:text-[4.9rem]">
          Pack-Opening-Studie
        </h1>
        <p className="max-w-[72ch] text-[1.05rem] leading-8 text-[#dbc9b2]">
          Vergleich für die eigentliche Öffnung des Packs. Das Pack selbst bleibt im Ruhezustand still
          und reagiert nur auf die Maus. Getestet wird hier nur, wie der Moment des Öffnens wirken soll.
        </p>
      </section>

      <section className="mt-6 rounded-[28px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(10,13,18,0.76),rgba(7,9,13,0.92))] px-5 py-4 shadow-[0_26px_58px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[0.78rem] uppercase tracking-[0.22em] text-[#cb5c44]">Vergleichs-Pack</p>
            <p className="mt-2 font-display text-[2rem] text-[#dfc194]">{pack.name}</p>
          </div>
          <div className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-sm text-[#c7b39b]">
            Maus bewegt nur das Pack · Button startet die Öffnung
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 2xl:grid-cols-3">
        {openingVariants.map((variant) => (
          <OpeningPreviewPanel
            key={variant.id}
            pack={pack}
            sampleCards={sampleCards}
            variant={variant}
          />
        ))}
      </section>
    </DuelConsoleScaffold>
  );
}
