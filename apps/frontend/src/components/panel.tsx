import type { ReactNode } from "react";

type Tone = "gold" | "teal" | "ember" | "slate";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

const toneClasses: Record<Tone, string> = {
  gold:
    "border-[rgba(208,170,110,0.22)] bg-[rgba(208,170,110,0.08)] text-[#f0d9b0]",
  teal:
    "border-[rgba(88,163,169,0.22)] bg-[rgba(58,118,124,0.12)] text-[#b8e3e4]",
  ember:
    "border-[rgba(204,97,78,0.24)] bg-[rgba(141,61,48,0.14)] text-[#f2c1b7]",
  slate:
    "border-[rgba(126,143,168,0.18)] bg-[rgba(255,255,255,0.04)] text-[#d6dfec]",
};

export function Panel({
  title,
  kicker,
  className,
  children,
}: {
  title?: string;
  kicker?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={classes(
        "panel-surface rounded-[28px] p-5 sm:p-6 lg:p-7",
        className,
      )}
    >
      {(kicker || title) && (
        <div className="mb-6 flex flex-col gap-2">
          {kicker ? <p className="ui-kicker">{kicker}</p> : null}
          {title ? (
            <h2 className="font-display inscription-text-soft text-2xl leading-tight sm:text-[2rem]">
              {title}
            </h2>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatPill({
  label,
  value,
  tone = "gold",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div
      className={classes(
        "min-w-[10.5rem] rounded-[16px] border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
        toneClasses[tone],
      )}
    >
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-current/70">
        {label}
      </div>
      <div className="mt-1.5 text-base font-semibold text-[#f0dfcc]">{value}</div>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={classes(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
