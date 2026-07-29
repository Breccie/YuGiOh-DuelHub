"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryMobileItems = consoleNavItems.slice(0, 4);
  const moreItems = [
    ...consoleNavItems.slice(4),
    { href: "/friends", label: "Freunde", iconName: "users" as const },
    { href: "/rules", label: "Regeln", iconName: "nav-rules" as const },
    { href: "/settings", label: "Einstellungen", iconName: "settings" as const },
  ];
  const moreIsActive = moreItems.some((item) =>
    isConsoleNavActive(pathname, item.href),
  );

  return (
    <>
      <nav className="hidden lg:block lg:flex-1 lg:pt-2" aria-label="Hauptnavigation">
        {consoleNavItems.map((item) => {
          const isActive = isConsoleNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={classes(
                "group relative mx-2.5 flex min-h-[48px] items-center gap-3.5 rounded-[8px] border border-transparent px-3.5 text-[14px] font-semibold transition",
                isActive
                  ? "border-[rgba(196,69,48,0.2)] bg-[linear-gradient(90deg,rgba(124,32,22,0.36),rgba(124,32,22,0.1))] text-[#f4ddc2]"
                  : "text-[#aa9983] hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.035)] hover:text-[#f1deca]",
              )}
            >
              {isActive ? (
                <span className="absolute -right-[9px] top-1/2 h-7 w-[2px] -translate-y-1/2 bg-[#d04f36] shadow-[0_0_18px_rgba(208,79,54,0.8)]" />
              ) : null}
              <AssetIcon name={item.iconName} className="h-5 w-5 text-current" />
              <span data-nav-label>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[rgba(255,255,255,0.1)] bg-[rgba(5,7,10,0.97)] px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile Hauptnavigation"
      >
        {primaryMobileItems.map((item) => {
          const isActive = isConsoleNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={classes(
                "flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold transition",
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
        <button
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          className={classes(
            "flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold transition",
            moreOpen || moreIsActive
              ? "bg-[rgba(207,91,66,0.14)] text-[#f4d9c4]"
              : "text-[#aa9983]",
          )}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
        >
          <AssetIcon name="dots" className="h-5 w-5 text-current" />
          <span>Mehr</span>
        </button>
      </nav>

      {moreOpen ? (
        <div
          id="mobile-more-menu"
          className="fixed inset-x-3 bottom-[76px] z-50 rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[rgba(8,11,15,0.98)] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:hidden"
        >
          <div className="grid grid-cols-2 gap-2">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={classes(
                  "flex items-center gap-3 rounded-[7px] border px-3 py-3.5 text-sm font-semibold",
                  isConsoleNavActive(pathname, item.href)
                    ? "border-[rgba(207,91,66,0.3)] bg-[rgba(151,29,20,0.2)] text-[#ffe3ca]"
                    : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.025)] text-[#c7b49d]",
                )}
              >
                <AssetIcon name={item.iconName} className="h-4 w-4 text-current" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
