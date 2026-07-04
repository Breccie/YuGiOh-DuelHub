import Link from "next/link";
import { AssetIcon } from "@/components/asset-icon";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function ConsoleBrand({
  href = "/",
  size = "lg",
  className,
}: {
  href?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const large = size === "lg";

  return (
    <Link href={href} className={classes("block", className)}>
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        <div className="relative">
          <AssetIcon
            name="brand-eye"
            className={classes(
              "text-[#d7b488] drop-shadow-[0_0_14px_rgba(208,79,54,0.28)]",
              large ? "h-[2.35rem] w-[4.4rem]" : "h-[2rem] w-[3.7rem]",
            )}
          />
        </div>

        <div className="font-display leading-[0.84]">
          <p
            className={classes(
              "inscription-text-soft uppercase tracking-[0.028em]",
              large ? "text-[1.95rem]" : "text-[1.6rem]",
            )}
          >
            Duel
          </p>
          <p
            className={classes(
              "inscription-text-soft uppercase tracking-[0.028em]",
              large ? "text-[1.95rem]" : "text-[1.6rem]",
            )}
          >
            Console
          </p>
        </div>
      </div>
    </Link>
  );
}
