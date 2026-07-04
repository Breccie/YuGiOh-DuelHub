"use client";

import Link from "next/link";
import type { RuleTopicDto } from "@ygo/contracts";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";

type RuleArticleConsoleProps = {
  viewer: {
    displayName: string;
  };
  topic: RuleTopicDto;
  relatedTopics: RuleTopicDto[];
};

export function RuleArticleConsole({
  viewer,
  topic,
  relatedTopics,
}: RuleArticleConsoleProps) {
  return (
    <DuelConsoleScaffold
      activePath="/rules"
      viewer={viewer}
      metrics={[
        { icon: "book", label: "Regelbereich", value: topic.kicker },
        { icon: "scale", label: "Checkpunkte", value: String(topic.checklist.length) },
        { icon: "search", label: "Themen", value: String(relatedTopics.length + 1) },
      ]}
    >
      <section className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel kicker={topic.kicker} title={topic.title}>
          <div className="max-w-[58rem]">
            <p className="text-lg leading-8 text-[#e6d0b4]">{topic.summary}</p>

            <div className="mt-8 space-y-5">
              {topic.body.map((paragraph) => (
                <p key={paragraph} className="text-[1rem] leading-8 text-[#cdb79a]">
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/rules"
                className="inline-flex min-h-[48px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[rgba(10,13,18,0.66)] px-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#ead9c3] transition hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(18,22,28,0.82)]"
              >
                <AssetIcon name="chevron-right" className="h-4 w-4 rotate-180 text-current" />
                <span>Zur Übersicht</span>
              </Link>
              <Link
                href="/tournaments"
                className="inline-flex min-h-[48px] items-center justify-center gap-3 rounded-[6px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#fff0e1] shadow-[0_0_30px_rgba(151,29,20,0.24)] transition hover:brightness-110"
              >
                <AssetIcon name="sword" className="h-4 w-4 text-current" />
                <span>Turniere öffnen</span>
              </Link>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel kicker="Abnahme" title="Checkliste">
            <div className="space-y-3">
              {topic.checklist.map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[18px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <StatusPill tone="gold">{index + 1}</StatusPill>
                  <p className="text-sm leading-7 text-[#dcc7aa]">{item}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel kicker="Weiterlesen" title="Verwandte Themen">
            <div className="space-y-3">
              {relatedTopics.map((relatedTopic) => (
                <Link
                  key={relatedTopic.slug}
                  href={`/rules/${relatedTopic.slug}`}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(184,142,89,0.12)] bg-[rgba(255,255,255,0.025)] px-4 py-3 text-sm text-[#ead6b4] transition hover:border-[rgba(207,91,66,0.18)]"
                >
                  <span>{relatedTopic.title}</span>
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
