"use client";

import Image from "next/image";
import { Float, Html } from "@react-three/drei";
import { useMemo, useState } from "react";
import { ThreeStageShell } from "@/components/three-stage-shell";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function isFoilRarity(rarity: string | null | undefined) {
  if (!rarity) {
    return false;
  }

  const value = rarity.toUpperCase();
  return (
    value.includes("SECRET") ||
    value.includes("GHOST") ||
    value.includes("ULTRA") ||
    value.includes("SUPER") ||
    value === "UR" ||
    value === "SR"
  );
}

function getFoilTone(rarity: string | null | undefined) {
  if (!rarity) {
    return "rgba(255,214,176,0.14)";
  }

  const value = rarity.toUpperCase();

  if (value.includes("GHOST") || value.includes("SECRET")) {
    return "rgba(190,156,255,0.18)";
  }

  if (value.includes("ULTRA") || value === "UR") {
    return "rgba(214,124,255,0.18)";
  }

  if (value.includes("SUPER") || value === "SR") {
    return "rgba(255,203,122,0.18)";
  }

  return "rgba(160,220,255,0.14)";
}

type ThreeCardInspectorStageProps = {
  imageUrl: string | null;
  name: string;
  rarity?: string | null;
  className?: string;
};

export function ThreeCardInspectorStage({
  imageUrl,
  name,
  rarity,
  className,
}: ThreeCardInspectorStageProps) {
  const [showBack, setShowBack] = useState(false);
  const foilActive = isFoilRarity(rarity);
  const foilTone = useMemo(() => getFoilTone(rarity), [rarity]);

  const fallback = (
    <div className="flex h-full items-center justify-center px-4">
      <div className="relative mx-auto aspect-[59/86] w-full max-w-[240px] overflow-hidden rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="240px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[#f0dfcc]">
            {name}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ThreeStageShell
      className={className}
      fallback={fallback}
      accentColor={foilActive ? "#d79cf5" : "#d7a45b"}
      floorColor="#141c25"
      cameraPosition={[0, 0.65, 5.1]}
      groupPosition={[0, 0.04, 0]}
    >
      <Float speed={1} rotationIntensity={0.08} floatIntensity={0.18}>
        <Html transform distanceFactor={1.18} style={{ pointerEvents: "auto" }}>
          <button
            type="button"
            onClick={() => setShowBack((current) => !current)}
            className="group relative h-[408px] w-[280px] cursor-pointer rounded-[26px] bg-transparent text-left [perspective:1400px]"
            aria-label={`${name} drehen`}
          >
            <span
              className={classes(
                "relative block h-full w-full transition-transform duration-700 [transform-style:preserve-3d]",
                showBack ? "[transform:rotateY(180deg)]" : "",
              )}
            >
              <span className="absolute inset-0 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(16,20,26,0.96),rgba(10,13,18,0.98))] shadow-[0_26px_42px_rgba(0,0,0,0.34)] [backface-visibility:hidden]">
                <span className="absolute inset-[8px] overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={name}
                      fill
                      sizes="280px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center px-5 text-center text-sm font-semibold text-[#f0dfcc]">
                      {name}
                    </span>
                  )}
                  {foilActive ? (
                    <span
                      className="three-foil-overlay"
                      style={{
                        background: `linear-gradient(120deg, transparent 16%, ${foilTone} 34%, rgba(255,255,255,0.14) 48%, ${foilTone} 62%, transparent 82%)`,
                      }}
                    />
                  ) : null}
                </span>
              </span>

              <span className="absolute inset-0 overflow-hidden rounded-[24px] border border-[rgba(122,89,46,0.42)] bg-[linear-gradient(180deg,rgba(137,92,42,0.92),rgba(65,39,17,0.96))] shadow-[0_26px_42px_rgba(0,0,0,0.34)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="absolute inset-[8px] overflow-hidden rounded-[18px] border border-[rgba(255,236,201,0.1)]">
                  <Image
                    src="/app-assets/yugioh-card-back-en.png"
                    alt="Yu-Gi-Oh! Kartenrückseite"
                    fill
                    sizes="280px"
                    className="object-cover"
                    unoptimized
                  />
                </span>
              </span>
            </span>
          </button>
        </Html>
      </Float>
    </ThreeStageShell>
  );
}
