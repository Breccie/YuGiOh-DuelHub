"use client";

import Link from "next/link";
import { useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";

type RulesConsoleProps = {
  viewer: {
    displayName: string;
  };
  collectionValue: string;
  latestBanlistName: string;
  activeEra: string;
  banlistSummary: {
    forbidden: number;
    limited: number;
    semiLimited: number;
  };
  formatCards: Array<{
    id: string;
    name: string;
    detail: string;
    action: string;
  }>;
  faqItems: Array<{
    id: string;
    question: string;
  }>;
};

const topicSections = [
  { label: "Progression", slug: "progression" },
  { label: "Saison", slug: "season" },
  { label: "Banlist & Errata", slug: "banlist-errata" },
  { label: "Deckbau", slug: "deckbau" },
  { label: "EDOPro", slug: "edopro" },
  { label: "Trades", slug: "trades" },
  { label: "Turniere", slug: "tournaments" },
  { label: "Häufige Fragen", slug: "faq" },
] as const;

const ruleSteps = [
  {
    id: "1",
    label: "Deck",
    detail: "Baue ein Deck mit mindestens 40 Karten und achte auf die gültige Banlist.",
    iconName: "book" as const,
  },
  {
    id: "2",
    label: "Duell",
    detail: "Gewonnen wird über Life Points, Karteneffekte oder besondere Siegbedingungen.",
    iconName: "sword" as const,
  },
  {
    id: "3",
    label: "Züge",
    detail: "Ziehe, beschwöre, setze und löse Effekte in der richtigen Reihenfolge auf.",
    iconName: "hourglass" as const,
  },
  {
    id: "4",
    label: "Sieg",
    detail: "Ein Fehler bei Timing oder Ressourcen kann ein ganzes Duell kippen.",
    iconName: "shield" as const,
  },
  {
    id: "5",
    label: "Regeln",
    detail: "Kartentexte, Errata und Formate haben immer Vorrang vor alten Erinnerungen.",
    iconName: "scale" as const,
  },
];

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "ember" | "gold" | "slate";
}) {
  return (
    <div className="rounded-[18px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.74rem] uppercase tracking-[0.2em] text-[#bca78c]">{label}</p>
        <StatusPill tone={tone}>{String(value)}</StatusPill>
      </div>
    </div>
  );
}

export function RulesConsole({
  viewer,
  collectionValue,
  latestBanlistName,
  activeEra,
  banlistSummary,
  formatCards,
  faqItems,
}: RulesConsoleProps) {
  const [selectedTopic, setSelectedTopic] = useState<string>(topicSections[0].slug);

  return (
    <DuelConsoleScaffold
      activePath="/rules"
      viewer={{
        displayName: viewer.displayName,
      }}
      metrics={[
        { icon: "book", label: "Sammlung", value: collectionValue },
        { icon: "scale", label: "Banlist", value: latestBanlistName },
        { icon: "hourglass", label: "Aktive Ära", value: activeEra },
      ]}
    >
      <section className="grid gap-6 pt-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p className="text-[0.82rem] uppercase tracking-[0.26em] text-[#cb5c44]">Regelwerk</p>
          <h1 className="font-display inscription-text mt-4 text-[3.9rem] leading-[0.92] tracking-[0.02em] sm:text-[5rem]">
            Regeln & Formate
          </h1>
          <p className="mt-5 max-w-[44rem] text-[1.05rem] leading-8 text-[#dbc9b2]">
            Alles Wichtige für Progression, Bannlisten, Kartentexte und Spielfluss an einem Ort.
            Weniger Scrollen, klarere Themen und direkte Sprünge in die relevanten Regelbereiche.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/rules/progression"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#fff0e1] shadow-[0_0_30px_rgba(151,29,20,0.24)] transition hover:brightness-110"
            >
              <AssetIcon name="book" className="h-5 w-5 text-current" />
              <span>Regelbuch öffnen</span>
            </Link>
            <Link
              href="/rules/faq"
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
            >
              <AssetIcon name="search" className="h-5 w-5 text-current" />
              <span>FAQ prüfen</span>
            </Link>
          </div>
        </div>

        <Panel kicker="Aktiv" title="Regelrahmen">
          <div className="grid gap-3">
            <SummaryRow label="Bannliste" value={latestBanlistName} tone="gold" />
            <SummaryRow label="Ära" value={activeEra} tone="slate" />
            <SummaryRow label="Verboten" value={banlistSummary.forbidden} tone="ember" />
            <SummaryRow label="Limitiert" value={banlistSummary.limited} tone="gold" />
            <SummaryRow label="Semi-limitiert" value={banlistSummary.semiLimited} tone="slate" />
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <Panel kicker="Navigation" title="Themen">
          <div className="space-y-2">
            {topicSections.map((topic) => {
              const active = selectedTopic === topic.slug;

              return (
                <Link
                  key={topic.slug}
                  href={`/rules/${topic.slug}`}
                  onClick={() => setSelectedTopic(topic.slug)}
                  className={classes(
                    "flex items-center justify-between rounded-[16px] border px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition",
                    active
                      ? "border-[rgba(207,91,66,0.28)] bg-[linear-gradient(90deg,rgba(122,32,22,0.34),rgba(122,32,22,0.12))] text-[#ffe3ca]"
                      : "border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] text-[#dbc7aa] hover:border-[rgba(207,91,66,0.18)]",
                  )}
                >
                  <span>{topic.label}</span>
                  <AssetIcon name="chevron-right" className="h-4 w-4 text-current" />
                </Link>
              );
            })}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel kicker="Grundlagen" title="Duellfluss">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {ruleSteps.map((step) => (
                <article
                  key={step.id}
                  className="rounded-[22px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-[14px] border border-[rgba(184,142,89,0.18)] bg-[rgba(255,255,255,0.03)] p-3 text-[#d8bc91]">
                      <AssetIcon name={step.iconName} className="h-6 w-6 text-current" />
                    </div>
                    <span className="text-[0.74rem] uppercase tracking-[0.18em] text-[#ab977d]">Schritt {step.id}</span>
                  </div>
                  <h3 className="mt-4 font-display text-[1.4rem] leading-none text-[#f0dcc0]">{step.label}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#cfbaa0]">{step.detail}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel kicker="Formate" title="Ären & Regeln">
            <div className="space-y-3">
              {formatCards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col gap-3 rounded-[20px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold text-[#f2dfc8]">{card.name}</p>
                    <p className="mt-1 text-sm leading-7 text-[#bfaa8a]">{card.detail}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#f0dcc0]">
                    {card.action}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel kicker="Banlist" title="Überblick">
            <div className="grid gap-4">
              <div className="rounded-[20px] border border-[rgba(204,97,78,0.22)] bg-[rgba(141,61,48,0.12)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#f0b0a2]">Verboten</p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#ffd7ce]">{banlistSummary.forbidden}</p>
              </div>
              <div className="rounded-[20px] border border-[rgba(208,170,110,0.22)] bg-[rgba(208,170,110,0.08)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#e9cf99]">Limitiert</p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#f6e1b7]">{banlistSummary.limited}</p>
              </div>
              <div className="rounded-[20px] border border-[rgba(126,143,168,0.18)] bg-[rgba(255,255,255,0.04)] px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.2em] text-[#c8d3e1]">Semi-limitiert</p>
                <p className="mt-3 font-display text-[2rem] leading-none text-[#e2e9f3]">{banlistSummary.semiLimited}</p>
              </div>
            </div>
          </Panel>

          <Panel kicker="FAQ" title="Schnelle Antworten">
            <div className="space-y-3">
              {faqItems.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  href="/rules/faq"
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-3 text-sm text-[#ead6b4] transition hover:border-[rgba(207,91,66,0.18)]"
                >
                  <span>{item.question}</span>
                  <AssetIcon name="chevron-right" className="h-4 w-4 shrink-0 text-current" />
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
