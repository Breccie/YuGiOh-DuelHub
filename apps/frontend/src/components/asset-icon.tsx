import type { CSSProperties } from "react";

export type AssetIconName =
  | "alert"
  | "bell"
  | "book"
  | "brand-eye"
  | "cart"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "copy"
  | "dots"
  | "edit"
  | "eye"
  | "filter"
  | "grid"
  | "hourglass"
  | "list"
  | "logout"
  | "mail"
  | "nav-collection"
  | "nav-decks"
  | "nav-packs"
  | "nav-rules"
  | "nav-start"
  | "nav-trade"
  | "package"
  | "play"
  | "plus"
  | "profile-signet"
  | "rotate"
  | "scale"
  | "search"
  | "settings"
  | "shield"
  | "sword"
  | "users"
  | "divider-mark"
  | "window-close"
  | "window-max"
  | "window-min";

export function AssetIcon({
  name,
  className,
  title,
  style,
}: {
  name: AssetIconName;
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const maskUrl = `url(/app-assets/icons/${name}.png)`;

  return (
    <span
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : "presentation"}
      className={className}
      style={{
        backgroundColor: "currentColor",
        maskImage: maskUrl,
        WebkitMaskImage: maskUrl,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        display: "inline-block",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
