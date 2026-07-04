import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell relative min-h-screen overflow-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[980px] items-center px-6">
        <section className="panel-surface w-full rounded-[28px] p-8">
          <p className="ui-kicker">404</p>
          <h1 className="font-display inscription-text-soft mt-4 text-4xl leading-tight">
            Diese Duel-Hub-Seite gibt es nicht
          </h1>
          <p className="mt-4 max-w-[42rem] text-sm leading-7 text-[#cdb79a]">
            Der Link zeigt auf keinen bekannten Bereich. Zurück zur Konsole und wir nehmen
            die richtige Abzweigung.
          </p>
          <Link
            href="/"
            className="mt-7 inline-flex min-h-[48px] items-center justify-center rounded-[6px] border border-[rgba(193,68,44,0.56)] bg-[linear-gradient(180deg,rgba(151,29,20,0.94),rgba(95,14,9,0.96))] px-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#fff0e1] shadow-[0_0_30px_rgba(151,29,20,0.24)] transition hover:brightness-110"
          >
            Zur Startkonsole
          </Link>
        </section>
      </div>
    </main>
  );
}
