"use client";

import type { ReactNode } from "react";
import type { AssetIconName } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import {
  ConsoleGlobalStatusBar,
  ConsoleSidebarUtilityActions,
} from "@/components/console-shell-primitives";
import { SiteNav } from "@/components/site-nav";

type MetricItem = {
  icon: ReactNode | AssetIconName;
  label: string;
  value: string;
};

function findMetricValue(metrics: MetricItem[], labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLocaleLowerCase("de"));

  return metrics.find((metric) =>
    normalizedLabels.includes(metric.label.toLocaleLowerCase("de")),
  )?.value;
}

function parseMetricCount(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const numericValue = Number.parseInt(value.replace(/\D/g, ""), 10);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function DuelConsoleScaffold({
  activePath: _activePath,
  viewer,
  metrics,
  topbar,
  children,
}: {
  activePath: string;
  viewer: {
    displayName: string;
    duelistId?: string | null;
  };
  metrics: MetricItem[];
  topbar?: {
    activeRunName?: string | null;
    collectionValue?: string | null;
    friendOnlineCount?: number | null;
    duelRequestCount?: number | null;
  };
  children: ReactNode;
}) {
  void _activePath;
  const campaignValue = topbar?.activeRunName ?? findMetricValue(metrics, ["Kampagne"]);
  const collectionValue = topbar?.collectionValue ?? findMetricValue(metrics, ["Sammlung"]);
  const duelRequestCount =
    topbar?.duelRequestCount ??
    parseMetricCount(findMetricValue(metrics, ["Duellanfragen", "Anfragen"]));

  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />

      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <aside className="app-sidebar border-b border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,15,0.78),rgba(5,7,10,0.9))] shadow-[18px_0_46px_rgba(0,0,0,0.34)] backdrop-blur-[18px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[196px] lg:border-b-0 lg:border-r lg:border-r-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-0 lg:py-0">
            <div className="border-b border-[rgba(255,255,255,0.08)] lg:px-6 lg:pb-8 lg:pt-6">
              <ConsoleBrand size="sm" />
            </div>

            <SiteNav />

            <ConsoleSidebarUtilityActions />
          </div>

        </aside>

        <main className="relative flex-1 overflow-hidden lg:ml-[196px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-3 pb-4 pt-3 sm:px-4 lg:px-5">
            <div className="app-topbar flex min-h-[52px] items-center justify-end rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.72)] px-3 py-2 shadow-[0_18px_38px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-4">
              <ConsoleGlobalStatusBar
                viewer={viewer}
                fallback={{
                  activeRunName: campaignValue,
                  collectionValue,
                  friendOnlineCount: topbar?.friendOnlineCount,
                  duelRequestCount,
                }}
              />
            </div>

            <div className="mt-4 flex-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
