"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
import {
  consoleNavItems,
  isConsoleNavActive,
} from "@/components/console-nav-items";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden lg:block lg:pt-2">
        {consoleNavItems.map((item) => {
          const isActive = isConsoleNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={classes(
                "group relative flex items-center gap-4 border-y border-transparent px-6 py-8 text-sm uppercase tracking-[0.22em] transition",
                isActive
                  ? "border-y-[rgba(196,69,48,0.14)] bg-[linear-gradient(90deg,rgba(124,32,22,0.34),rgba(124,32,22,0.12),transparent)] text-[#f4ddc2]"
                  : "text-[#baa58d] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#f1deca]",
              )}
            >
              {isActive ? (
                <span className="absolute right-0 top-1/2 h-10 w-px -translate-y-1/2 bg-[#d04f36] shadow-[0_0_22px_rgba(208,79,54,0.95)]" />
              ) : null}
              <AssetIcon name={item.iconName} className="h-5 w-5 text-current" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav
        className="grid border-t border-[rgba(255,255,255,0.08)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${consoleNavItems.length}, minmax(0, 1fr))` }}
      >
        {consoleNavItems.map((item) => {
          const isActive = isConsoleNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={classes(
                "flex flex-col items-center gap-2 px-1 py-3 text-[0.58rem] uppercase tracking-[0.16em] transition",
                isActive
                  ? "bg-[rgba(207,91,66,0.14)] text-[#f4d9c4]"
                  : "text-[#aa9983] hover:bg-[rgba(255,255,255,0.04)]",
              )}
            >
              <AssetIcon name={item.iconName} className="h-5 w-5 text-current" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
