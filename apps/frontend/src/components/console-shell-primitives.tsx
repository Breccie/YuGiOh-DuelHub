"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
import { authClient } from "@/lib/auth-client";

type DesktopViewer = {
  displayName: string;
  duelistId?: string | null;
};

function getDesktopShell() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopShell ?? null;
}

export function ConsoleWindowChromeButton({
  name,
  label,
}: {
  name: "window-min" | "window-max" | "window-close";
  label: string;
}) {
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

  return (
    <button
      type="button"
      aria-label={label}
      onClick={handleClick}
      className="grid h-8 w-8 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(8,10,14,0.45)] text-[#d9c5ac] transition hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(18,22,28,0.72)]"
    >
      <AssetIcon name={name} className="h-3.5 w-3.5 text-current" />
    </button>
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
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-40 min-w-[240px] rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(11,14,19,0.96),rgba(8,10,14,0.98))] p-3 shadow-[0_24px_48px_rgba(0,0,0,0.32)]">
          <div className="border-b border-[rgba(255,255,255,0.08)] px-3 pb-3">
            <p className="text-sm font-semibold text-[#f0dfcc]">{viewer.displayName}</p>
            <p className="mt-1 text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
              {viewer.duelistId ?? "Duelist"}
            </p>
          </div>
          <div className="mt-3 grid gap-2">
            <Link
              href={viewer.duelistId ? `/profiles/${viewer.duelistId}` : "/settings"}
              className="ui-button-neutral text-sm"
              onClick={() => setOpen(false)}
            >
              Profil öffnen
            </Link>
            <Link
              href="/settings"
              className="ui-button-neutral text-sm"
              onClick={() => setOpen(false)}
            >
              Profil-Einstellungen
            </Link>
            <Link
              href="/campaigns/settings"
              className="ui-button-neutral text-sm"
              onClick={() => setOpen(false)}
            >
              Kampagnen-Einstellungen
            </Link>
            <Link
              href="/campaigns"
              className="ui-button-neutral text-sm"
              onClick={() => setOpen(false)}
            >
              Kampagne wechseln
            </Link>
            <Link
              href="/duels"
              className="ui-button-neutral text-sm"
              onClick={() => setOpen(false)}
            >
              Duelle
            </Link>
            <button type="button" className="ui-button-danger text-sm" onClick={logout}>
              Abmelden
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
