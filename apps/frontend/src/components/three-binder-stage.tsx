"use client";

import Image from "next/image";
import { Float, Html, RoundedBox } from "@react-three/drei";
import { ThreeStageShell } from "@/components/three-stage-shell";

type ThreeBinderStageProps = {
  title: string;
  previewImages: string[];
  className?: string;
};

export function ThreeBinderStage({
  title,
  previewImages,
  className,
}: ThreeBinderStageProps) {
  const fallback = (
    <div className="flex h-full items-center justify-center px-5">
      <div className="relative mx-auto h-[430px] w-[324px] rounded-[28px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(180deg,rgba(20,24,32,0.96),rgba(10,12,16,0.98))] p-5 shadow-[0_30px_56px_rgba(0,0,0,0.42)]">
        <div className="grid h-full grid-rows-[auto_1fr] gap-4">
          <div>
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#cb5c44]">
              Binder
            </p>
            <p className="mt-2 font-display inscription-text-soft text-[1.6rem]">
              {title}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {previewImages.slice(0, 4).map((imageUrl, index) => (
              <div
                key={`${imageUrl}-${index}`}
                className="relative overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]"
              >
                <div className="relative aspect-[59/86]">
                  <Image
                    src={imageUrl}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ThreeStageShell
      className={className}
      fallback={fallback}
      accentColor="#b78c62"
      floorColor="#171c25"
      cameraPosition={[0, 0.72, 5.55]}
      groupPosition={[0, -0.04, 0]}
    >
      <Float speed={1.04} rotationIntensity={0.07} floatIntensity={0.16}>
        <group rotation={[0.1, -0.42, 0.06]}>
          <RoundedBox args={[2.18, 2.92, 0.22]} radius={0.08} smoothness={4}>
            <meshStandardMaterial color="#25201f" roughness={0.72} metalness={0.12} />
          </RoundedBox>

          <RoundedBox
            args={[2.02, 2.74, 0.08]}
            radius={0.06}
            smoothness={4}
            position={[0.12, 0, 0.17]}
          >
            <meshStandardMaterial color="#372d2b" roughness={0.58} metalness={0.14} />
          </RoundedBox>

          {[-0.6, 0, 0.6].map((offset) => (
            <mesh key={offset} position={[-0.94, offset, 0.08]} rotation={[0, Math.PI / 2, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.14, 24]} />
              <meshStandardMaterial color="#b9a17d" roughness={0.22} metalness={0.88} />
            </mesh>
          ))}

          <Html transform position={[0.18, 0, 0.23]} distanceFactor={1.12}>
            <div className="pointer-events-none w-[190px] rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(10,13,18,0.82),rgba(7,9,13,0.94))] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.3)]">
              <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[#cb5c44]">
                Binder
              </p>
              <p className="mt-2 font-display inscription-text-soft text-[1.25rem] leading-none">
                {title}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {previewImages.slice(0, 4).map((imageUrl, index) => (
                  <div
                    key={`${imageUrl}-${index}`}
                    className="relative overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]"
                  >
                    <div className="relative aspect-[59/86]">
                      <Image
                        src={imageUrl}
                        alt=""
                        fill
                        sizes="90px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Html>
        </group>
      </Float>
    </ThreeStageShell>
  );
}
