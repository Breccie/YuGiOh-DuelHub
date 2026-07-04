"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Sparkles } from "@react-three/drei";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useDesktopPreferences } from "@/hooks/use-desktop-preferences";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

type ThreeStageShellProps = {
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
  accentColor?: string;
  floorColor?: string;
  cameraPosition?: [number, number, number];
  groupPosition?: [number, number, number];
  sparkles?: boolean;
};

export function ThreeStageShell({
  children,
  className,
  fallback,
  accentColor = "#d45f43",
  floorColor = "#17202b",
  cameraPosition = [0, 0.75, 5.15],
  groupPosition = [0, 0.05, 0],
  sparkles = true,
}: ThreeStageShellProps) {
  const observerSupported = typeof IntersectionObserver !== "undefined";
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [isVisible, setIsVisible] = useState(() => !observerSupported);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const { graphicsMode, reducedMotion } = useDesktopPreferences();
  const lowGraphicsMode = graphicsMode === "LOW";
  const shouldAnimateEffects = !reducedMotion;
  const shouldRenderCanvas =
    hydrated && !lowGraphicsMode && (observerSupported ? isVisible : true);

  useEffect(() => {
    if (!hydrated || lowGraphicsMode || !observerSupported) {
      return;
    }

    const node = frameRef.current;

    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry?.isIntersecting ?? false);
      },
      {
        rootMargin: "180px 0px",
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hydrated, lowGraphicsMode, observerSupported]);

  if (!shouldRenderCanvas) {
    return (
      <div
        ref={frameRef}
        className={classes(
          "relative overflow-hidden rounded-[34px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(10,13,18,0.82),rgba(7,9,13,0.96))] shadow-[0_24px_54px_rgba(0,0,0,0.34)]",
          className,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,95,67,0.08),transparent_42%)]" />
        <div className="relative z-10 h-full w-full">{fallback}</div>
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className={classes(
        "relative overflow-hidden rounded-[34px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(10,13,18,0.88),rgba(7,9,13,0.98))] shadow-[0_24px_54px_rgba(0,0,0,0.34)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,95,67,0.08),transparent_42%)]" />
      <Canvas
        shadows
        dpr={graphicsMode === "AUTO" ? [1, 1.5] : [1, 1.25]}
        camera={{ position: cameraPosition, fov: 31 }}
        gl={{
          antialias: graphicsMode === "AUTO",
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#06080c"]} />
        <fog attach="fog" args={["#06080c", 5.8, 12.8]} />

        <ambientLight intensity={0.92} color="#f2e1ca" />
        <directionalLight position={[2.6, 4.8, 4.4]} intensity={2.1} color={accentColor} />
        <directionalLight position={[-3.2, 2.2, -2]} intensity={0.6} color="#7c9fd2" />
        <pointLight position={[0.3, 1.4, 2.8]} intensity={18} distance={7.5} color="#fff0d8" />

        {sparkles && shouldAnimateEffects ? (
          <Sparkles
            count={graphicsMode === "AUTO" ? 24 : 12}
            size={graphicsMode === "AUTO" ? 2.6 : 2.1}
            speed={0.18}
            opacity={0.26}
            scale={[6.4, 4.3, 4.5]}
            color={accentColor}
          />
        ) : null}

        <group position={groupPosition}>{children}</group>

        <ContactShadows
          position={[0, -1.58, 0]}
          opacity={0.58}
          scale={6.8}
          blur={2.4}
          far={4.6}
          color="#10151b"
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]}>
          <circleGeometry args={[3.45, 72]} />
          <meshBasicMaterial color={floorColor} transparent opacity={0.12} />
        </mesh>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(4,6,10,0.32)_58%,rgba(4,6,10,0.62))]" />
    </div>
  );
}
