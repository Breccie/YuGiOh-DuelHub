"use client";

import Image from "next/image";
import { Float, Html, RoundedBox } from "@react-three/drei";
import { ThreeStageShell } from "@/components/three-stage-shell";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

type ThreeDeckboxStageProps = {
  title: string;
  previewImageUrl: string | null;
  legal: boolean;
  className?: string;
};

export function ThreeDeckboxStage({
  title,
  previewImageUrl,
  legal,
  className,
}: ThreeDeckboxStageProps) {
  const fallback = (
    <div className="flex h-full items-center justify-center px-5">
      <div className="relative mx-auto h-[426px] w-[292px]">
        <div className="absolute inset-x-6 bottom-0 h-12 rounded-full bg-[radial-gradient(circle,rgba(209,168,107,0.38),rgba(209,168,107,0))] blur-2xl" />
        <div className="absolute left-1/2 top-0 flex h-[356px] w-[248px] -translate-x-1/2 flex-col justify-between overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(28,34,45,0.96),rgba(12,15,20,0.98))] p-4 shadow-[0_30px_56px_rgba(0,0,0,0.42)]">
          <div className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#d6b48c]">
            {legal ? "Legal" : "Prüfen"}
          </div>
          <div className="relative mx-auto aspect-[59/86] w-[152px] overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
            {previewImageUrl ? (
              <Image
                src={previewImageUrl}
                alt={title}
                fill
                sizes="152px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[#f0dfcc]">
                {title}
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="font-display inscription-text-soft text-[1.35rem] leading-none">
              {title}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const shellColor = legal ? "#253648" : "#452a27";
  const faceColor = legal ? "#314b65" : "#60312a";

  return (
    <ThreeStageShell
      className={className}
      fallback={fallback}
      accentColor={legal ? "#5da0be" : "#d45f43"}
      floorColor="#141b24"
      cameraPosition={[0, 0.62, 5.4]}
      groupPosition={[0, -0.08, 0]}
    >
      <Float speed={1.1} rotationIntensity={0.1} floatIntensity={0.18}>
        <group rotation={[0.08, -0.4, 0.02]}>
          <RoundedBox args={[1.92, 2.7, 0.84]} radius={0.1} smoothness={4}>
            <meshStandardMaterial color={shellColor} roughness={0.52} metalness={0.24} />
          </RoundedBox>

          <RoundedBox
            args={[1.72, 2.42, 0.08]}
            radius={0.08}
            smoothness={4}
            position={[0, 0, 0.4]}
          >
            <meshStandardMaterial color={faceColor} roughness={0.42} metalness={0.18} />
          </RoundedBox>

          <Html transform position={[0, 0, 0.46]} distanceFactor={1.1}>
            <div className="pointer-events-none w-[148px] rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(10,13,18,0.76),rgba(7,9,13,0.94))] p-3 shadow-[0_18px_36px_rgba(0,0,0,0.3)]">
              <div
                className={classes(
                  "mb-3 inline-flex rounded-full border px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.18em]",
                  legal
                    ? "border-[rgba(88,163,169,0.22)] bg-[rgba(58,118,124,0.18)] text-[#c5eef0]"
                    : "border-[rgba(207,91,66,0.24)] bg-[rgba(141,61,48,0.18)] text-[#f2c1b7]",
                )}
              >
                {legal ? "Legal" : "Deck"}
              </div>
              <div className="relative aspect-[59/86] overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                {previewImageUrl ? (
                  <Image
                    src={previewImageUrl}
                    alt={title}
                    fill
                    sizes="148px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[#f0dfcc]">
                    {title}
                  </div>
                )}
              </div>
              <p className="mt-3 line-clamp-2 text-center text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#f0dfcc]">
                {title}
              </p>
            </div>
          </Html>
        </group>
      </Float>
    </ThreeStageShell>
  );
}
