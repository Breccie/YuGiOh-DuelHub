"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { collectionSubNavItems } from "@/components/console-nav-items";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function ConsoleCollectionSubNav({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div
      className={classes(
        mobile
          ? "grid grid-cols-2 gap-2 border-y border-[rgba(255,255,255,0.06)] bg-[rgba(3,5,8,0.48)] p-2"
          : "border-b border-[rgba(255,255,255,0.06)] bg-[rgba(3,5,8,0.42)] py-2",
      )}
      aria-label="Sammlung Untermenü"
    >
      {collectionSubNavItems.map((item) => {
        const active =
          item.href === "/collection"
            ? pathname === "/collection"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={classes(
              "relative block rounded-[4px] text-[0.62rem] font-semibold uppercase tracking-[0.14em] transition",
              mobile ? "px-3 py-2 text-center" : "mx-3 px-4 py-2 pl-10",
              active
                ? "bg-[rgba(207,91,66,0.12)] text-[#f3d7c1]"
                : "text-[#8f806f] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#d8c4ae]",
            )}
          >
            {!mobile ? (
              <span
                className={classes(
                  "absolute left-4 top-1/2 h-px w-3 -translate-y-1/2",
                  active ? "bg-[#cf5b42]" : "bg-[rgba(255,255,255,0.18)]",
                )}
              />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
