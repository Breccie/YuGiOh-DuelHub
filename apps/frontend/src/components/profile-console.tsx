"use client";

import Image from "next/image";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetIcon } from "@/components/asset-icon";
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

  const setupActions = isOwnProfile
    ? [
        !profile.bio
          ? { label: "Bio einrichten", href: "/settings", icon: "edit" as const }
          : null,
        !profile.showcase.binderName
          ? {
              label: "Showcase-Binder wählen",
              href: "/collection",
              icon: "book" as const,
            }
          : null,
        profile.decks.length === 0
          ? { label: "Erstes Deck bauen", href: "/decks", icon: "nav-decks" as const }
          : null,
      ].filter(Boolean)
    : [];

  return (
    <DuelConsoleScaffold
      activePath={`/profiles/${profile.duelistId}`}
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
        avatarImageUrl: session.avatarImageUrl,
      }}
      metrics={[
        { icon: "users", label: "Profil", value: profile.duelistId },
        { icon: "book", label: "Sammlung", value: `${profile.counts.uniqueCards} Karten` },
        { icon: "hourglass", label: "Ära", value: profile.favoriteEra ?? "Offen" },
      ]}
    >
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(120deg,rgba(16,20,28,0.96),rgba(7,9,13,0.94))] p-6 shadow-[0_34px_80px_rgba(0,0,0,0.44)] sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(207,91,66,0.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(214,164,92,0.12),transparent_34%)]" />
          <div className="relative grid gap-7 lg:grid-cols-[auto_minmax(0,1fr)_minmax(320px,0.72fr)] lg:items-center">
            <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-[rgba(214,164,92,0.32)] bg-[radial-gradient(circle,rgba(190,69,48,0.24),rgba(8,11,16,0.92)_68%)] text-[#e3bd82] shadow-[0_0_36px_rgba(190,69,48,0.18)]">
              {profile.avatarImageUrl ? <Image src={profile.avatarImageUrl} alt={`Profilbild von ${profile.displayName}`} fill sizes="112px" className="object-cover" unoptimized /> : <AssetIcon name="profile-signet" className="h-14 w-14 text-current" />}
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[#d7654c]">
                Duelist Showcase
              </p>
              <h1 className="font-display inscription-text mt-2 text-4xl leading-none text-[#f5dfc0] sm:text-5xl">
                {profile.displayName}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusPill tone="gold">{profile.duelistId}</StatusPill>
                <StatusPill tone={profile.isPublic ? "slate" : "ember"}>
                  {profile.isPublic ? "Öffentlich" : "Privat"}
                </StatusPill>
                <StatusPill tone="slate">{profile.favoriteEra ?? "Ära offen"}</StatusPill>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#d3c0a9]">
                {profile.bio ||
                  (isOwnProfile
                    ? "Ergänze eine Bio, damit andere Duelists deinen Spielstil und deine Lieblingsära kennenlernen."
                    : "Dieser Duelist hat noch keine Bio hinterlegt.")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Freunde", profile.counts.friends],
                ["Decks", profile.counts.decks],
                ["Karten", profile.counts.uniqueCards],
                ["Kopien", profile.counts.copies],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[rgba(3,5,8,0.42)] px-4 py-4"
                >
                  <p className="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f8c77]">
                    {label}
                  </p>
                  <p className="font-display mt-2 text-3xl leading-none text-[#f0dcc0]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-7 flex flex-wrap gap-3 border-t border-[rgba(255,255,255,0.08)] pt-5">
            {feedback ? (
              <div className="mr-auto rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : <span className="mr-auto" />}
            {isOwnProfile ? (
              <button type="button" className="ui-button-primary" onClick={() => router.push("/settings")}>
                Profil bearbeiten
              </button>
            ) : (
              <>
                <button type="button" className="ui-button-primary" onClick={sendFriendRequest} disabled={busyAction !== null}>
                  {busyAction === "friend" ? "Sende..." : "Freund hinzufügen"}
                </button>
                <button type="button" className="ui-button-secondary" onClick={sendDuelRequest} disabled={busyAction !== null}>
                  {busyAction === "duel" ? "Plane..." : "Duell anfragen"}
                </button>
              </>
            )}
          </div>
        </section>

        {setupActions.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-3">
            {setupActions.map((action) =>
              action ? (
                <button
                  key={action.href + action.label}
                  type="button"
                  onClick={() => router.push(action.href)}
                  className="flex items-center gap-3 rounded-[16px] border border-[rgba(214,164,92,0.2)] bg-[rgba(150,97,33,0.1)] px-4 py-4 text-left text-sm font-semibold text-[#f2d9b7] transition hover:border-[rgba(214,164,92,0.36)] hover:bg-[rgba(150,97,33,0.16)]"
                >
                  <AssetIcon name={action.icon} className="h-5 w-5 text-current" />
                  {action.label}
                </button>
              ) : null,
            )}
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
          <Panel kicker="Showcase-Binder" title={profile.showcase.binderName ?? "Noch nicht gewählt"}>
            {profile.showcase.binderName ? (
              <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
                <div className="relative mx-auto aspect-[62/100] w-full max-w-[180px] overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[#080b10] shadow-[0_24px_44px_rgba(0,0,0,0.42)]">
                  {profile.showcase.coverImageUrl ? (
                    <Image src={profile.showcase.coverImageUrl} alt={profile.showcase.coverName ?? profile.showcase.binderName} fill sizes="180px" className="object-cover" />
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {profile.showcase.highlightedCards.map((card, index) => (
                    <article key={`${card.collectionEntryId ?? card.cardName ?? index}`} className="min-w-0">
                      <div className="relative aspect-[59/86] overflow-hidden rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[#070a0f]">
                        {card.imageUrl ? <Image src={card.imageUrl} alt={card.cardName ?? "Showcase-Karte"} fill sizes="130px" unoptimized className="object-contain" /> : null}
                      </div>
                      <p className="mt-1.5 truncate text-xs font-semibold text-[#ead9c3]">{card.cardName ?? "Unbekannte Karte"}</p>
                      <p className="mt-0.5 truncate text-[0.56rem] uppercase tracking-[0.1em] text-[#9f8c77]">
                        {card.rarity ?? "Karte"}{card.setCode ? ` · ${card.setCode}` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                Kein Showcase-Binder veröffentlicht.
              </div>
            )}
          </Panel>

          <Panel kicker="Decks" title="Duelist Arsenal">
            {profile.decks.length > 0 ? (
              <div className="grid gap-3">
                {profile.decks.map((deck) => (
                  <article key={deck.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-4 rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-3">
                    <div className="relative aspect-[62/100] overflow-hidden rounded-[8px] bg-[rgba(255,255,255,0.02)]">
                      <Image src={deck.deckBoxImageUrl} alt={`${deck.name} Deckbox`} fill sizes="76px" className="object-contain" />
                    </div>
                    <div className="min-w-0 py-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-base font-semibold text-[#f0dfcc]">{deck.name}</p>
                        <StatusPill tone="slate">{deck.formatName ?? "Format"}</StatusPill>
                      </div>
                      <p className="mt-2 text-xs text-[#baa58a]">{deck.banlistName ?? "Ohne Bannliste"}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-[#c8b49b]">
                        <span>Main {deck.mainCount}</span>
                        <span>Extra {deck.extraCount}</span>
                        <span>Side {deck.sideCount}</span>
                      </div>
                      <p className="mt-2 text-[0.58rem] text-[#806f5f]">
                        Aktualisiert {new Intl.DateTimeFormat("de-DE").format(new Date(deck.updatedAt))}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ui-empty rounded-[18px] px-4 py-5 text-sm">
                Noch keine Decklisten vorhanden.
              </div>
            )}
          </Panel>
        </section>
      </div>
    </DuelConsoleScaffold>
  );
}
