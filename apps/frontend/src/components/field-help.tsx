"use client";

import { IconHelpCircle } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";

export function FieldHelp({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const helpId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} erklären`}
        aria-expanded={open}
        aria-describedby={open ? helpId : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        className="grid h-5 w-5 place-items-center rounded-full text-[#8fa5ad] transition hover:text-[#d7eeee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a3a9]"
      >
        <IconHelpCircle aria-hidden="true" size={17} stroke={1.8} />
      </button>
      {open ? (
        <span
          id={helpId}
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+0.45rem)] z-[90] w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[8px] border border-[rgba(126,176,181,0.24)] bg-[#0b1117] px-3 py-2.5 text-left text-xs font-normal leading-5 tracking-normal text-[#c8d4d8] shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
