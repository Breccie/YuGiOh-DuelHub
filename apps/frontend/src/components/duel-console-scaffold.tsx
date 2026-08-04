"use client";

import type { ReactNode } from "react";
import type { AssetIconName } from "@/components/asset-icon";
import { AppSidebar } from "@/components/app-sidebar";
import {
  ConsoleGlobalStatusBar,
} from "@/components/console-shell-primitives";

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
    avatarImageUrl?: string | null;
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
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-transparent text-[#f2e5d1]">
      <div className="app-background" />

      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <AppSidebar />

        <main className="app-main relative flex-1 overflow-hidden lg:ml-[176px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 pb-20 pt-3 sm:px-4 lg:px-5 lg:pb-4">
            <div className="app-topbar flex min-h-[52px] items-center justify-end rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.78)] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-3">
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
