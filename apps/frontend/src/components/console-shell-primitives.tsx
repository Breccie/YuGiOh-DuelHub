"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
import { authClient } from "@/lib/auth-client";
import {
  readCachedDashboardSummary,
  writeCachedDashboardSummary,
} from "@/lib/dashboard-cache";
import { syncClient } from "@/lib/sync-client";

type DesktopViewer = {
  displayName: string;
  duelistId?: string | null;
};

type ConsoleTopbarFallback = {
  activeRunName?: string | null;
  collectionValue?: string | null;
  friendOnlineCount?: number | null;
  duelRequestCount?: number | null;
};

type ConsoleTopbarState = {
  activeRunName: string;
  collectionValue: string;
  friendOnlineCount: number;
  duelRequestCount: number;
};

function getDesktopShell() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopShell ?? null;
}

function subscribeToDesktopShell() {
  return () => {};
}

function getDesktopShellSnapshot() {
  return Boolean(getDesktopShell());
}

function getServerDesktopShellSnapshot() {
  return false;
}

function resolveTopbarState(): ConsoleTopbarState {
  const cachedPayload = readCachedDashboardSummary()?.payload ?? null;
  const cachedTopbar = cachedPayload?.topbar ?? null;

  return {
    activeRunName:
      cachedPayload?.activeRunName ??
      "Keine Kampagne",
    collectionValue:
      cachedPayload?.collectionValue ??
      "Sammlung",
    friendOnlineCount:
      cachedTopbar?.friendOnlineCount ??
      0,
    duelRequestCount:
      cachedTopbar?.duelRequestCount ??
      cachedPayload?.duelRequests.length ??
      0,
  };
}

function TopbarStatusChip({
  href,
  iconName,
  label,
  value,
}: {
  href: string;
  iconName: "book" | "bell" | "shield" | "users" | "sword";
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[58px] min-w-[132px] items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,13,18,0.58)] px-3 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-md transition hover:border-[rgba(208,170,110,0.24)] hover:bg-[rgba(18,22,28,0.76)]"
    >
      <AssetIcon
        name={iconName}
        className="h-5 w-5 text-[#d0b38c] transition group-hover:text-[#f0d6a8]"
      />
      <span className="min-w-0">
        <span className="block truncate text-[0.64rem] uppercase tracking-[0.16em] text-[#9f8c77]">
          {label}
        </span>
        <span className="mt-1 block max-w-[13rem] truncate text-sm font-semibold text-[#efdfcb]">
          {value}
        </span>
      </span>
    </Link>
  );
}

function ProfileMenuLink({
  href,
  iconName,
  label,
  detail,
  onClick,
}: {
  href: string;
  iconName: "book" | "profile-signet" | "settings" | "shield";
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex items-center gap-3 rounded-[14px] border border-transparent px-3 py-2.5 transition hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.04)]"
    >
      <span className="grid h-9 w-9 place-items-center rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#cdb28f] transition group-hover:text-[#f0d6a8]">
        <AssetIcon name={iconName} className="h-4 w-4 text-current" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#f0dfcc]">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-[#9f8c77]">{detail}</span>
      </span>
    </Link>
  );
}

export function ConsoleWindowChromeButton({
  name,
  label,
}: {
  name: "window-min" | "window-max" | "window-close";
  label: string;
}) {
  const isAvailable = useSyncExternalStore(
    subscribeToDesktopShell,
    getDesktopShellSnapshot,
    getServerDesktopShellSnapshot,
  );

  function handleClick() {
    const shell = getDesktopShell();

    if (!shell) {
      return;
    }

    if (name === "window-min") {
      void shell.minimizeWindow?.();
      return;
    }

    if (name === "window-max") {
      void shell.toggleMaximizeWindow?.();
      return;
    }

    void shell.closeWindow?.();
  }

  if (!isAvailable) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={handleClick}
      className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(255,255,255,0.09)] bg-[rgba(8,10,14,0.5)] text-[#d9c5ac] transition hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(18,22,28,0.76)]"
    >
      <AssetIcon name={name} className="h-4 w-4 text-current" />
    </button>
  );
}

export function ConsoleGlobalStatusBar({
  viewer,
  fallback,
}: {
  viewer: DesktopViewer;
  fallback?: ConsoleTopbarFallback;
}) {
  const [remoteStatus, setRemoteStatus] = useState(resolveTopbarState);
  const status = {
    activeRunName: fallback?.activeRunName ?? remoteStatus.activeRunName,
    collectionValue: fallback?.collectionValue ?? remoteStatus.collectionValue,
    friendOnlineCount:
      fallback?.friendOnlineCount ?? remoteStatus.friendOnlineCount,
    duelRequestCount: fallback?.duelRequestCount ?? remoteStatus.duelRequestCount,
  };

  useEffect(() => {
    let mounted = true;

    async function refresh() {
      const payload = await syncClient.getDashboardSummary();

      if (!mounted) {
        return;
      }

      writeCachedDashboardSummary(payload);
      setRemoteStatus({
        activeRunName: payload.activeRunName,
        collectionValue: payload.collectionValue,
        friendOnlineCount: payload.topbar?.friendOnlineCount ?? 0,
        duelRequestCount:
          payload.topbar?.duelRequestCount ?? payload.duelRequests.length,
      });
    }

    void refresh().catch(() => null);

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2.5">
      <TopbarStatusChip
        href="/campaigns"
        iconName="shield"
        label="Kampagne"
        value={status.activeRunName}
      />
      <TopbarStatusChip
        href="/collection"
        iconName="book"
        label="Sammlung"
        value={status.collectionValue}
      />
      <TopbarStatusChip
        href="/friends"
        iconName="users"
        label="Freunde online"
        value={`${status.friendOnlineCount} online`}
      />
      <TopbarStatusChip
        href="/duels"
        iconName="sword"
        label="Duellanfragen"
        value={`${status.duelRequestCount} offen`}
      />
      <ConsoleProfileMenuChip viewer={viewer} />
    </div>
  );
}

export function ConsoleSidebarUtilityActions() {
  const router = useRouter();

  async function logout() {
    await authClient.logout();

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="hidden lg:mt-auto lg:flex lg:items-center lg:justify-between lg:px-5 lg:pb-8">
      <Link
        href="/settings"
        className="rounded-full p-3 text-[#9c8872] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f1deca]"
        aria-label="Profil-Einstellungen"
      >
        <AssetIcon name="settings" className="h-5 w-5 text-current" />
      </Link>
      <button
        type="button"
        onClick={logout}
        className="rounded-full p-3 text-[#9c8872] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f1deca]"
        aria-label="Abmelden"
      >
        <AssetIcon name="logout" className="h-5 w-5 text-current" />
      </button>
    </div>
  );
}

export function ConsoleProfileMenuChip({
  viewer,
}: {
  viewer: DesktopViewer;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  async function logout() {
    await authClient.logout();

    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[68px] items-center gap-3 rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(10,13,18,0.62)] px-3 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
      >
        <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[radial-gradient(circle,rgba(35,49,68,0.92),rgba(10,12,16,0.98))] text-[#d9c5ac]">
          <AssetIcon name="profile-signet" className="h-7 w-7 text-current" />
          <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-[#d34d39] shadow-[0_0_10px_rgba(211,77,57,0.85)]" />
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-sm font-semibold text-[#f0dfcc]">{viewer.displayName}</p>
          <p className="text-[0.7rem] uppercase tracking-[0.16em] text-[#9f8c77]">
            {viewer.duelistId ?? "Duelist"}
          </p>
        </div>
        <AssetIcon name="chevron-down" className="h-4 w-4 text-[#c3ae92]" />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 min-w-[292px] rounded-[20px] border border-[rgba(255,255,255,0.09)] bg-[linear-gradient(180deg,rgba(11,14,19,0.98),rgba(7,9,13,0.99))] p-2 shadow-[0_26px_54px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.025)] px-4 py-3">
            <p className="text-sm font-semibold text-[#f0dfcc]">{viewer.displayName}</p>
            <p className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
              {viewer.duelistId ?? "Duelist"}
            </p>
          </div>
          <div className="mt-2 grid gap-1">
            <ProfileMenuLink
              href={viewer.duelistId ? `/profiles/${viewer.duelistId}` : "/settings"}
              iconName="profile-signet"
              label="Profil"
              detail="Öffentliche Ansicht"
              onClick={() => setOpen(false)}
            />
            <ProfileMenuLink
              href="/collection"
              iconName="book"
              label="Sammlung"
              detail="Binder und Karten"
              onClick={() => setOpen(false)}
            />
            <ProfileMenuLink
              href="/campaigns"
              iconName="shield"
              label="Kampagne"
              detail="Auswahl und Einstellungen"
              onClick={() => setOpen(false)}
            />
            <ProfileMenuLink
              href="/settings"
              iconName="settings"
              label="Einstellungen"
              detail="Account und Anzeige"
              onClick={() => setOpen(false)}
            />
            <button
              type="button"
              className="mt-2 rounded-[14px] border border-[rgba(199,54,36,0.34)] bg-[rgba(116,20,14,0.28)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#ffd7cb] transition hover:border-[rgba(229,82,58,0.48)] hover:bg-[rgba(141,28,19,0.4)]"
              onClick={logout}
            >
              Abmelden
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
