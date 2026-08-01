"use client";

import { useEffect, useState } from "react";
import { AssetIcon } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import { ConsoleSidebarUtilityActions } from "@/components/console-shell-primitives";
import { SiteNav } from "@/components/site-nav";

const storageKey = "duel-hub-sidebar-collapsed";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const savedValue = window.localStorage.getItem(storageKey);
    const nextCollapsed = savedValue === "true";
    document.documentElement.dataset.navCollapsed = String(nextCollapsed);
    const frameId = window.requestAnimationFrame(() => {
      setCollapsed(nextCollapsed);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      delete document.documentElement.dataset.navCollapsed;
    };
  }, []);

  function toggleCollapsed() {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    window.localStorage.setItem(storageKey, String(nextCollapsed));
    document.documentElement.dataset.navCollapsed = String(nextCollapsed);
  }

  return (
    <aside
      className="app-sidebar lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[260px] lg:flex-col lg:border-r lg:border-r-[rgba(255,255,255,0.08)] lg:bg-[linear-gradient(180deg,rgba(8,11,15,0.94),rgba(5,7,10,0.98))] lg:shadow-[18px_0_46px_rgba(0,0,0,0.28)] lg:backdrop-blur-[18px]"
      data-collapsed={collapsed}
    >
      <div className="hidden items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3 lg:flex lg:min-h-[84px] lg:px-5">
        <div data-sidebar-brand>
          <ConsoleBrand size="sm" />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ui-icon-button hidden lg:grid"
          aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
          title={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
        >
          <AssetIcon
            name={collapsed ? "chevron-right" : "chevron-left"}
            className="h-4 w-4 text-current"
          />
        </button>
      </div>

      <SiteNav />
      <ConsoleSidebarUtilityActions />
    </aside>
  );
}
