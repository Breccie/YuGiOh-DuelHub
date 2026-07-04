"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";

type HomeConsoleProps = {
  viewer: {
    displayName: string;
  };
  collectionValue: string;
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

function RequestRow({
  name,
  subtitle,
  eta,
  primary,
  secondary,
  primaryHref,
  secondaryHref,
}: {
  name: string;
  subtitle: string;
  eta: string;
  primary: string;
  secondary?: string;
  primaryHref: string;
  secondaryHref?: string;
}) {
  const primaryClassName =
    "rounded-full border border-[rgba(207,91,66,0.22)] bg-[rgba(207,91,66,0.12)] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#ffe2cb] transition hover:border-[rgba(207,91,66,0.36)]";
  const secondaryClassName =
    "rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#d8c4aa] transition hover:border-[rgba(255,255,255,0.18)]";

  return (
    <div className="rounded-[20px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[rgba(210,168,108,0.24)] bg-[radial-gradient(circle,rgba(91,67,32,0.42),rgba(21,17,12,0.94))] text-sm font-semibold text-[#f3dfbf]">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base font-semibold text-[#f2dfc8]">{name}</p>
            <span className="text-xs uppercase tracking-[0.18em] text-[#ab977d]">{eta}</span>
          </div>
          <p className="mt-1 text-sm text-[#bfa98e]">{subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={primaryHref} className={primaryClassName}>
              {primary}
            </Link>
            {secondary ? (
              <Link href={secondaryHref ?? primaryHref} className={secondaryClassName}>
                {secondary}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsRow({
  item,
}: {
  item: HomeConsoleProps["newsItems"][number];
}) {
  return (
    <article className="rounded-[20px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#cb5c44]">{item.kicker}</p>
          <h3 className="mt-3 font-display text-[1.55rem] leading-none text-[#f0dcc0]">{item.title}</h3>
          <p className="mt-3 text-sm leading-7 text-[#cdb79c]">{item.detail}</p>
        </div>
        <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-[#a9967f]">{item.meta}</span>
      </div>
    </article>
  );
}

export function HomeConsole({
  viewer,
  collectionValue,
  latestBanlistName,
  activeEra,
  heroStats,
  newsItems,
  duelRequests,
  tradeRequests,
  progressCards,
}: HomeConsoleProps) {
  const statIcons = [
    <AssetIcon key="book" name="book" className="h-6 w-6 text-current" />,
    <AssetIcon key="packs" name="nav-packs" className="h-6 w-6 text-current" />,
    <AssetIcon key="duels" name="sword" className="h-6 w-6 text-current" />,
    <AssetIcon key="trade" name="users" className="h-6 w-6 text-current" />,
  ];
  const quickLinks = ["/packs", "/collection", "/decks"];

  return (
    <DuelConsoleScaffold
      activePath="/"
      viewer={{
        displayName: viewer.displayName,
      }}
      metrics={[
        { icon: "book", label: "Sammlung", value: collectionValue },
        { icon: "scale", label: "Banlist", value: latestBanlistName },
        { icon: "hourglass", label: "Aktive Ära", value: activeEra },
      ]}
    >
      <section className="grid gap-6 pt-4 xl:grid-cols-[1.14fr_0.86fr]">
        <div>
          <p className="text-[0.82rem] uppercase tracking-[0.26em] text-[#cb5c44]">Startbereich</p>
          <h1 className="font-display inscription-text mt-4 text-[3.9rem] leading-[0.92] tracking-[0.02em] sm:text-[5.15rem]">
            Duel Console
          </h1>
          <p className="mt-5 max-w-[42rem] text-[1.05rem] leading-8 text-[#dbc9b2]">
            Öffne Booster, verwalte deine Sammlung, baue Decks nach Banlist und halte deine nächste
            Aktion direkt hier im Blick.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/packs"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#fff0e1] shadow-[0_0_30px_rgba(151,29,20,0.24)] transition hover:brightness-110"
            >
              <AssetIcon name="package" className="h-5 w-5 text-current" />
              <span>Booster öffnen</span>
            </Link>
            <Link
              href="/collection"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
            >
              <AssetIcon name="nav-collection" className="h-5 w-5 text-current" />
              <span>Sammlung öffnen</span>
            </Link>
            <Link
              href="/decks"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
            >
              <AssetIcon name="nav-decks" className="h-5 w-5 text-current" />
              <span>Decks prüfen</span>
            </Link>
          </div>

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

        <Panel kicker="Heute" title="Schnellzugriff" className="xl:min-h-[26rem]">
          <div className="grid gap-4">
            {progressCards.slice(0, 3).map((item, index) => (
              <QuickActionCard
                key={item.id}
                item={item}
                href={quickLinks[index] ?? "/packs"}
                tone={index === 0 ? "gold" : index === 1 ? "ember" : "slate"}
              />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <Panel kicker="Live" title="Duelle & Tausch">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-[#cb5c44]">Duellanfragen</h3>
                <StatusPill tone="gold">{duelRequests.length}</StatusPill>
              </div>
              {duelRequests.length > 0 ? (
                duelRequests.slice(0, 3).map((item) => (
                  <RequestRow
                    key={item.id}
                    name={item.name}
                    subtitle={item.rank}
                    eta={item.eta}
                    primary="Zu Duellen"
                    secondary="Planen"
                    primaryHref="/duels"
                    secondaryHref="/duels"
                  />
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-[rgba(184,142,89,0.14)] bg-[rgba(255,255,255,0.018)] px-4 py-6 text-sm text-[#bfa98e]">
                  Keine aktiven Duellanfragen.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-[#cb5c44]">Tauschanfragen</h3>
                <StatusPill tone="slate">{tradeRequests.length}</StatusPill>
              </div>
              {tradeRequests.slice(0, 3).map((item) => (
                <RequestRow
                  key={item.id}
                  name={item.name}
                  subtitle={item.detail}
                  eta={item.eta}
                  primary="Öffnen"
                  primaryHref={`/trade/${item.id}`}
                />
              ))}
            </div>
          </div>
        </Panel>

        <Panel kicker="Feed" title="Neuigkeiten">
          <div className="space-y-4">
            {newsItems.slice(0, 3).map((item) => (
              <NewsRow key={item.id} item={item} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-6">
        <Panel kicker="Fortschritt" title="Nächste Schritte">
          <div className="grid gap-4 xl:grid-cols-4">
            {progressCards.map((card) => (
              <div
                key={card.id}
                className="rounded-[22px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-5 py-4"
              >
                <p className="font-display text-[1.45rem] leading-none text-[#f0dcc0]">{card.label}</p>
                <p className="mt-4 text-[2rem] text-[#f6e5c8]">{card.value}</p>
                <p className="mt-3 text-sm leading-7 text-[#cfbaa0]">{card.detail}</p>
                <div className="mt-5 inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#f0dcc0]">
                  {card.action}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </DuelConsoleScaffold>
  );
}
