"use client";

import { Float, Html } from "@react-three/drei";
import {
  PackOpeningActor,
  type PackOpeningPhase,
  type PackOpeningVariantId,
} from "@/components/pack-opening-actor";
import { ThreeStageShell } from "@/components/three-stage-shell";

type ThreePackOpeningStageProps = {
  imageUrl: string | null;
  label: string;
  code: string;
  phase: PackOpeningPhase;
  variantId: PackOpeningVariantId;
  className?: string;
};

export function ThreePackOpeningStage({
  imageUrl,
  label,
  code,
  phase,
  variantId,
  className,
}: ThreePackOpeningStageProps) {
  const fallback = (
    <div className="flex h-full items-center justify-center px-4">
      <PackOpeningActor
        imageUrl={imageUrl}
        label={label}
        code={code}
        phase={phase}
        variantId={variantId}
      />
    </div>
  );

  return (
    <ThreeStageShell
      className={className}
      fallback={fallback}
      accentColor={phase === "idle" ? "#b98a5e" : "#e26e51"}
      floorColor="#181f28"
      cameraPosition={[0, 0.86, 5.4]}
      groupPosition={[0, -0.18, 0]}
      sparkles
    >
      <Float
        speed={phase === "idle" ? 1.05 : 1.6}
        rotationIntensity={phase === "idle" ? 0.04 : 0.08}
        floatIntensity={phase === "idle" ? 0.1 : 0.16}
      >
        <Html transform distanceFactor={1.44} style={{ pointerEvents: "auto" }}>
          <div className="w-[340px]">
            <PackOpeningActor
              imageUrl={imageUrl}
              label={label}
              code={code}
              phase={phase}
              variantId={variantId}
            />
          </div>
        </Html>
      </Float>
    </ThreeStageShell>
  );
}
