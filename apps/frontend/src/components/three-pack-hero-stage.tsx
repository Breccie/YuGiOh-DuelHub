"use client";

import { Float, Html } from "@react-three/drei";
import { InteractiveBoosterPack } from "@/components/interactive-booster-pack";
import { ThreeStageShell } from "@/components/three-stage-shell";

type ThreePackHeroStageProps = {
  imageSrc: string | null;
  label: string;
  code: string;
  className?: string;
};

export function ThreePackHeroStage({
  imageSrc,
  label,
  code,
  className,
}: ThreePackHeroStageProps) {
  const fallback = (
    <div className="flex h-full items-center justify-center px-4">
      <InteractiveBoosterPack imageSrc={imageSrc} label={label} code={code} />
    </div>
  );

  return (
    <ThreeStageShell
      className={className}
      fallback={fallback}
      accentColor="#d45f43"
      floorColor="#18212d"
      cameraPosition={[0, 0.72, 5.2]}
      groupPosition={[0, -0.15, 0]}
    >
      <Float speed={1.35} rotationIntensity={0.08} floatIntensity={0.18}>
        <Html transform distanceFactor={1.46} style={{ pointerEvents: "auto" }}>
          <div className="w-[340px]">
            <InteractiveBoosterPack imageSrc={imageSrc} label={label} code={code} />
          </div>
        </Html>
      </Float>
    </ThreeStageShell>
  );
}
