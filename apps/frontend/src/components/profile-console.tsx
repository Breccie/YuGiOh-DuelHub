"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { getApiErrorMessage } from "@/lib/api-client";
import type { PublicProfile, ViewerSession } from "@/lib/app-dtos";
import { duelClient } from "@/lib/duel-client";
import { friendClient } from "@/lib/friend-client";

export function ProfileConsole({
  session,
  profile,
  isOwnProfile,
}: {
  session: ViewerSession;
  profile: PublicProfile;
  isOwnProfile: boolean;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"friend" | "duel" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function sendFriendRequest() {
    setBusyAction("friend");
    setFeedback(null);

    try {
      await friendClient.create({
          duelistId: profile.duelistId,
      });

      setFeedback("Freundschaftsanfrage verschickt.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Freundschaftsanfrage fehlgeschlagen."));
    } finally {
      setBusyAction(null);
    }
  }

  async function sendDuelRequest() {
    setBusyAction("duel");
    setFeedback(null);

    try {
      await duelClient.create({
          opponentDuelistId: profile.duelistId,
          message: `Lass uns ein Match in EDOPro ausmachen, ${profile.displayName}.`,
      });

      setFeedback("Duellanfrage angelegt.");
      startTransition(() => router.push("/duels"));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Duellanfrage fehlgeschlagen."));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <DuelConsoleScaffold
      activePath={`/profiles/${profile.duelistId}`}
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        { icon: "users", label: "Profil", value: profile.duelistId },
        { icon: "book", label: "Sammlung", value: `${profile.counts.uniqueCards} Karten` },
        { icon: "hourglass", label: "Ära", value: profile.favoriteEra ?? "Offen" },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Panel kicker="Duelist" title={profile.displayName}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone="gold">{profile.duelistId}</StatusPill>
              <StatusPill tone={profile.isPublic ? "slate" : "ember"}>
                {profile.isPublic ? "Öffentlich" : "Privat"}
              </StatusPill>
            </div>

            <p className="ui-copy-strong text-sm">
              {profile.bio || "Dieses Profil hat noch keine Bio hinterlegt."}
            </p>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Freunde", String(profile.counts.friends)],
                ["Decks", String(profile.counts.decks)],
                ["Unique", String(profile.counts.uniqueCards)],
                ["Kopien", String(profile.counts.copies)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-[#9f8c77]">
                    {label}
                  </p>
                  <p className="mt-3 font-display text-[2rem] leading-none text-[#f0dcc0]">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {isOwnProfile ? (
                <button
                  type="button"
                  className="ui-button-primary"
                  onClick={() => router.push("/settings")}
                >
                  Profil bearbeiten
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ui-button-primary"
                    onClick={sendFriendRequest}
                    disabled={busyAction !== null}
                  >
                    {busyAction === "friend" ? "Sende..." : "Freund hinzufügen"}
                  </button>
                  <button
                    type="button"
                    className="ui-button-secondary"
                    onClick={sendDuelRequest}
                    disabled={busyAction !== null}
                  >
                    {busyAction === "duel" ? "Plane..." : "Duell anfragen"}
                  </button>
                </>
              )}
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel kicker="Showcase" title={profile.showcase.binderName ?? "Sammlung"}>
            {profile.showcase.highlightedCards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.showcase.highlightedCards.map((card, index) => (
                  <article
                    key={`${card.collectionEntryId ?? card.cardName ?? index}`}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                  >
                    <p className="font-display text-[1.3rem] text-[#f0dcc0]">
                      {card.cardName ?? "Unbekannte Karte"}
                    </p>
                    <p className="mt-2 text-sm text-[#baa58a]">
                      {card.rarity ?? "Karte"}{card.setCode ? ` · ${card.setCode}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                Noch keine Showcase-Karten freigegeben.
              </div>
            )}
          </Panel>

          <Panel kicker="Decks" title="Öffentliche Listen">
            {profile.decks.length > 0 ? (
              <div className="space-y-3">
                {profile.decks.map((deck) => (
                  <article
                    key={deck.id}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-[#f0dfcc]">{deck.name}</p>
                        <p className="mt-1 text-sm text-[#baa58a]">
                          {deck.cardCount} Karten · {deck.banlistName ?? "Ohne Banlist"}
                        </p>
                      </div>
                      <StatusPill tone="slate">{deck.formatName ?? "Format"}</StatusPill>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                Noch keine Decklisten veröffentlicht.
              </div>
            )}
          </Panel>
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
