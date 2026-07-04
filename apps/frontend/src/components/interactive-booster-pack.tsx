"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type InteractiveBoosterPackProps = {
  imageSrc: string | null;
  label: string;
  code: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function InteractiveBoosterPack({
  imageSrc,
  label,
  code,
}: InteractiveBoosterPackProps) {
  const frameRef = useRef<HTMLButtonElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [shine, setShine] = useState({ x: 50, y: 22, opacity: 0.18 });

  const maskedOverlayStyle: CSSProperties | undefined =
    imageSrc && imageSrc.startsWith("/")
      ? {
          maskImage: `url(${imageSrc})`,
          WebkitMaskImage: `url(${imageSrc})`,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskSize: "contain",
          WebkitMaskSize: "contain",
        }
      : undefined;

  useEffect(() => {
    function handleWindowPointerUp() {
      setDragging(false);
    }

    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
  }, []);

  function updateFromPointer(clientX: number, clientY: number) {
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
      x: clamp(-relY * 24, -12, 12),
      y: clamp(relX * 26 + (inspected ? 8 : 0), -16, 16),
    });
    setShine({
      x: px * 100,
      y: py * 100,
      opacity: dragging || inspected ? 0.34 : 0.2,
    });
  }

  function resetPose() {
    setRotation({
      x: 0,
      y: inspected ? 8 : 0,
    });
    setShine({
      x: 52,
      y: 20,
      opacity: inspected ? 0.24 : 0.16,
    });
  }

  function toggleInspect() {
    setInspected((current) => {
      const next = !current;

      setRotation({
        x: 0,
        y: next ? 8 : 0,
      });
      setShine({
        x: 52,
        y: 20,
        opacity: next ? 0.24 : 0.16,
      });

      return next;
    });
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[340px] justify-center">
      <div className="pointer-events-none absolute inset-x-[8%] bottom-[34px] h-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(212,225,241,0.28),transparent_72%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-x-[22%] bottom-[-6px] h-[146px] opacity-[0.44] blur-[0.7px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.64),transparent_86%)]">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt=""
            width={351}
            height={550}
            sizes="260px"
            className="mx-auto h-auto w-[258px] scale-y-[-1] opacity-[0.82]"
            unoptimized
          />
        ) : null}
      </div>

      <button
        ref={frameRef}
        type="button"
        aria-label={`${label} ansehen`}
        onClick={toggleInspect}
        onPointerDown={(event) => {
          setDragging(true);
          frameRef.current?.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!dragging && !inspected) {
            return;
          }
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerLeave={() => {
          if (!dragging) {
            resetPose();
          }
        }}
        onPointerUp={() => {
          setDragging(false);
          resetPose();
        }}
        className="group relative block h-[456px] w-full rounded-[30px] [perspective:1400px]"
      >
        <div
          className="relative flex h-full w-full items-end justify-center pb-8 transition-transform duration-200 ease-out [transform-style:preserve-3d]"
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          }}
        >
          <div className="pointer-events-none absolute bottom-[88px] h-28 w-[228px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(198,213,236,0.18),transparent_72%)] blur-3xl" />

          <div className="relative w-[270px] [transform-style:preserve-3d]">
            <div className="relative z-10">
              {imageSrc ? (
                <>
                  <Image
                    src={imageSrc}
                    alt={label}
                    width={351}
                    height={550}
                    sizes="270px"
                    className="h-auto w-full drop-shadow-[0_26px_34px_rgba(0,0,0,0.44)] brightness-[1.02] saturate-[1.02]"
                    unoptimized
                  />
                  <div
                    className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-200"
                    style={{
                      ...maskedOverlayStyle,
                      opacity: shine.opacity,
                      background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(255,255,255,0.34), transparent 22%), linear-gradient(120deg, transparent 32%, rgba(255,255,255,0.06) 43%, rgba(255,255,255,0.14) 48%, rgba(255,255,255,0.05) 53%, transparent 68%)`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      ...maskedOverlayStyle,
                      background:
                        "linear-gradient(180deg,rgba(255,255,255,0.04),transparent 14%,transparent 82%,rgba(0,0,0,0.08))",
                    }}
                  />
                </>
              ) : (
                <div className="flex h-[420px] items-center justify-center text-center text-2xl font-semibold text-[#f4eadc]">
                  {code}
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
