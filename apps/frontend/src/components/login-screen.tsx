"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";

type RecentAccount = {
  id: string;
  duelistId: string;
  displayName: string;
  favoriteEra: string | null;
};

export function LoginScreen({
  recentAccounts,
  showDemoAccounts,
}: {
  recentAccounts: RecentAccount[];
  showDemoAccounts: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [duelistId, setDuelistId] = useState(recentAccounts[0]?.duelistId ?? "");
  const [password, setPassword] = useState(showDemoAccounts ? "Yugi001" : "");
  const [displayName, setDisplayName] = useState("");
  const [favoriteEra, setFavoriteEra] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    try {
      const endpoint = mode === "LOGIN" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "LOGIN"
          ? {
              duelistId,
              password,
              rememberDevice,
              deviceLabel: "Web App",
            }
          : {
              duelistId,
              password,
              displayName,
              favoriteEra: favoriteEra.trim() || null,
            };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Anmeldung fehlgeschlagen.");
      }

      startTransition(() => {
        router.replace("/campaigns");
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-shell relative min-h-screen overflow-hidden bg-[#04060a] text-[#f2e5d1]">
      <div className="app-background" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1320px] items-center px-4 py-8 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.04fr_0.96fr]">
          <section className="hero-surface rounded-[32px] px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
            <p className="ui-kicker">Duel Hub</p>
            <h1 className="font-display inscription-text mt-5 text-[3.3rem] leading-[0.92] sm:text-[4.7rem]">
              Profile, Trades, Duelle und Turniere in einer App.
            </h1>
            <p className="ui-copy-strong mt-6 max-w-[40rem] text-[1rem]">
              Melde dich mit deiner Duelist-ID an, öffne Showcase-Binder, plane EDOPro-
              Matches und exportiere Decks direkt aus deiner Kampagne.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ["Online-Profile", "Öffentliche Sammlungen, Deck-Übersichten und Freundesystem."],
                ["Turniere", "Swiss-Runden, Standings, Pairings und Match-Historie."],
                ["EDOPro-Handoff", "Deckexport, Terminabsprachen und Match-Verknüpfungen."],
              ].map(([title, detail]) => (
                <article
                  key={title}
                  className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-4"
                >
                  <p className="font-display text-[1.35rem] text-[#f0dcc0]">{title}</p>
                  <p className="ui-copy mt-3 text-sm">{detail}</p>
                </article>
              ))}
            </div>

            {showDemoAccounts ? (
              <div className="mt-8 rounded-[24px] border border-[rgba(208,170,110,0.16)] bg-[rgba(255,255,255,0.03)] px-5 py-4">
              <div className="flex items-center gap-3 text-[#f2dfc8]">
                <AssetIcon name="users" className="h-5 w-5 text-[#d8bc91]" />
                <p className="text-sm font-semibold uppercase tracking-[0.16em]">
                  Seed-Accounts für den Start
                </p>
              </div>
              <p className="ui-copy mt-3 text-sm">
                Debug-Konto in der lokalen Seed-Datenbank:{" "}
                <code className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[#f3e0c5]">
                  YUGI-001 / Yugi001
                </code>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {recentAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      setDuelistId(account.duelistId);
                      setMode("LOGIN");
                    }}
                    className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#ead9c3] transition hover:border-[rgba(207,91,66,0.28)]"
                  >
                    {account.duelistId}
                  </button>
                ))}
              </div>
              </div>
            ) : null}
          </section>

          <section className="panel-surface rounded-[32px] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "LOGIN", label: "Anmelden" },
                { id: "REGISTER", label: "Account anlegen" },
              ].map((tab) => {
                const active = mode === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id as typeof mode)}
                    className={
                      active
                        ? "ui-button-primary text-sm"
                        : "ui-button-neutral text-sm"
                    }
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="ui-kicker">Duelist-ID</span>
                <input
                  className="ui-input mt-2"
                  value={duelistId}
                  onChange={(event) => setDuelistId(event.target.value)}
                  placeholder="YUGI-001"
                  autoComplete="username"
                />
              </label>

              {mode === "REGISTER" ? (
                <label className="block">
                  <span className="ui-kicker">Anzeigename</span>
                  <input
                    className="ui-input mt-2"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Dein Duelist-Name"
                    autoComplete="nickname"
                  />
                </label>
              ) : null}

              {mode === "REGISTER" ? (
                <label className="block">
                  <span className="ui-kicker">Lieblings-Ära</span>
                  <input
                    className="ui-input mt-2"
                    value={favoriteEra}
                    onChange={(event) => setFavoriteEra(event.target.value)}
                    placeholder="DM, GX, 5D's ..."
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="ui-kicker">Passwort</span>
                <input
                  className="ui-input mt-2"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Passwort"
                  autoComplete={mode === "LOGIN" ? "current-password" : "new-password"}
                />
              </label>

              {mode === "LOGIN" ? (
                <label className="ui-checkrow flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-[#f0dfcc]">Gerät merken</span>
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(event) => setRememberDevice(event.target.checked)}
                  />
                </label>
              ) : null}

              {errorMessage ? (
                <div className="rounded-[18px] border border-[rgba(204,97,78,0.22)] bg-[rgba(141,61,48,0.14)] px-4 py-3 text-sm text-[#ffd8cf]">
                  {errorMessage}
                </div>
              ) : null}

              <button type="submit" className="ui-button-primary w-full" disabled={pending}>
                {pending
                  ? "Wird verarbeitet..."
                  : mode === "LOGIN"
                    ? "Anmelden"
                    : "Account anlegen"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
