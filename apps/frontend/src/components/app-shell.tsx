import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({
  topbar,
  children,
}: {
  topbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-transparent text-[#f2e5d1]">
      <div className="app-background" />
      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <AppSidebar />
        <main className="app-main relative flex-1 overflow-hidden">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 pb-20 pt-3 sm:px-4 lg:px-5 lg:pb-4">
            <div className="app-topbar flex min-h-[52px] items-center justify-end rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.78)] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-3">
              {topbar ?? <span className="h-2.5 w-2.5 rounded-full bg-[#d04f36] shadow-[0_0_14px_rgba(208,79,54,0.86)]" />}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
