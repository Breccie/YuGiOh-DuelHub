"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel } from "@/components/panel";

type HomeConsoleProps = {
  viewer: {
    displayName: string;
  };
  collectionValue: string;
  activeRunName: string;
  latestBanlistName: string;
  activeEra: string;
  heroStats: Array<{
    label: string;
    value: string;
  }>;
  newsItems: Array<{
    id: string;
    kicker: string;
    title: string;
    detail: string;
    meta: string;
  }>;
  duelRequests: Array<{
    id: string;
    name: string;
    rank: string;
    eta: string;
  }>;
  tradeRequests: Array<{
    id: string;
    name: string;
    detail: string;
    eta: string;
  }>;
  progressCards: Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
    action: string;
  }>;
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function HeroStatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(184,142,89,0.16)] bg-[linear-gradient(180deg,rgba(18,22,28,0.82),rgba(10,13,18,0.94))] px-5 py-4 shadow-[0_20px_36px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#bda88b]">{label}</p>
          <p className="mt-3 font-display text-[2.1rem] leading-none text-[#f0dcc0]">{value}</p>
        </div>
        <div className="rounded-[16px] border border-[rgba(184,142,89,0.18)] bg-[rgba(255,255,255,0.03)] p-3 text-[#d8bc91]">
          {icon}
        </div>
      </div>
    </article>
  );
}

function QuickActionCard({
  item,
  href,
  tone,
}: {
  item: HomeConsoleProps["progressCards"][number];
  href: string;
  tone: "gold" | "ember" | "slate";
}) {
  return (
    <Link
      href={href}
      className={classes(
        "group rounded-[22px] border px-5 py-4 transition",
        tone === "gold"
          ? "border-[rgba(208,170,110,0.18)] bg-[linear-gradient(180deg,rgba(48,36,24,0.42),rgba(16,18,24,0.82))] hover:border-[rgba(208,170,110,0.34)]"
          : tone === "ember"
            ? "border-[rgba(207,91,66,0.18)] bg-[linear-gradient(180deg,rgba(74,27,20,0.32),rgba(16,18,24,0.84))] hover:border-[rgba(207,91,66,0.34)]"
            : "border-[rgba(126,143,168,0.16)] bg-[linear-gradient(180deg,rgba(26,31,38,0.76),rgba(12,15,19,0.92))] hover:border-[rgba(126,143,168,0.3)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#bda88b]">{item.label}</p>
          <p className="mt-3 font-display text-[1.9rem] leading-none text-[#f3e0c5]">{item.value}</p>
          <p className="mt-3 max-w-[26ch] text-sm leading-7 text-[#cfbaa0]">{item.detail}</p>
        </div>
        <AssetIcon name="chevron-right" className="mt-1 h-5 w-5 text-[#d8bc91] transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-5 inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#f0dcc0]">
        {item.action}
      </div>
    </Link>
  );
}

function NewsRow({
  item,
  href,
}: {
  item: HomeConsoleProps["newsItems"][number];
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[20px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4 transition hover:border-[rgba(208,170,110,0.28)] hover:bg-[rgba(255,255,255,0.04)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#cb5c44]">{item.kicker}</p>
          <h3 className="mt-3 font-display text-[1.55rem] leading-none text-[#f0dcc0]">{item.title}</h3>
          <p className="mt-3 text-sm leading-7 text-[#cdb79c]">{item.detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#a9967f]">
          <span>{item.meta}</span>
          <AssetIcon name="chevron-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function actionHref(item: HomeConsoleProps["newsItems"][number]) {
  if (item.id.startsWith("promo-")) {
    return "/packs/promos";
  }

  if (item.id.startsWith("match-") || item.id.startsWith("checkpoint-")) {
    return "/tournaments";
  }

  return "/packs";
}

function cardHref(id: string) {
  switch (id) {
    case "collection":
      return "/collection";
    case "promos":
      return "/packs/promos";
    case "tournaments":
      return "/tournaments";
    default:
      return "/packs";
  }
}

export function HomeConsole({
  viewer,
  collectionValue,
  activeRunName,
  latestBanlistName,
  activeEra,
  heroStats,
  newsItems,
  duelRequests,
  tradeRequests,
  progressCards,
}: HomeConsoleProps) {
  const router = useRouter();
  const statIcons = [
    <AssetIcon key="credits" name="cart" className="h-6 w-6 text-current" />,
    <AssetIcon key="packs" name="nav-packs" className="h-6 w-6 text-current" />,
    <AssetIcon key="rewards" name="package" className="h-6 w-6 text-current" />,
    <AssetIcon key="promos" name="bell" className="h-6 w-6 text-current" />,
  ];
  const openSocialItems = [
    ...tradeRequests.map((item) => ({
      id: `trade-${item.id}`,
      label: item.name,
      detail: item.detail,
      meta: item.eta,
      href: `/trade/${item.id}`,
    })),
    ...duelRequests.map((item) => ({
      id: `duel-${item.id}`,
      label: item.name,
      detail: item.rank,
      meta: item.eta,
      href: "/duels",
    })),
  ];

  useEffect(() => {
    for (const path of ["/packs", "/collection", "/decks", "/trade", "/tournaments"]) {
      router.prefetch(path);
    }
  }, [router]);

  return (
    <DuelConsoleScaffold
      activePath="/"
      viewer={{
        displayName: viewer.displayName,
      }}
      metrics={[
        { icon: "shield", label: "Kampagne", value: activeRunName },
        { icon: "book", label: "Sammlung", value: collectionValue },
        { icon: "scale", label: "Banlist", value: latestBanlistName },
        { icon: "hourglass", label: "Ära", value: activeEra },
      ]}
    >
      <section className="grid gap-6 pt-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p className="text-[0.82rem] uppercase tracking-[0.26em] text-[#cb5c44]">Aktive Kampagne</p>
          <h1 className="font-display inscription-text mt-4 text-[3.4rem] leading-[0.94] tracking-[0.02em] sm:text-[4.7rem]">
            Jetzt möglich
          </h1>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {heroStats.map((item, index) => (
              <HeroStatCard
                key={item.label}
                label={item.label}
                value={item.value}
                icon={statIcons[index] ?? statIcons[0]}
              />
            ))}
          </div>
        </div>

        <Panel kicker="Offen" title="Aktionen" className="xl:min-h-[24rem]">
          <div className="space-y-4">
            {newsItems.slice(0, 4).map((item) => (
              <NewsRow key={item.id} item={item} href={actionHref(item)} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel kicker="Status" title="Kampagne">
          <div className="grid gap-4 lg:grid-cols-2">
            {progressCards.map((item, index) => (
              <QuickActionCard
                key={item.id}
                item={item}
                href={cardHref(item.id)}
                tone={index === 0 ? "gold" : index === 1 ? "ember" : "slate"}
              />
            ))}
          </div>
        </Panel>

        <Panel kicker="Weitere" title="Offene Vorgänge">
          <div className="space-y-4">
            {openSocialItems.length > 0 ? (
              openSocialItems.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start justify-between gap-4 rounded-[18px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4 transition hover:border-[rgba(208,170,110,0.28)]"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#f2dfc8]">{item.label}</p>
                    <p className="mt-1 text-sm text-[#bfa98e]">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-[#ab977d]">{item.meta}</span>
                </Link>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-[rgba(184,142,89,0.14)] bg-[rgba(255,255,255,0.018)] px-4 py-6 text-sm text-[#bfa98e]">
                Keine offenen Tausch- oder Terminabstimmungen.
              </div>
            )}
          </div>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
