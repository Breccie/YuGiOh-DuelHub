import Link from "next/link";
import type { ReactNode } from "react";
import { ConsoleBrand } from "@/components/console-brand";
import {
  ConsoleSidebarUtilityActions,
  ConsoleWindowChromeButton,
} from "@/components/console-shell-primitives";
import { SiteNav } from "@/components/site-nav";

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

export function SiteFrame({
  eyebrow,
  title,
  description,
  actions,
  topbarContent,
  backLink,
  headerContent,
  headerClassName,
  headerVariant = "panel",
  children,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  topbarContent?: ReactNode;
  backLink?: {
    href: string;
    label: string;
  };
  headerContent?: ReactNode;
  headerClassName?: string;
  headerVariant?: "panel" | "bare" | "none";
  children: ReactNode;
}) {
  const defaultHeader = (
    <div className="max-w-5xl">
      {eyebrow ? (
        <p className="text-[0.76rem] uppercase tracking-[0.26em] text-[#cb5c44]">
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h1 className="font-display inscription-text mt-4 max-w-4xl text-4xl leading-[0.96] uppercase tracking-[0.025em] sm:text-5xl xl:text-[3.9rem]">
          {title}
        </h1>
      ) : null}
      {description ? (
        <p className="mt-5 max-w-3xl text-base leading-8 text-[#bfae9a] sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );

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
            <div className="app-topbar flex min-h-[52px] items-center justify-between rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.72)] px-4 shadow-[0_18px_38px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
              {topbarContent ? (
                <div className="flex min-w-0 flex-1 justify-end">
                  {topbarContent}
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#d04f36] shadow-[0_0_14px_rgba(208,79,54,0.86)]" />
                </div>
              )}
              <div className="hidden justify-end gap-2 xl:flex">
                <ConsoleWindowChromeButton name="window-min" label="Minimieren" />
                <ConsoleWindowChromeButton name="window-max" label="Fenster" />
                <ConsoleWindowChromeButton name="window-close" label="Schließen" />
              </div>
            </div>

            {actions ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                {actions}
              </div>
            ) : null}

            {headerVariant === "none" ? null : headerVariant === "bare" ? (
              <section className={classes("app-header-dock relative mt-3 rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.58)] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl", headerClassName)}>
                {backLink ? (
                  <div className="mb-3">
                    <Link
                      href={backLink.href}
                      className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm font-semibold text-[#ead9c3] transition hover:border-[rgba(207,91,66,0.24)] hover:text-[#fff0de]"
                    >
                      {backLink.label}
                    </Link>
                  </div>
                ) : null}

                {headerContent ?? defaultHeader}
              </section>
            ) : (
              <section
                className={classes(
                  "app-header-dock relative mt-3 overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(9,12,16,0.72),rgba(7,9,13,0.88))] px-5 py-5 shadow-[0_18px_42px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-6 sm:py-6",
                  headerClassName,
                )}
              >
                {backLink ? (
                  <div className="mb-5">
                    <Link
                      href={backLink.href}
                      className="inline-flex items-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm font-semibold text-[#ead9c3] transition hover:border-[rgba(207,91,66,0.24)] hover:text-[#fff0de]"
                    >
                      {backLink.label}
                    </Link>
                  </div>
                ) : null}

                {headerContent ?? defaultHeader}
              </section>
            )}

            <div className="app-content-viewport mt-3 flex-1 space-y-4 overflow-hidden rounded-[26px] border border-[rgba(255,255,255,0.08)] bg-[rgba(4,6,10,0.38)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_24px_54px_rgba(0,0,0,0.24)] backdrop-blur-md sm:p-4">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
