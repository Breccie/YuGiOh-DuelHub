import { AssetIcon } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import { ConsoleSidebarUtilityActions } from "@/components/console-shell-primitives";
import { SiteNav } from "@/components/site-nav";

function SkeletonBar({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(207,91,66,0.16),rgba(255,255,255,0.06))] ${className}`}
    />
  );
}

function LoadingMetric({
  iconName,
  label,
}: {
  iconName: "book" | "shield" | "sword" | "users";
  label: string;
}) {
  return (
    <div className="flex min-h-[58px] min-w-[132px] items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,13,18,0.58)] px-3 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-md">
      <AssetIcon name={iconName} className="h-5 w-5 text-[#d0b38c]" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.64rem] uppercase tracking-[0.16em] text-[#9f8c77]">
          {label}
        </p>
        <SkeletonBar className="mt-2 h-3 w-20" />
      </div>
    </div>
  );
}

export default function Loading() {
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
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2.5">
                <LoadingMetric iconName="shield" label="Kampagne" />
                <LoadingMetric iconName="book" label="Sammlung" />
                <LoadingMetric iconName="users" label="Freunde" />
                <LoadingMetric iconName="sword" label="Duellanfragen" />
                <div className="flex min-h-[58px] min-w-[154px] items-center gap-3 rounded-[14px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,13,18,0.58)] px-3 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-md">
                  <AssetIcon name="profile-signet" className="h-8 w-8 text-[#d0b38c]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.64rem] uppercase tracking-[0.16em] text-[#9f8c77]">
                      Benutzer
                    </p>
                    <SkeletonBar className="mt-2 h-3 w-20" />
                  </div>
                </div>
              </div>
            </div>

            <section className="mt-5 grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_392px]">
              <div className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[linear-gradient(180deg,rgba(10,13,18,0.82),rgba(7,9,13,0.92))] p-5 shadow-[0_28px_56px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                <p className="text-[0.75rem] uppercase tracking-[0.24em] text-[#cb5c44]">
                  Lade Bereich
                </p>
                <h1 className="font-display inscription-text mt-4 text-4xl uppercase leading-none sm:text-5xl">
                  Daten werden synchronisiert
                </h1>
                <p className="mt-4 max-w-[40rem] text-sm leading-7 text-[#cdb79a]">
                  Die Konsole ist bereit. Karten, Kampagne und Sammlung werden im
                  Arbeitsbereich nachgeladen.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4"
                    >
                      <SkeletonBar className="h-4 w-24" />
                      <SkeletonBar className="mt-4 h-28 w-full rounded-[14px]" />
                      <SkeletonBar className="mt-4 h-3 w-4/5" />
                      <SkeletonBar className="mt-2 h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              </div>

              <aside className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[linear-gradient(180deg,rgba(10,13,18,0.82),rgba(7,9,13,0.92))] p-5 shadow-[0_28px_56px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                <p className="text-[0.75rem] uppercase tracking-[0.24em] text-[#cb5c44]">
                  Nächste Aktionen
                </p>
                <div className="mt-5 space-y-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4"
                    >
                      <SkeletonBar className="h-3 w-28" />
                      <SkeletonBar className="mt-3 h-3 w-full" />
                    </div>
                  ))}
                </div>
              </aside>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
