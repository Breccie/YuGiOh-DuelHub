"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import {
  readDesktopPreferencesFromStorage,
  writeDesktopPreferencesToStorage,
  type GraphicsMode,
} from "@/lib/desktop-preferences";
import { Panel, StatPill, StatusPill } from "@/components/panel";
import {
  type AssetCacheSnapshot,
  assetCacheClient,
} from "@/lib/asset-cache-client";
import { authClient } from "@/lib/auth-client";
import { getApiErrorMessage } from "@/lib/api-client";
import type { FriendRequestDto, PlayGroupRunDto, ViewerSession } from "@/lib/app-dtos";
import { friendClient } from "@/lib/friend-client";
import { profileClient } from "@/lib/profile-client";
import { runClient } from "@/lib/run-client";

type BinderOption = {
  id: string;
  name: string;
};

type DeviceSession = {
  id: string;
  deviceLabel: string | null;
  userAgent: string | null;
  rememberDevice: boolean;
  expiresAt: string;
  lastSeenAt: string;
};

function formatGermanDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: value >= 1024 * 1024 ? 1 : 0,
  }).format(value >= 1024 * 1024 ? value / (1024 * 1024) : value / 1024);
}

function formatCacheSize(value: number) {
  if (value >= 1024 * 1024) {
    return `${formatBytes(value)} MB`;
  }

  if (value >= 1024) {
    return `${formatBytes(value)} KB`;
  }

  return `${new Intl.NumberFormat("de-DE").format(value)} B`;
}

export function SettingsConsole({
  session,
  profile,
  binderOptions,
  deviceSessions,
  friendRequests,
  activeRun,
}: {
  session: ViewerSession;
  profile: {
    displayName: string;
    bio: string | null;
    favoriteEra: string | null;
    avatarKey: string;
    isPublic: boolean;
    showcaseBinderId: string | null;
  };
  binderOptions: BinderOption[];
  deviceSessions: DeviceSession[];
  friendRequests: FriendRequestDto[];
  activeRun: PlayGroupRunDto;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [favoriteEra, setFavoriteEra] = useState(profile.favoriteEra ?? "");
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [showcaseBinderId, setShowcaseBinderId] = useState(profile.showcaseBinderId ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [desktopFeedback, setDesktopFeedback] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => readDesktopPreferencesFromStorage().reducedMotion,
  );
  const [graphicsMode, setGraphicsMode] = useState<GraphicsMode>(
    () => readDesktopPreferencesFromStorage().graphicsMode,
  );
  const [assetCache, setAssetCache] = useState<AssetCacheSnapshot | null>(null);
  const [assetCacheLoading, setAssetCacheLoading] = useState(true);
  const [assetCacheBusy, setAssetCacheBusy] = useState(false);
  const [assetCacheFeedback, setAssetCacheFeedback] = useState<string | null>(null);
  const [assetCacheError, setAssetCacheError] = useState<string | null>(null);
  const [defaultPackPrice, setDefaultPackPrice] = useState(String(activeRun.defaultPackPrice));
  const [defaultDisplaySize, setDefaultDisplaySize] = useState(String(activeRun.defaultDisplaySize));
  const [freePacksPerSetUnlock, setFreePacksPerSetUnlock] = useState(
    String(activeRun.freePacksPerSetUnlock),
  );
  const [tournamentWinnerCredits, setTournamentWinnerCredits] = useState(
    String(activeRun.tournamentWinnerCredits),
  );
  const [tournamentRunnerUpCredits, setTournamentRunnerUpCredits] = useState(
    String(activeRun.tournamentRunnerUpCredits),
  );
  const [tournamentParticipationCredits, setTournamentParticipationCredits] = useState(
    String(activeRun.tournamentParticipationCredits),
  );
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignFeedback, setCampaignFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAssetCache() {
      setAssetCacheLoading(true);
      setAssetCacheError(null);

      try {
        const data = await assetCacheClient.get();

        if (!active) {
          return;
        }

        setAssetCache(data.cache);
      } catch (error) {
        if (!active) {
          return;
        }

        setAssetCacheError(getApiErrorMessage(error, "Asset-Cache konnte nicht geladen werden."));
      } finally {
        if (active) {
          setAssetCacheLoading(false);
        }
      }
    }

    void loadAssetCache();

    return () => {
      active = false;
    };
  }, []);

  async function saveProfile() {
    setSaving(true);
    setFeedback(null);

    try {
      await profileClient.update({
        displayName,
        bio,
        favoriteEra,
        isPublic,
        showcaseBinderId: showcaseBinderId || null,
      });
      setFeedback("Profil gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Profil konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await authClient.logout();

    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  async function respond(requestId: string, action: "accept" | "decline") {
    try {
      await friendClient.decide(requestId, { action });
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Freundschaftsanfrage konnte nicht verarbeitet werden."));
    }
  }

  function saveDesktopPreferences() {
    writeDesktopPreferencesToStorage({
      reducedMotion,
      graphicsMode,
    });
    setDesktopFeedback("Desktop-Modus gespeichert.");
  }

  async function saveCampaignSettings() {
    setCampaignSaving(true);
    setCampaignFeedback(null);

    const parsedPackPrice = Number(defaultPackPrice);
    const parsedDisplaySize = Number(defaultDisplaySize);
    const parsedFreePacks = Number(freePacksPerSetUnlock);
    const parsedWinnerCredits = Number(tournamentWinnerCredits);
    const parsedRunnerUpCredits = Number(tournamentRunnerUpCredits);
    const parsedParticipationCredits = Number(tournamentParticipationCredits);

    if (
      !Number.isInteger(parsedPackPrice) ||
      !Number.isInteger(parsedDisplaySize) ||
      !Number.isInteger(parsedFreePacks) ||
      !Number.isInteger(parsedWinnerCredits) ||
      !Number.isInteger(parsedRunnerUpCredits) ||
      !Number.isInteger(parsedParticipationCredits)
    ) {
      setCampaignSaving(false);
      setCampaignFeedback("Bitte ganze Zahlen fuer Packpreise, Gratispacks und Turnier-Credits eingeben.");
      return;
    }

    try {
      const updatedRun = await runClient.updateSettings(activeRun.id, {
        defaultPackPrice: parsedPackPrice,
        defaultDisplaySize: parsedDisplaySize,
        freePacksPerSetUnlock: parsedFreePacks,
        tournamentWinnerCredits: parsedWinnerCredits,
        tournamentRunnerUpCredits: parsedRunnerUpCredits,
        tournamentParticipationCredits: parsedParticipationCredits,
      });

      setDefaultPackPrice(String(updatedRun.defaultPackPrice));
      setDefaultDisplaySize(String(updatedRun.defaultDisplaySize));
      setFreePacksPerSetUnlock(String(updatedRun.freePacksPerSetUnlock));
      setTournamentWinnerCredits(String(updatedRun.tournamentWinnerCredits));
      setTournamentRunnerUpCredits(String(updatedRun.tournamentRunnerUpCredits));
      setTournamentParticipationCredits(String(updatedRun.tournamentParticipationCredits));
      setCampaignFeedback("Kampagnen-Einstellungen gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setCampaignFeedback(
        getApiErrorMessage(error, "Kampagnen-Einstellungen konnten nicht gespeichert werden."),
      );
    } finally {
      setCampaignSaving(false);
    }
  }

  async function refreshAssetCache(feedbackMessage?: string) {
    setAssetCacheLoading(true);
    setAssetCacheError(null);

    try {
      const data = await assetCacheClient.get();

      setAssetCache(data.cache);
      setAssetCacheFeedback(feedbackMessage ?? "Asset-Cache aktualisiert.");
    } catch (error) {
      setAssetCacheError(getApiErrorMessage(error, "Asset-Cache konnte nicht geladen werden."));
    } finally {
      setAssetCacheLoading(false);
    }
  }

  async function clearAssetCache() {
    setAssetCacheBusy(true);
    setAssetCacheError(null);

    try {
      const data = await assetCacheClient.clear();

      setAssetCache(data.cache);
      setAssetCacheFeedback("Asset-Cache geleert.");
    } catch (error) {
      setAssetCacheError(getApiErrorMessage(error, "Asset-Cache konnte nicht geleert werden."));
    } finally {
      setAssetCacheBusy(false);
    }
  }

  async function openAssetCacheDirectory() {
    if (!assetCache?.cacheDirectory) {
      setAssetCacheError("Kein Cache-Ordner verfügbar.");
      return;
    }

    const opened = await window.desktopShell?.openPath?.(assetCache.cacheDirectory);

    if (!opened) {
      setAssetCacheError("Der Cache-Ordner konnte nicht geöffnet werden.");
      return;
    }

    setAssetCacheFeedback("Cache-Ordner geöffnet.");
  }

  return (
    <DuelConsoleScaffold
      activePath="/settings"
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        { icon: "users", label: "Duelist-ID", value: session.duelistId },
        { icon: "hourglass", label: "Lieblings-Ära", value: favoriteEra || "Nicht gesetzt" },
        { icon: "book", label: "Showcase", value: showcaseBinderId ? "Aktiv" : "Offen" },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Panel kicker="Profil" title="Desktop-Einstellungen">
          <div className="grid gap-4">
            <label className="block">
              <span className="ui-kicker">Anzeigename</span>
              <input
                className="ui-input mt-2"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Bio</span>
              <textarea
                className="ui-input mt-2 min-h-[120px]"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Lieblings-Ära</span>
              <input
                className="ui-input mt-2"
                value={favoriteEra}
                onChange={(event) => setFavoriteEra(event.target.value)}
                placeholder="DM, GX, 5D's ..."
              />
            </label>
            <label className="block">
              <span className="ui-kicker">Showcase-Binder</span>
              <select
                className="ui-input mt-2"
                value={showcaseBinderId}
                onChange={(event) => setShowcaseBinderId(event.target.value)}
              >
                <option value="">Kein Showcase-Binder</option>
                {binderOptions.map((binder) => (
                  <option key={binder.id} value={binder.id}>
                    {binder.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-checkrow flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#f0dfcc]">Profil öffentlich anzeigen</span>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
              />
            </label>

            <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
              <p className="ui-kicker">Performance</p>
              <div className="mt-4 grid gap-4">
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Grafikmodus</span>
                  <select
                    className="ui-input mt-2"
                    value={graphicsMode}
                    onChange={(event) => setGraphicsMode(event.target.value as GraphicsMode)}
                  >
                    <option value="AUTO">Automatisch</option>
                    <option value="BALANCED">Ausgewogen</option>
                    <option value="LOW">Leicht</option>
                  </select>
                </label>

                <label className="ui-checkrow flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-[#f0dfcc]">Reduzierte Bewegung</span>
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={(event) => setReducedMotion(event.target.checked)}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
              <p className="ui-kicker">Kampagne</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Packpreis</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={defaultPackPrice}
                    onChange={(event) => setDefaultPackPrice(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Display-Groesse</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={defaultDisplaySize}
                    onChange={(event) => setDefaultDisplaySize(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Gratispacks je neuem Pack</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={freePacksPerSetUnlock}
                    onChange={(event) => setFreePacksPerSetUnlock(event.target.value)}
                  />
                </label>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#baa58a]">
                Beim Freischalten eines neuen Booster-Sets bekommen alle Kampagnenmitglieder
                diese Anzahl als kostenlose Reward-Packs. Standard ist ein Display.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 1</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={tournamentWinnerCredits}
                    onChange={(event) => setTournamentWinnerCredits(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 2</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={tournamentRunnerUpCredits}
                    onChange={(event) => setTournamentRunnerUpCredits(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Credits Platz 3-8</span>
                  <input
                    className="ui-input mt-2"
                    inputMode="numeric"
                    value={tournamentParticipationCredits}
                    onChange={(event) => setTournamentParticipationCredits(event.target.value)}
                  />
                </label>
              </div>
              <p className="mt-3 text-sm leading-7 text-[#baa58a]">
                Diese Turnier-Credits werden in neu generierte Kampagnen-Checkpoints geschrieben
                und dienen als Pack-Währung für den freigeschalteten Shop.
              </p>
              {campaignFeedback ? (
                <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                  {campaignFeedback}
                </div>
              ) : null}
              <button
                className="ui-button-secondary mt-4"
                type="button"
                disabled={campaignSaving}
                onClick={() => void saveCampaignSettings()}
              >
                {campaignSaving ? "Speichert..." : "Kampagne speichern"}
              </button>
            </div>

            <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
              <p className="ui-kicker">Asset-Cache</p>
              <p className="mt-3 text-sm leading-7 text-[#baa58a]">
                Karten- und Packbilder werden bei Bedarf geladen und lokal zwischengespeichert.
                So bleibt die App klein und reagiert nach dem ersten Laden deutlich schneller.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <StatPill
                  label="Cache-Größe"
                  value={assetCacheLoading ? "Wird gelesen..." : formatCacheSize(assetCache?.totalBytes ?? 0)}
                  tone="teal"
                />
                <StatPill
                  label="Gespeicherte Assets"
                  value={assetCacheLoading ? "..." : new Intl.NumberFormat("de-DE").format(assetCache?.assetCount ?? 0)}
                  tone="gold"
                />
              </div>

              <div className="mt-4 grid gap-3 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#f0dfcc]">Status</span>
                  <StatusPill tone={assetCacheLoading ? "slate" : assetCacheError ? "ember" : "teal"}>
                    {assetCacheLoading
                      ? "Wird gelesen"
                      : assetCacheError
                        ? "Fehler"
                        : assetCache && assetCache.assetCount > 0
                          ? "Bereit"
                          : "Leer"}
                  </StatusPill>
                </div>
                <p className="text-sm text-[#baa58a]">
                  {assetCache?.lastUpdatedAt
                    ? `Zuletzt aktualisiert ${formatGermanDateTime(new Date(assetCache.lastUpdatedAt).toISOString())}`
                    : "Noch keine Assets im lokalen Cache."}
                </p>
                <p className="break-all font-mono text-xs text-[#9f8c77]">
                  {assetCache?.cacheDirectory ?? "Cache-Pfad wird ermittelt..."}
                </p>
              </div>

              {assetCacheFeedback ? (
                <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                  {assetCacheFeedback}
                </div>
              ) : null}
              {assetCacheError ? (
                <div className="mt-4 rounded-[18px] border border-[rgba(204,97,78,0.24)] bg-[rgba(141,61,48,0.14)] px-4 py-3 text-sm text-[#f2c1b7]">
                  {assetCacheError}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="ui-button-secondary"
                  type="button"
                  disabled={assetCacheLoading || assetCacheBusy}
                  onClick={() => void refreshAssetCache()}
                >
                  Cache aktualisieren
                </button>
                <button
                  className="ui-button-neutral"
                  type="button"
                  disabled={!assetCache?.cacheDirectory}
                  onClick={() => void openAssetCacheDirectory()}
                >
                  Ordner öffnen
                </button>
                <button
                  className="ui-button-danger"
                  type="button"
                  disabled={assetCacheLoading || assetCacheBusy}
                  onClick={() => void clearAssetCache()}
                >
                  {assetCacheBusy ? "Löscht..." : "Cache leeren"}
                </button>
              </div>
            </div>

            {feedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}
            {desktopFeedback ? (
              <div className="rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#f0dfcc]">
                {desktopFeedback}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button className="ui-button-primary" type="button" disabled={saving} onClick={saveProfile}>
                {saving ? "Speichert..." : "Profil speichern"}
              </button>
              <button className="ui-button-secondary" type="button" onClick={saveDesktopPreferences}>
                Desktop-Einstellungen speichern
              </button>
              <Link className="ui-button-neutral" href={`/profiles/${session.duelistId}`}>
                Eigenes Profil öffnen
              </Link>
              <button className="ui-button-danger" type="button" onClick={logout}>
                Abmelden
              </button>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel kicker="Freunde" title="Anfragen">
            <div className="space-y-3">
              {friendRequests.length > 0 ? (
                friendRequests.map((request) => {
                  const incoming = request.addressee.userId === session.userId;
                  const other = incoming ? request.requester : request.addressee;

                  return (
                    <article
                      key={request.id}
                      className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-[#f0dfcc]">
                            {other.displayName}
                          </p>
                          <p className="mt-1 text-sm text-[#baa58a]">{other.duelistId}</p>
                        </div>
                        <StatusPill tone={request.status === "ACCEPTED" ? "gold" : "ember"}>
                          {request.status}
                        </StatusPill>
                      </div>

                      {incoming && request.status === "PENDING" ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            className="ui-button-primary"
                            type="button"
                            onClick={() => respond(request.id, "accept")}
                          >
                            Annehmen
                          </button>
                          <button
                            className="ui-button-neutral"
                            type="button"
                            onClick={() => respond(request.id, "decline")}
                          >
                            Ablehnen
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="ui-empty rounded-[20px] px-4 py-5 text-sm">
                  Noch keine Freundschaftsanfragen vorhanden.
                </div>
              )}
            </div>
          </Panel>

          <Panel kicker="Geräte" title="Gemerkte Desktop-Sessions">
            <div className="space-y-3">
              {deviceSessions.map((deviceSession) => (
                <article
                  key={deviceSession.id}
                  className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[#f0dfcc]">
                        {deviceSession.deviceLabel || "Desktop Gerät"}
                      </p>
                      <p className="mt-1 text-sm text-[#baa58a]">
                        Zuletzt aktiv {formatGermanDateTime(deviceSession.lastSeenAt)}
                      </p>
                    </div>
                    <StatusPill tone={deviceSession.rememberDevice ? "gold" : "slate"}>
                      {deviceSession.rememberDevice ? "Gemerkt" : "Temporär"}
                    </StatusPill>
                  </div>
                  <p className="mt-3 text-xs text-[#9f8c77]">
                    Läuft bis {formatGermanDateTime(deviceSession.expiresAt)}
                  </p>
                </article>
              ))}
            </div>
          </Panel>
        </div>
      </section>
    </DuelConsoleScaffold>
  );
}
