"use client";

import { useEffect, useRef } from "react";
import { useApiWake } from "@/lib/use-api-wake";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { phase, wake } = useApiWake({ autoStart: false });
  const recoveryStarted = useRef(false);
  const serviceUnavailable =
    error.message.includes("API-Service") || error.message.includes("service_unavailable");

  useEffect(() => {
    if (recoveryStarted.current) {
      return;
    }

    const recoveryKey = `duel-hub-error-recovery:${error.digest ?? error.message}`;

    if (window.sessionStorage.getItem(recoveryKey)) {
      return;
    }

    recoveryStarted.current = true;
    window.sessionStorage.setItem(recoveryKey, "1");
    void wake().then((ready) => {
      if (ready) {
        reset();
      }
    });
  }, [error.digest, error.message, reset, wake]);

  return (
    <main className="app-shell relative min-h-screen overflow-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[980px] items-center px-6">
        <section className="panel-surface w-full rounded-[28px] p-8">
          <p className="ui-kicker">
            {phase === "CHECKING" || phase === "WAKING"
              ? "Online-Service wird geprüft"
              : serviceUnavailable
                ? "Service nicht erreichbar"
                : "Unerwarteter Fehler"}
          </p>
          <h1 className="font-display inscription-text-soft mt-4 text-4xl leading-tight">
            {phase === "CHECKING" || phase === "WAKING"
              ? "Der Server wird gestartet"
              : serviceUnavailable
              ? "Der Online-Service antwortet gerade nicht"
              : "Diese Ansicht konnte nicht geladen werden"}
          </h1>
          <p className="mt-4 max-w-[42rem] text-sm leading-7 text-[#cdb79a]">
            {phase === "CHECKING" || phase === "WAKING"
              ? "Einen Moment bitte. Die Verbindung wird hergestellt und die Ansicht danach automatisch geladen."
              : serviceUnavailable
              ? "Der Online-Service antwortet noch nicht. Versuche es direkt erneut. Deine Daten und Eingaben bleiben erhalten."
              : "Die App hat den Fehler abgefangen. Du kannst es direkt nochmal versuchen; falls es bleibt, prüfen wir den betroffenen Bereich gezielt."}
          </p>
          <button
            type="button"
            onClick={() => {
              if (phase === "UNAVAILABLE") {
                void wake().then((ready) => {
                  if (ready) reset();
                });
                return;
              }
              reset();
            }}
            className="mt-7 inline-flex min-h-[48px] items-center justify-center rounded-[6px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#fff0e1] shadow-[0_0_30px_rgba(151,29,20,0.24)] transition hover:brightness-110"
          >
            {phase === "CHECKING" || phase === "WAKING"
              ? "Server wird gestartet..."
              : "Erneut versuchen"}
          </button>
        </section>
      </div>
    </main>
  );
}
