"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useDesktopPreferences } from "@/hooks/use-desktop-preferences";

type BinderHero3DProps = {
  accentColor: string;
  className?: string;
  imageUrl: string;
  title: string;
};

function classNames(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const defaultRotation = { x: 1.8, y: -7.5 };
const defaultShine = { x: 44, y: 22, opacity: 0.18 };

export function BinderHero3D({
  accentColor,
  className,
  imageUrl,
  title,
}: BinderHero3DProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const nextPoseRef = useRef({
    rotation: defaultRotation,
    shine: defaultShine,
  });
  const [rotation, setRotation] = useState(defaultRotation);
  const [shine, setShine] = useState(defaultShine);
  const { graphicsMode, reducedMotion } = useDesktopPreferences();
  const allowInteraction = graphicsMode !== "LOW" && !reducedMotion;
  const activeRotation = allowInteraction ? rotation : defaultRotation;
  const activeShine = allowInteraction ? shine : defaultShine;

  const maskedOverlayStyle: CSSProperties = {
    maskImage: `url(${imageUrl})`,
    WebkitMaskImage: `url(${imageUrl})`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "contain",
    WebkitMaskSize: "contain",
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  function schedulePose(nextRotation: typeof defaultRotation, nextShine: typeof defaultShine) {
    nextPoseRef.current = {
      rotation: nextRotation,
      shine: nextShine,
    };

    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setRotation(nextPoseRef.current.rotation);
      setShine(nextPoseRef.current.shine);
    });
  }

  function updateFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowInteraction) {
      return;
    }

    const node = frameRef.current;

    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const relX = px - 0.5;
    const relY = py - 0.5;

    schedulePose(
      {
        x: clamp(-relY * 11 + 1.8, -6, 8),
        y: clamp(relX * 16 - 7.5, -13, 7),
      },
      {
        x: px * 100,
        y: py * 100,
        opacity: 0.26,
      },
    );
  }

  function resetPose() {
    if (!allowInteraction) {
      return;
    }

    schedulePose(defaultRotation, defaultShine);
  }

  return (
    <div
      className={classNames(
        "relative mx-auto w-full max-w-[250px] sm:max-w-[285px] xl:max-w-[305px]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-[18%] bottom-2 h-10 rounded-full bg-[radial-gradient(circle,rgba(212,115,74,0.24),rgba(212,115,74,0.08)_46%,transparent_74%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-x-[26%] bottom-[-12px] z-0 h-[138px] overflow-hidden opacity-[0.26] blur-[1.6px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.56),transparent_84%)]">
        <Image
          src={imageUrl}
          alt=""
          width={920}
          height={1360}
          aria-hidden
          draggable={false}
          className="pointer-events-none select-none mx-auto h-auto w-[88%] scale-y-[-1] [-webkit-user-drag:none]"
          unoptimized
        />
      </div>

      <div
        ref={frameRef}
        onPointerEnter={updateFromPointer}
        onPointerMove={updateFromPointer}
        onPointerLeave={resetPose}
        className="relative z-10 h-[376px] w-full [perspective:1500px]"
      >
        <div
          className={classNames(
            "relative flex h-full w-full items-center justify-center [transform-style:preserve-3d]",
            allowInteraction && "transition-transform duration-200 ease-out",
          )}
          style={{
            transform: `rotateX(${activeRotation.x}deg) rotateY(${activeRotation.y}deg)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-[16%] top-[22%] h-[40%] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, ${accentColor}22 0%, transparent 68%)`,
            }}
          />

          <div className="relative w-full max-w-[290px] [transform-style:preserve-3d]">
            <Image
              src={imageUrl}
              alt={title}
              width={920}
              height={1360}
              priority
              draggable={false}
              unoptimized
              className="pointer-events-none select-none h-auto w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.42)] [-webkit-user-drag:none]"
            />
            <div
              className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-200"
              style={{
                ...maskedOverlayStyle,
                opacity: activeShine.opacity,
                background: `radial-gradient(circle at ${activeShine.x}% ${activeShine.y}%, rgba(255,255,255,0.34), transparent 24%), linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.05) 41%, rgba(255,255,255,0.15) 48%, rgba(255,255,255,0.06) 54%, transparent 69%)`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                ...maskedOverlayStyle,
                background:
                  "linear-gradient(180deg,rgba(255,255,255,0.05),transparent 16%,transparent 82%,rgba(0,0,0,0.08))",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
