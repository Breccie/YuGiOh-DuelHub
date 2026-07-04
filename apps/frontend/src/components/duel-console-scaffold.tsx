"use client";

import type { ReactNode } from "react";
import type { AssetIconName } from "@/components/asset-icon";
import { AssetIcon } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import {
  ConsoleProfileMenuChip,
  ConsoleSidebarUtilityActions,
  ConsoleWindowChromeButton,
} from "@/components/console-shell-primitives";
import { SiteNav } from "@/components/site-nav";

type MetricItem = {
  icon: ReactNode | AssetIconName;
  label: string;
  value: string;
};

function MetricChip({ icon, label, value }: MetricItem) {
  const resolvedIcon =
    typeof icon === "string" ? (
      <AssetIcon name={icon as AssetIconName} className="h-6 w-6 text-current" />
    ) : (
      icon
    );

  return (
    <div className="flex min-h-[68px] items-center gap-3 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,13,18,0.62)] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
      <div className="text-[#d0b38c]">{resolvedIcon}</div>
      <div>
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-[#9f8c77]">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-[#efdfcb]">{value}</p>
      </div>
    </div>
  );
}

export function DuelConsoleScaffold({
  activePath: _activePath,
  viewer,
  metrics,
  children,
}: {
  activePath: string;
  viewer: {
    displayName: string;
    duelistId?: string | null;
  };
  metrics: MetricItem[];
  children: ReactNode;
}) {
  void _activePath;

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
            <div className="hidden justify-end gap-3 xl:flex">
              <ConsoleWindowChromeButton name="window-min" label="Minimieren" />
              <ConsoleWindowChromeButton name="window-max" label="Fenster" />
              <ConsoleWindowChromeButton name="window-close" label="Schließen" />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3 xl:mt-2">
              {metrics.map((metric) => (
                <MetricChip
                  key={`${metric.label}-${metric.value}`}
                  icon={metric.icon}
                  label={metric.label}
                  value={metric.value}
                />
              ))}

              <ConsoleProfileMenuChip viewer={viewer} />
            </div>

            <div className="mt-4 flex-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
