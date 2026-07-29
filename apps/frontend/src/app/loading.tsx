import { AppSidebar } from "@/components/app-sidebar";
import { AssetIcon } from "@/components/asset-icon";

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
    <div className="hidden h-11 min-w-0 shrink-0 items-center gap-2 rounded-[9px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,13,18,0.58)] px-3 backdrop-blur-md md:flex">
      <AssetIcon name={iconName} className="h-4 w-4 text-[#d0b38c]" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.58rem] uppercase tracking-[0.12em] text-[#9f8c77]">
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
        <AppSidebar />

        <main className="app-main relative flex-1 overflow-hidden lg:ml-[176px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 pb-20 pt-3 sm:px-4 lg:px-5 lg:pb-4">
            <div className="app-topbar flex min-h-[52px] items-center justify-end rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.78)] px-2 py-1.5 backdrop-blur-xl sm:px-3">
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <LoadingMetric iconName="shield" label="Kampagne" />
                <LoadingMetric iconName="book" label="Sammlung" />
                <LoadingMetric iconName="users" label="Freunde" />
                <LoadingMetric iconName="sword" label="Duellanfragen" />
                <div className="flex h-11 w-[156px] shrink-0 items-center gap-2 rounded-[10px] border border-[rgba(255,255,255,0.09)] bg-[rgba(10,13,18,0.58)] px-2.5 backdrop-blur-md">
                  <AssetIcon name="profile-signet" className="h-6 w-6 text-[#d0b38c]" />
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
