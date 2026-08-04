import Link from "next/link";

const entries = [
  { href: "/packs", label: "Booster", key: "packs" },
  { href: "/packs/promos", label: "Promo-Karten", key: "promos" },
  { href: "/packs/custom", label: "Custom Packs", key: "custom" },
] as const;

export function PackSectionNav({ active }: { active: "packs" | "promos" | "custom" }) {
  return (
    <nav aria-label="Packbereiche" className="grid w-full max-w-[520px] grid-cols-3 rounded-xl border border-white/10 bg-white/[0.035] p-1 text-[0.78rem] font-semibold">
      {entries.map((entry) => (
        <Link
          key={entry.key}
          href={entry.href}
          aria-current={active === entry.key ? "page" : undefined}
          className={active === entry.key
            ? "rounded-lg bg-[rgba(207,91,66,0.2)] px-3 py-2.5 text-center text-[#fff0df] shadow-sm"
            : "rounded-lg px-3 py-2.5 text-center text-[#bfae98] transition hover:bg-white/[0.05] hover:text-white"}
        >
          {entry.label}
        </Link>
      ))}
    </nav>
  );
}
