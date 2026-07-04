import type { AssetIconName } from "@/components/asset-icon";

export const consoleNavItems = [
  { href: "/", label: "Start", iconName: "nav-start" },
  { href: "/packs", label: "Packs", iconName: "nav-packs" },
  { href: "/collection", label: "Sammlung", iconName: "nav-collection" },
  { href: "/decks", label: "Decks", iconName: "nav-decks" },
  { href: "/duels", label: "Duelle", iconName: "sword" },
  { href: "/tournaments", label: "Turniere", iconName: "shield" },
  { href: "/trade", label: "Tausch", iconName: "nav-trade" },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  iconName: AssetIconName;
}>;

export function isConsoleNavActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
