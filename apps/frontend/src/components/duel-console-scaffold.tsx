"use client";

import type { ReactNode } from "react";
import type { AssetIconName } from "@/components/asset-icon";
import { AppShell } from "@/components/app-shell";
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
    <AppShell
      topbar={(
        <ConsoleGlobalStatusBar
          viewer={viewer}
          fallback={{
            activeRunName: campaignValue,
            collectionValue,
            friendOnlineCount: topbar?.friendOnlineCount,
            duelRequestCount,
          }}
        />
      )}
    >
      <div className="mt-4 flex-1">{children}</div>
    </AppShell>
  );
}
