import type { Metadata } from "next";
import { DesktopPreferencesHydrator } from "@/components/desktop-preferences-hydrator";
import { SyncCacheHydrator } from "@/components/sync-cache-hydrator";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Yu-Gi-Oh Duel Hub",
    template: "%s | Yu-Gi-Oh Duel Hub",
  },
  description:
    "Electron-basierter Yu-Gi-Oh Duel Hub mit Profilen, Sammlung, Deckexport, Duellanfragen, Trades und Turnieren.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full" data-scroll-behavior="smooth">
      <body className="min-h-full bg-background text-foreground antialiased">
        <DesktopPreferencesHydrator />
        <SyncCacheHydrator />
        {children}
      </body>
    </html>
  );
}
