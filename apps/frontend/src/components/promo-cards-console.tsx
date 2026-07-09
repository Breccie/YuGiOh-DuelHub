"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type {
  ApplyRunProgressionResponse,
  GenerateRunProgressionResponse,
  RunProgressionResponse,
  RunPromosResponse,
  PromoSourceDto,
} from "@ygo/contracts";
import { AssetIcon, type AssetIconName } from "@/components/asset-icon";
import { ConsoleBrand } from "@/components/console-brand";
import { consoleNavItems } from "@/components/console-nav-items";
import {
  ConsoleGlobalStatusBar,
  ConsoleSidebarUtilityActions,
} from "@/components/console-shell-primitives";
import { apiPostJson, getApiErrorMessage } from "@/lib/api-client";

type PromoCardsConsoleProps = {
  viewer: {
    displayName: string;
  };
  promos: RunPromosResponse;
  progression: RunProgressionResponse;
  recentCollectionCards: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
    setCode: string | null;
  }>;
};

function classes(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "Historisches Datum fehlt";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getClaimModeLabel(source: PromoSourceDto) {
  if (source.sourceType === "PRIZE_PROMO") {
    return "Organizer-Preis";
  }

  if (source.sourceType === "PACK_REWARD") {
    return "Pack-Reward";
  }

  if (source.claimMode === "FIXED") {
    return "Feste Beilage";
  }

  return "Quelle wählen";
}

function SidebarNavItem({
  href,
  label,
  active,
  iconName,
}: {
  href: string;
  label: string;
  active?: boolean;
  iconName: AssetIconName;
}) {
  return (
    <Link
      href={href}
      className={classes(
        "group relative flex items-center gap-4 border-y border-transparent px-6 py-8 text-sm uppercase tracking-[0.22em] transition",
        active
          ? "border-y-[rgba(196,69,48,0.14)] bg-[linear-gradient(90deg,rgba(124,32,22,0.34),rgba(124,32,22,0.12),transparent)] text-[#f4ddc2]"
          : "text-[#baa58d] hover:bg-[rgba(255,255,255,0.03)] hover:text-[#f1deca]",
      )}
    >
      {active ? (
        <span className="absolute right-0 top-1/2 h-10 w-px -translate-y-1/2 bg-[#d04f36] shadow-[0_0_22px_rgba(208,79,54,0.95)]" />
      ) : null}
      <AssetIcon name={iconName} className="h-5 w-5 text-current" />
      <span>{label}</span>
    </Link>
  );
}

export function PromoCardsConsole({
  viewer,
  promos,
  progression,
  recentCollectionCards,
}: PromoCardsConsoleProps) {
  const [sources, setSources] = useState(promos.sources);
  const [progressionState, setProgressionState] = useState(progression);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readyCheckpoint = progressionState.readyCheckpoints[0] ?? null;
  const canApplyProgression =
    progressionState.run.viewerRole === "OWNER" ||
    progressionState.run.viewerRole === "ORGANIZER";

  async function claim(sourceId: string, setCardId: string) {
    const pending = `${sourceId}:${setCardId}`;
    setPendingKey(pending);
    setMessage(null);

    try {
      const response = await apiPostJson<
        { source: PromoSourceDto },
        { setCardId: string }
      >(`/api/run-promos/${sourceId}/claim`, { setCardId });
      setSources((current) =>
        current.map((source) =>
          source.id === response.source.id ? response.source : source,
        ),
      );
      setMessage("Promo-Karte wurde deiner Run-Sammlung hinzugefügt.");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Promo-Karte konnte nicht geclaimt werden."));
    } finally {
      setPendingKey(null);
    }
  }

  async function applyProgression(checkpointId: string) {
    setPendingKey(`checkpoint:${checkpointId}`);
    setMessage(null);

    try {
      const payload = await apiPostJson<ApplyRunProgressionResponse, Record<string, never>>(
        `/api/v1/runs/${progressionState.run.id}/progression/${checkpointId}/apply`,
        {},
      );
      setProgressionState(payload.progression);
      setMessage("Fortschritt angewendet. Neue Booster, Promos und Events sind freigeschaltet.");
    } catch (error) {
      setMessage(
        getApiErrorMessage(error, "Run-Fortschritt konnte nicht angewendet werden."),
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function generateProgression() {
    setPendingKey("progression:generate");
    setMessage(null);

    try {
      const payload = await apiPostJson<
        GenerateRunProgressionResponse,
        {
          count: number;
          setsPerCheckpoint: number;
          includePromos: boolean;
          includeTournamentPacks: boolean;
        }
      >(`/api/v1/runs/${progressionState.run.id}/progression/generate`, {
        count: 5,
        setsPerCheckpoint: 1,
        includePromos: true,
        includeTournamentPacks: true,
      });
      setProgressionState(payload.progression);
      setMessage(`${payload.generatedCheckpoints.length} neue History-Schritte generiert.`);
    } catch (error) {
      setMessage(
        getApiErrorMessage(error, "Run-Fortschritt konnte nicht generiert werden."),
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="app-shell relative min-h-screen overflow-x-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />
      <div className="relative z-10 flex min-h-screen flex-col lg:block">
        <aside className="app-sidebar border-b border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(8,11,15,0.78),rgba(5,7,10,0.9))] shadow-[18px_0_46px_rgba(0,0,0,0.34)] backdrop-blur-[18px] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[196px] lg:border-b-0 lg:border-r lg:border-r-[rgba(255,255,255,0.08)]">
          <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-0 lg:py-0">
            <div className="border-b border-[rgba(255,255,255,0.08)] lg:px-6 lg:pb-8 lg:pt-6">
              <ConsoleBrand size="sm" />
            </div>

            <nav className="hidden lg:block lg:pt-2">
              {consoleNavItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  iconName={item.iconName}
                  active={item.href === "/packs"}
                />
              ))}
            </nav>

            <ConsoleSidebarUtilityActions />
          </div>

          <nav
            className="grid border-t border-[rgba(255,255,255,0.08)] lg:hidden"
            style={{ gridTemplateColumns: `repeat(${consoleNavItems.length}, minmax(0, 1fr))` }}
          >
            {consoleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={classes(
                  "flex flex-col items-center gap-2 px-1 py-3 text-[0.58rem] uppercase tracking-[0.16em] transition",
                  item.href === "/packs"
                    ? "bg-[rgba(207,91,66,0.14)] text-[#f4d9c4]"
                    : "text-[#aa9983] hover:bg-[rgba(255,255,255,0.04)]",
                )}
              >
                <AssetIcon name={item.iconName} className="h-5 w-5 text-current" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="relative flex-1 overflow-hidden lg:ml-[196px]">
          <div className="app-workspace relative mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-6 px-3 pb-8 pt-3 sm:px-4 lg:px-5">
            <div className="app-topbar flex min-h-[52px] items-center justify-end rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(7,10,14,0.72)] px-3 py-2 shadow-[0_18px_38px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-4">
              <ConsoleGlobalStatusBar viewer={{ displayName: viewer.displayName }} />
            </div>
            <header className="grid gap-8 rounded-[28px] border border-[rgba(255,255,255,0.10)] bg-[rgba(8,11,16,0.78)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl xl:grid-cols-[360px_520px_minmax(0,1fr)] xl:items-end">
              <div className="hidden min-h-[300px] items-center justify-center xl:flex">
                <div className="relative h-64 w-44 rotate-[-5deg] rounded-[18px] border border-[rgba(207,91,66,0.42)] bg-[linear-gradient(150deg,rgba(55,28,18,0.96),rgba(10,13,18,0.96))] shadow-[0_22px_60px_rgba(0,0,0,0.45)]">
                  <div className="absolute inset-4 rounded-[14px] border border-[rgba(255,255,255,0.12)] bg-[radial-gradient(circle_at_50%_30%,rgba(226,139,99,0.38),transparent_42%),rgba(255,255,255,0.035)]" />
                  <AssetIcon
                    name="package"
                    className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-[#e2bd88]"
                  />
                </div>
              </div>

              <div className="max-w-[520px]">
            <p className="text-xs uppercase tracking-[0.28em] text-[#cf6a45]">
              Packs / Promo-Karten
            </p>
            <h1 className="mt-3 font-display text-4xl uppercase tracking-[0.04em] text-[#f5debd] sm:text-5xl">
              Historische Promos
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#c9b79f]">
              Freigeschaltete Promo-Quellen sind dauerhaft nutzbar. Wenn du
              historisch zehn Magazine oder Kinotickets gekauft hättest, kannst
              du hier dieselbe Promo auch mehrfach claimen.
            </p>

                <div className="mt-7 flex max-w-[320px] rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] p-1 text-xs uppercase tracking-[0.16em]">
                  <Link
                    href="/packs"
                    className="flex-1 rounded-full px-3 py-2 text-center text-[#bfa88e] transition hover:text-[#fff0df]"
                  >
                    Booster
                  </Link>
                  <span className="flex-1 rounded-full bg-[rgba(207,91,66,0.18)] px-3 py-2 text-center text-[#fff0df]">
                    Promo-Karten
                  </span>
                </div>
              </div>

              <div className="hidden xl:block" />
            </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[rgba(8,11,16,0.76)] p-5 backdrop-blur-xl lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.24em] text-[#cb5c44]">
                Chronologische Promo-Reihe
              </p>
              <span className="text-xs uppercase tracking-[0.16em] text-[#a99680]">
                {sources.length} Quellen
              </span>
            </div>
            <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={classes(
                    "min-w-[210px] rounded-[16px] border p-3 transition",
                    source.isUnlocked
                      ? "border-[rgba(207,91,66,0.42)] bg-[rgba(207,91,66,0.10)]"
                      : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] opacity-80",
                  )}
                >
                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[#a99680]">
                    {formatDate(source.availableFrom)}
                  </p>
                  <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-[#f0ddc3]">
                    {source.name}
                  </p>
                  <p className="mt-2 text-xs text-[#d0b38c]">
                    {source.isUnlocked ? "Freigeschaltet" : "Gesperrt"}
                  </p>
                </div>
              ))}
              {sources.length === 0 ? (
                <div className="min-w-full rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[#cbb79e]">
                  Noch keine Promo-Quellen importiert. Der Promo-Backfill stellt
                  McDonald&apos;s, Jump, Game, Manga und ähnliche Quellen wieder her.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[rgba(8,11,16,0.76)] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#cf6a45]">
                  Run-Freischaltungen
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#f0ddc3]">
                  {progressionState.run.name}
                </h2>
              </div>
              <div className="text-right text-xs uppercase tracking-[0.16em] text-[#aa9983]">
                <p>{viewer.displayName}</p>
                <p className="mt-1 text-[#d0b38c]">{progressionState.run.viewerRole}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#a99680]">
                  Aktiver History-Stand
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f0ddc3]">
                  {formatDate(progressionState.run.historyCursor)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#a99680]">
                    Letzter Schritt
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-[#f0ddc3]">
                    {progressionState.currentCheckpoint?.title ?? "Noch kein Checkpoint angewendet"}
                  </p>
                </div>
                <div className="rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[#a99680]">
                    Nächster Schritt
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-[#f0ddc3]">
                    {progressionState.nextCheckpoint?.title ?? "Keine geplanten Schritte"}
                  </p>
                </div>
              </div>

              {canApplyProgression ? (
                <button
                  type="button"
                  onClick={generateProgression}
                  disabled={pendingKey === "progression:generate"}
                  className="rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(13,16,21,0.88)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#ceb99f] transition hover:border-[rgba(202,80,59,0.28)] hover:text-[#f2dfcb] disabled:cursor-wait disabled:opacity-60"
                >
                  {pendingKey === "progression:generate"
                    ? "Generiert..."
                    : "Nächste Schritte generieren"}
                </button>
              ) : null}
            </div>

            {readyCheckpoint ? (
              <div className="mt-5 rounded-[18px] border border-[rgba(207,91,66,0.24)] bg-[rgba(207,91,66,0.08)] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[#e28b63]">
                  Bereit zum Anwenden
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[#f6dfc0]">
                  {readyCheckpoint.title}
                </h3>
                <div className="mt-3 grid gap-2 text-sm text-[#cbb79e]">
                  {[
                    ["Booster-Sets", readyCheckpoint.unlocks.filter((unlock) => unlock.type === "SET")],
                    [
                      "Promo-Quellen",
                      readyCheckpoint.unlocks.filter((unlock) => unlock.type === "PROMO_SOURCE"),
                    ],
                    [
                      "History Events",
                      readyCheckpoint.unlocks.filter((unlock) => unlock.type === "HISTORY_EVENT"),
                    ],
                    [
                      "Reward-Konfigurationen",
                      readyCheckpoint.unlocks.filter((unlock) => unlock.type === "REWARD"),
                    ],
                  ].map(([label, unlocks]) => (
                    <p key={label as string}>
                      <span className="text-[#e0c19d]">{label as string}:</span>{" "}
                      {(unlocks as typeof readyCheckpoint.unlocks)
                        .map(
                          (unlock) =>
                            unlock.setName ??
                            unlock.promoSourceName ??
                            unlock.historyEventTitle ??
                            (unlock.rewardConfig ? "Credits / Tournament Packs" : unlock.type),
                        )
                        .join(", ") || "keine"}
                    </p>
                  ))}
                </div>
                {canApplyProgression ? (
                  <button
                    type="button"
                    onClick={() => applyProgression(readyCheckpoint.id)}
                    disabled={pendingKey === `checkpoint:${readyCheckpoint.id}`}
                    className="mt-4 rounded-full bg-[#cf5b42] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#fff2e4] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    Fortschritt anwenden
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[#cbb79e]">
                Kein Checkpoint ist aktuell bereit. Nach einem abgeschlossenen
                Turnier kann ein Organizer den nächsten History-Schritt anwenden.
              </p>
            )}
          </div>

          <aside className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[rgba(8,11,16,0.76)] p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.22em] text-[#cf6a45]">
              Neueste Zugänge
            </p>
            <div className="mt-4 space-y-3 text-sm text-[#ccb89e]">
              {recentCollectionCards.slice(0, 5).map((card) => (
                <div key={card.id} className="flex items-center gap-3">
                  <div className="relative h-14 w-10 overflow-hidden rounded border border-[rgba(255,255,255,0.10)] bg-[#111820]">
                    {card.imageUrl ? (
                      <Image
                        src={card.imageUrl}
                        alt={card.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="line-clamp-1 text-sm text-[#f0ddc3]">{card.name}</p>
                    <p className="text-xs text-[#a99680]">
                      {card.setCode ?? "Promo"} / {card.rarity ?? "Unknown"}
                    </p>
                  </div>
                </div>
              ))}
              {recentCollectionCards.length === 0 ? (
                <p>Noch keine neuen Karten in dieser Runde.</p>
              ) : null}
              {message ? (
                <p className="rounded-[14px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0ddc3]">
                  {message}
                </p>
              ) : null}
            </div>
          </aside>
        </section>

        <section className="grid gap-5">
          {sources.length === 0 ? (
            <div className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[rgba(8,11,16,0.76)] p-8 text-center text-[#cbb79e] backdrop-blur-xl">
              Noch keine Promo-Quelle freigeschaltet. Sobald ein Checkpoint
              McDonald&apos;s, Jump, Movie/DVD oder ähnliche Quellen freigibt, landen
              sie hier.
            </div>
          ) : null}

          {sources.map((source) => (
            <article
              key={source.id}
              className="rounded-[24px] border border-[rgba(255,255,255,0.10)] bg-[rgba(8,11,16,0.78)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl"
            >
              <div className="flex flex-col gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#cf6a45]">
                    {getClaimModeLabel(source)} / {formatDate(source.availableFrom)}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#f0ddc3]">
                    {source.name}
                  </h2>
                  {source.description ? (
                    <p className="mt-2 max-w-3xl text-sm text-[#c9b79f]">
                      {source.description}
                    </p>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#d6bea1]">
                  <AssetIcon name="package" className="h-4 w-4" />
                  {source.cards.length} Karten
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                {source.cards.map((card) => {
                  const key = `${source.id}:${card.setCardId}`;
                  const disabled =
                    !source.isUnlocked ||
                    source.sourceType === "PRIZE_PROMO" ||
                    source.sourceType === "PACK_REWARD" ||
                    source.claimMode === "ORGANIZER_ONLY" ||
                    pendingKey === key;

                  return (
                    <div
                      key={card.setCardId}
                      className="overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.035)]"
                    >
                      <div className="relative aspect-[0.69] bg-[#111820]">
                        {card.imageUrl ? (
                          <Image
                            src={card.imageUrl}
                            alt={card.name}
                            fill
                            sizes="(max-width: 768px) 50vw, 220px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[#d8c3a8]">
                            {card.name}
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 p-3">
                        <div>
                          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-[#f1dfc8]">
                            {card.name}
                          </h3>
                          <p className="mt-1 text-xs text-[#a99680]">
                            {card.setCode} / {card.rarity ?? "Unknown"}
                          </p>
                          <p className="mt-1 text-xs text-[#d0b38c]">
                            {card.claimedCopies}x geclaimt
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => claim(source.id, card.setCardId)}
                          className={classes(
                            "w-full rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                            disabled
                              ? "cursor-not-allowed bg-[rgba(255,255,255,0.08)] text-[#8c7c68]"
                              : "bg-[#cf5b42] text-[#fff2e4] hover:brightness-110",
                          )}
                        >
                          {source.isUnlocked
                            ? pendingKey === key
                              ? "Claimt..."
                              : "Claimen"
                            : "Gesperrt"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
          </div>
        </main>
      </div>
    </div>
  );
}
