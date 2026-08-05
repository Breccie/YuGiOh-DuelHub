"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { MediaAssetDto, MediaAssetKind } from "@ygo/contracts";
import { useRouter } from "next/navigation";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import {
  defaultDesktopPreferences,
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
import type { FriendRequestDto, ViewerSession } from "@/lib/app-dtos";
import { friendClient } from "@/lib/friend-client";
import { profileClient } from "@/lib/profile-client";
import { ImageCropUpload } from "@/components/image-crop-upload";
import { mediaClient } from "@/lib/media-client";
import { IconCheck } from "@tabler/icons-react";
import { BinderDesignPreview, DeckBoxDesignPreview } from "@/components/personal-design-preview";
import { publishViewerPresentation } from "@/lib/viewer-presentation";

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

function DesignLibrary({
  kind,
  title,
  aspect,
  designs,
  avatarAssetId,
  onUploaded,
  onSelectAvatar,
  onRename,
  onRemove,
}: {
  kind: MediaAssetKind;
  title: string;
  aspect: number;
  designs: MediaAssetDto[];
  avatarAssetId: string | null;
  onUploaded: (asset: MediaAssetDto) => void;
  onSelectAvatar: (assetId: string | null) => void;
  onRename: (asset: MediaAssetDto) => void;
  onRemove: (asset: MediaAssetDto) => void;
}) {
  const items = designs.filter((asset) => asset.kind === kind);
  return (
    <section className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-semibold text-[#f0dfcc]">{title}</p><p className="text-xs text-white/45">{items.length} eigene Designs</p></div>
        <ImageCropUpload kind={kind} aspect={aspect} onUploaded={onUploaded} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {kind === "AVATAR" ? <button type="button" onClick={() => onSelectAvatar(null)} className={`relative grid aspect-square place-items-center rounded-full border px-2 text-center text-xs ${avatarAssetId === null ? "border-teal-200 bg-teal-300/10 ring-2 ring-teal-300/30" : "border-white/10 bg-black/25"}`}>Standardsiegel{avatarAssetId === null ? <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-teal-500 text-white"><IconCheck size={15} /></span> : null}</button> : null}
        {items.map((asset) => <div key={asset.id} className={`group relative border ${kind === "AVATAR" ? "overflow-visible rounded-full" : "overflow-hidden rounded-lg"} ${kind === "AVATAR" && avatarAssetId === asset.id ? "border-teal-200 ring-2 ring-teal-300/35" : "border-white/10"}`}>
          <button type="button" className={`relative block w-full bg-black/35 ${kind === "AVATAR" ? "overflow-hidden rounded-full" : ""}`} style={{ aspectRatio: String(aspect) }} onClick={() => kind === "AVATAR" && onSelectAvatar(asset.id)} aria-label={`${asset.name}${kind === "AVATAR" ? " als Profilbild wählen" : ""}`}>
            {kind === "BINDER_COVER" ? <BinderDesignPreview imageUrl={asset.imageUrl} alt={asset.name} custom className="h-full w-full" /> : kind === "DECKBOX" ? <DeckBoxDesignPreview imageUrl={asset.imageUrl} alt={asset.name} custom className="h-full w-full" /> : <Image src={asset.imageUrl} alt={asset.name} fill sizes="130px" className="object-cover" />}
          </button>
          {kind === "AVATAR" && avatarAssetId === asset.id ? <span className="pointer-events-none absolute right-0 top-0 z-10 grid h-6 w-6 place-items-center rounded-full bg-teal-500 text-white shadow-lg"><IconCheck size={15} /></span> : null}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/80 p-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" className="px-1 text-[.65rem]" onClick={() => onRename(asset)}>Name</button><button type="button" disabled={!asset.deletable} className="px-1 text-[.65rem] text-red-300 disabled:text-white/25" onClick={() => onRemove(asset)}>Löschen</button></div>
        </div>)}
      </div>
    </section>
  );
}

function formatGermanDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
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
  desktopAssetCacheEnabled,
}: {
  session: ViewerSession;
  profile: {
    displayName: string;
    bio: string | null;
    favoriteEra: string | null;
    avatarKey: string;
    avatarAssetId: string | null;
    avatarImageUrl?: string | null;
    isPublic: boolean;
    showcaseBinderId: string | null;
  };
  binderOptions: BinderOption[];
  deviceSessions: DeviceSession[];
  friendRequests: FriendRequestDto[];
  desktopAssetCacheEnabled: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [favoriteEra, setFavoriteEra] = useState(profile.favoriteEra ?? "");
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [showcaseBinderId, setShowcaseBinderId] = useState(profile.showcaseBinderId ?? "");
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(profile.avatarAssetId);
  const [designs, setDesigns] = useState<MediaAssetDto[]>([]);
  const [designsLoading, setDesignsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [desktopFeedback, setDesktopFeedback] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(defaultDesktopPreferences.reducedMotion);
  const [graphicsMode, setGraphicsMode] = useState<GraphicsMode>(defaultDesktopPreferences.graphicsMode);
  const [assetCache, setAssetCache] = useState<AssetCacheSnapshot | null>(null);
  const [assetCacheLoading, setAssetCacheLoading] = useState(desktopAssetCacheEnabled);
  const [assetCacheBusy, setAssetCacheBusy] = useState(false);
  const [assetCacheFeedback, setAssetCacheFeedback] = useState<string | null>(null);
  const [assetCacheError, setAssetCacheError] = useState<string | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const preferences = readDesktopPreferencesFromStorage();
      setReducedMotion(preferences.reducedMotion);
      setGraphicsMode(preferences.graphicsMode);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!desktopAssetCacheEnabled) {
      return;
    }

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
  }, [desktopAssetCacheEnabled]);

  useEffect(() => {
    let active = true;
    void mediaClient.list().then((assets) => {
      if (active) setDesigns(assets);
    }).catch((error) => {
      if (active) setFeedback(getApiErrorMessage(error, "Persönliche Designs konnten nicht geladen werden."));
    }).finally(() => active && setDesignsLoading(false));
    return () => { active = false; };
  }, []);

  async function saveProfile() {
    setSaving(true);
    setFeedback(null);

    try {
      const updated = await profileClient.update({
        displayName,
        bio,
        favoriteEra,
        isPublic,
        showcaseBinderId: showcaseBinderId || null,
        avatarAssetId,
      });
      publishViewerPresentation({
        displayName: updated.profile.displayName,
        duelistId: updated.profile.duelistId,
        avatarImageUrl: updated.profile.avatarImageUrl,
      });
      setFeedback("Profil gespeichert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Profil konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  }

  async function selectAvatar(nextAssetId: string | null) {
    const previousAssetId = avatarAssetId;
    setAvatarAssetId(nextAssetId);
    setFeedback("Profilbild wird gespeichert …");

    try {
      const updated = await profileClient.update({ avatarAssetId: nextAssetId });
      publishViewerPresentation({
        displayName: updated.profile.displayName,
        duelistId: updated.profile.duelistId,
        avatarImageUrl: updated.profile.avatarImageUrl,
      });
      setFeedback("Profilbild aktualisiert.");
      startTransition(() => router.refresh());
    } catch (error) {
      setAvatarAssetId(previousAssetId);
      setFeedback(getApiErrorMessage(error, "Profilbild konnte nicht gespeichert werden."));
    }
  }

  async function removeDesign(asset: MediaAssetDto) {
    if (!window.confirm(`„${asset.name}“ wirklich löschen?`)) return;
    try {
      await mediaClient.remove(asset.id);
      setDesigns((current) => current.filter((item) => item.id !== asset.id));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Das Design konnte nicht gelöscht werden."));
    }
  }

  async function renameDesign(asset: MediaAssetDto) {
    const name = window.prompt("Neuer Name", asset.name)?.trim();
    if (!name || name === asset.name) return;
    try {
      const updated = await mediaClient.rename(asset.id, name);
      setDesigns((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Das Design konnte nicht umbenannt werden."));
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
        avatarImageUrl: session.avatarImageUrl,
      }}
      metrics={[
        { icon: "users", label: "Duelist-ID", value: session.duelistId },
        { icon: "hourglass", label: "Lieblings-Ära", value: favoriteEra || "Nicht gesetzt" },
        { icon: "book", label: "Showcase", value: showcaseBinderId ? "Aktiv" : "Offen" },
      ]}
    >
      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <Panel kicker="Profil" title="Profil-Einstellungen">
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

            {desktopAssetCacheEnabled ? <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-4">
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
            </div> : null}

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
                Darstellung speichern
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
          <Panel kicker="Bildbibliothek" title="Meine Designs">
            <p className="mb-4 text-sm leading-6 text-[#baa58a]">Eigene Bilder werden einmal hochgeladen und können anschließend für Profil, Binder und Deckboxen wiederverwendet werden. Verwendete Designs sind vor dem Löschen geschützt.</p>
            {designsLoading ? <div className="ui-skeleton h-44 rounded-xl" /> : <div className="grid gap-3">
              {([[
                "AVATAR", "Profilbilder", 1,
              ], ["BINDER_COVER", "Binder-Cover", 2 / 3], ["DECKBOX", "Deckboxen", 2 / 3]] as const).map(([kind, title, aspect]) => (
                <DesignLibrary key={kind} kind={kind} title={title} aspect={aspect} designs={designs} avatarAssetId={avatarAssetId} onUploaded={(asset) => setDesigns((current) => [asset, ...current])} onSelectAvatar={(assetId) => void selectAvatar(assetId)} onRename={(asset) => void renameDesign(asset)} onRemove={(asset) => void removeDesign(asset)} />
              ))}
            </div>}
          </Panel>
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
