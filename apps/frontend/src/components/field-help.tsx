"use client";

import { IconHelpCircle } from "@tabler/icons-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_GAP = 8;
const VIEWPORT_GUTTER = 16;

export function FieldHelp({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const helpId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const tooltipWidth = Math.min(288, window.innerWidth - VIEWPORT_GUTTER * 2);
    const tooltipHeight = tooltipRef.current?.getBoundingClientRect().height ?? 96;
    const centeredLeft = buttonRect.left + buttonRect.width / 2;
    const left = Math.min(
      window.innerWidth - VIEWPORT_GUTTER - tooltipWidth / 2,
      Math.max(VIEWPORT_GUTTER + tooltipWidth / 2, centeredLeft),
    );
    const below = buttonRect.bottom + TOOLTIP_GAP;
    const above = buttonRect.top - tooltipHeight - TOOLTIP_GAP;
    const top = below + tooltipHeight <= window.innerHeight - VIEWPORT_GUTTER
      ? below
      : Math.max(VIEWPORT_GUTTER, above);

    setPosition({ left, top, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function closeOnPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !tooltipRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="field-help relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (document.activeElement !== buttonRef.current) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label} erklären`}
        aria-expanded={open}
        aria-describedby={open ? helpId : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full text-[#8fa5ad] transition hover:text-[#d7eeee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a3a9]"
      >
        <IconHelpCircle aria-hidden="true" size={17} stroke={1.8} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <span
          ref={tooltipRef}
          id={helpId}
          role="tooltip"
          className="fixed z-[200] w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[8px] border border-[rgba(126,176,181,0.24)] bg-[#0b1117] px-3 py-2.5 text-left text-xs font-normal leading-5 tracking-normal text-[#c8d4d8] shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
          style={{ left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => {
            if (document.activeElement !== buttonRef.current) setOpen(false);
          }}
        >
          {children}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
