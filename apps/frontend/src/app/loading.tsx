export default function Loading() {
  return (
    <main className="app-shell relative min-h-screen overflow-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[980px] items-center px-6">
        <section className="panel-surface w-full rounded-[28px] p-8">
          <p className="ui-kicker">Lade Duel Hub</p>
          <h1 className="font-display inscription-text-soft mt-4 text-4xl leading-tight">
            Konsole wird synchronisiert
          </h1>
          <p className="mt-4 max-w-[42rem] text-sm leading-7 text-[#cdb79a]">
            Kartenpool, Session und Liga-Daten werden vorbereitet. Einen Moment noch.
          </p>
        </section>
      </div>
    </main>
  );
}
