"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type {
  FriendRequestDto,
  PlayGroupRunDto,
  ViewerSession,
} from "@ygo/contracts";
import { AssetIcon } from "@/components/asset-icon";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { Panel, StatusPill } from "@/components/panel";
import { ApiClientError, apiGetJson, getApiErrorMessage } from "@/lib/api-client";
import { duelClient } from "@/lib/duel-client";
import { friendClient } from "@/lib/friend-client";
import { runClient } from "@/lib/run-client";

type FriendsPayload = {
  session: ViewerSession;
  requests: FriendRequestDto[];
  activeRunId: string | null;
  runs: PlayGroupRunDto[];
};

type FriendAction =
  | `accept:${string}`
  | `decline:${string}`
  | `invite:${string}`
  | `duel:${string}`
  | "add";

function getOtherDuelist(request: FriendRequestDto, viewerUserId: string) {
  return request.requester.userId === viewerUserId
    ? request.addressee
    : request.requester;
}

function createFallbackPayload(): FriendsPayload {
  return {
    session: {
      sessionId: "loading-session",
      userId: "loading-viewer",
      duelistId: "",
      displayName: "Duelist",
      avatarKey: "default",
      favoriteEra: null,
      isPublic: false,
      showcaseBinderId: null,
      expiresAt: new Date(0).toISOString(),
      rememberDevice: false,
      deviceLabel: null,
    },
    requests: [],
    activeRunId: null,
    runs: [],
  };
}

function sortByDisplayName(
  left: ReturnType<typeof getOtherDuelist>,
  right: ReturnType<typeof getOtherDuelist>,
) {
  return left.displayName.localeCompare(right.displayName, "de");
}

function formatPresence(friend: ReturnType<typeof getOtherDuelist>, now: number) {
  if (friend.isOnline) return "Online";
  if (!friend.lastSeenAt) return "Zuletzt online unbekannt";

  const timestamp = new Date(friend.lastSeenAt).getTime();
  const elapsedMinutes = Math.max(1, Math.floor((now - timestamp) / 60_000));
  if (elapsedMinutes < 60) return `Vor ${elapsedMinutes} Min. online`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Vor ${elapsedHours} Std. online`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `Vor ${elapsedDays} Tag${elapsedDays === 1 ? "" : "en"} online`;

  return `Zuletzt online ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp))}`;
}

export function FriendsConsole() {
  const router = useRouter();
  const [payload, setPayload] = useState<FriendsPayload>(createFallbackPayload);
  const [duelistId, setDuelistId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<FriendAction | null>(null);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [friendTab, setFriendTab] = useState<"ONLINE" | "ALL" | "PENDING">("ALL");
  const [friendQuery, setFriendQuery] = useState("");

  const activeRun =
    payload.runs.find((run) => run.id === payload.activeRunId) ??
    payload.runs[0] ??
    null;
  const acceptedFriends = useMemo(
    () =>
      payload.requests
        .filter((request) => request.status === "ACCEPTED")
        .map((request) => getOtherDuelist(request, payload.session.userId))
        .sort(sortByDisplayName),
    [payload.requests, payload.session.userId],
  );
  const incomingRequests = payload.requests.filter(
    (request) =>
      request.status === "PENDING" &&
      request.addressee.userId === payload.session.userId,
  );
  const outgoingRequests = payload.requests.filter(
    (request) =>
      request.status === "PENDING" &&
      request.requester.userId === payload.session.userId,
  );
  const visibleFriends = useMemo(() => {
    const normalizedQuery = friendQuery.trim().toLocaleLowerCase("de");
    return acceptedFriends.filter((friend) => {
      if (friendTab === "ONLINE" && !friend.isOnline) return false;
      return (
        !normalizedQuery ||
        `${friend.displayName} ${friend.duelistId}`
          .toLocaleLowerCase("de")
          .includes(normalizedQuery)
      );
    });
  }, [acceptedFriends, friendQuery, friendTab]);

  async function refresh() {
    const [sessionPayload, friendsPayload, runsPayload] = await Promise.all([
      apiGetJson<{ session: ViewerSession | null }>("/api/auth/session", {
        cache: "no-store",
      }),
      friendClient.list(),
      runClient.list(),
    ]);

    if (!sessionPayload.session) {
      throw new ApiClientError("Bitte zuerst anmelden.", { status: 401 });
    }

    setPayload({
      session: sessionPayload.session,
      requests: friendsPayload.requests,
      activeRunId: runsPayload.activeRunId,
      runs: runsPayload.runs,
    });
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      await refresh();
    }

    void load().catch((error) => {
      if (!mounted) {
        return;
      }

      if (error instanceof ApiClientError && error.status === 401) {
        router.replace("/login");
        return;
      }

      setFeedback(getApiErrorMessage(error, "Freundesliste konnte nicht geladen werden."));
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPresenceClock(Date.now());
      void refresh().catch(() => undefined);
    }, 60_000);

    function handleFocus() {
      setPresenceClock(Date.now());
      void refresh().catch(() => undefined);
    }

    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  });

  async function handleAddFriend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedDuelistId = duelistId.trim();

    if (!trimmedDuelistId) {
      setFeedback("Gib eine Duelist-ID ein.");
      return;
    }

    setPendingAction("add");
    setFeedback(null);

    try {
      await friendClient.create({ duelistId: trimmedDuelistId });
      setDuelistId("");
      await refresh();
      setFeedback("Freundschaftsanfrage wurde gesendet.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Freundschaftsanfrage konnte nicht gesendet werden."));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDecision(requestId: string, action: "accept" | "decline") {
    setPendingAction(`${action}:${requestId}`);
    setFeedback(null);

    try {
      await friendClient.decide(requestId, { action });
      await refresh();
      setFeedback(action === "accept" ? "Anfrage angenommen." : "Anfrage abgelehnt.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Freundschaftsanfrage konnte nicht aktualisiert werden."));
    } finally {
      setPendingAction(null);
    }
  }

  async function inviteToCampaign(friend: ReturnType<typeof getOtherDuelist>) {
    if (!activeRun) {
      setFeedback("Erstelle oder öffne zuerst eine Kampagne.");
      return;
    }

    setPendingAction(`invite:${friend.userId}`);
    setFeedback(null);

    try {
      await runClient.addMember(activeRun.id, {
        duelistId: friend.duelistId,
        role: "PLAYER",
      });
      setFeedback(`${friend.displayName} wurde zu "${activeRun.name}" hinzugefügt.`);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Einladung konnte nicht gesendet werden."));
    } finally {
      setPendingAction(null);
    }
  }

  async function createDuelInvite(friend: ReturnType<typeof getOtherDuelist>) {
    setPendingAction(`duel:${friend.userId}`);
    setFeedback(null);

    try {
      await duelClient.create({
        opponentDuelistId: friend.duelistId,
        message: "EDOPro-Duellanfrage",
      });
      startTransition(() => {
        router.push("/duels");
      });
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Duellanfrage konnte nicht erstellt werden."));
    } finally {
      setPendingAction(null);
    }
  }

  function openTrade(friend: ReturnType<typeof getOtherDuelist>) {
    router.push(`/trade/create?duelistId=${encodeURIComponent(friend.duelistId)}`);
  }

  return (
    <DuelConsoleScaffold
      activePath="/friends"
      viewer={{
        displayName: payload.session.displayName,
        duelistId: payload.session.duelistId,
        avatarImageUrl: payload.session.avatarImageUrl,
      }}
      metrics={[
        {
          icon: "users",
          label: "Freunde",
          value: `${acceptedFriends.length}`,
        },
        {
          icon: "mail",
          label: "Anfragen",
          value: `${incomingRequests.length}`,
        },
        {
          icon: "shield",
          label: "Aktive Kampagne",
          value: activeRun?.name ?? "Keine",
        },
      ]}
    >
      <div className="grid gap-3">
        <Panel className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#cb5c44]">
                Kontakte
              </p>
              <h1 className="mt-1 text-xl font-semibold text-[#f1e3d2]">
                Freunde
              </h1>
            </div>

            <form onSubmit={handleAddFriend} className="flex min-w-0 gap-2 xl:w-[420px]">
              <input
                className="ui-input min-w-0 flex-1"
                value={duelistId}
                onChange={(event) => setDuelistId(event.target.value)}
                placeholder="Duelist-ID hinzufügen"
                aria-label="Duelist-ID hinzufügen"
              />
              <button
                type="submit"
                className="ui-button-primary min-h-[42px] shrink-0 px-3"
                disabled={pendingAction === "add"}
              >
                {pendingAction === "add" ? "Sendet…" : "Hinzufügen"}
              </button>
            </form>
          </div>

          {feedback ? (
            <div className="mt-3 rounded-[7px] border border-[rgba(208,170,110,0.18)] bg-[rgba(208,170,110,0.08)] px-3 py-2 text-xs text-[#f0dfcc]">
              {feedback}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 border-t border-[rgba(255,255,255,0.08)] pt-3 lg:flex-row lg:items-center">
            <div className="inline-flex rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[#080c12] p-1">
              {([
                ["ONLINE", `Online ${acceptedFriends.filter((friend) => friend.isOnline).length}`],
                ["ALL", `Alle ${acceptedFriends.length}`],
                ["PENDING", `Ausstehend ${incomingRequests.length + outgoingRequests.length}`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={friendTab === value}
                  onClick={() => setFriendTab(value)}
                  className={
                    friendTab === value
                      ? "rounded-[5px] bg-[rgba(207,91,66,0.2)] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#ffe2d3]"
                      : "rounded-[5px] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#9f8f7d] hover:text-[#ead9c6]"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {friendTab !== "PENDING" ? (
              <label className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-[rgba(255,255,255,0.09)] bg-[rgba(255,255,255,0.025)] px-3 lg:ml-auto lg:max-w-[360px]">
                <AssetIcon name="search" className="h-4 w-4 text-[#887966]" />
                <input
                  value={friendQuery}
                  onChange={(event) => setFriendQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#786d60]"
                  placeholder="Freunde suchen"
                />
              </label>
            ) : null}
          </div>
        </Panel>

        {friendTab === "PENDING" ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel kicker="Eingang" title={`Eingehend · ${incomingRequests.length}`} className="p-4">
              <div className="grid gap-2">
                {incomingRequests.map((request) => (
                  <article key={request.id} className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#f0dfcc]">{request.requester.displayName}</p>
                      <p className="text-xs uppercase tracking-[0.12em] text-[#8f806e]">{request.requester.duelistId}</p>
                    </div>
                    <button type="button" className="ui-button-primary min-h-[36px] px-3 py-2 text-xs" onClick={() => void handleDecision(request.id, "accept")} disabled={pendingAction === `accept:${request.id}`}>Annehmen</button>
                    <button type="button" className="ui-button-neutral min-h-[36px] px-3 py-2 text-xs" onClick={() => void handleDecision(request.id, "decline")} disabled={pendingAction === `decline:${request.id}`}>Ablehnen</button>
                  </article>
                ))}
                {incomingRequests.length === 0 ? <div className="ui-empty rounded-[8px] px-4 py-6 text-sm">Keine eingehenden Anfragen.</div> : null}
              </div>
            </Panel>

            <Panel kicker="Ausgang" title={`Gesendet · ${outgoingRequests.length}`} className="p-4">
              <div className="grid gap-2">
                {outgoingRequests.map((request) => (
                  <article key={request.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] p-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#f0dfcc]">{request.addressee.displayName}</p>
                      <p className="text-xs uppercase tracking-[0.12em] text-[#8f806e]">{request.addressee.duelistId}</p>
                    </div>
                    <StatusPill tone="slate">Ausstehend</StatusPill>
                  </article>
                ))}
                {outgoingRequests.length === 0 ? <div className="ui-empty rounded-[8px] px-4 py-6 text-sm">Keine gesendeten Anfragen.</div> : null}
              </div>
            </Panel>
          </div>
        ) : (
          <Panel className="overflow-hidden p-0">
            <div className="divide-y divide-[rgba(255,255,255,0.07)]">
              {visibleFriends.map((friend) => (
                <article key={friend.userId} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {friend.avatarImageUrl ? <Image src={friend.avatarImageUrl} alt="" fill sizes="36px" className="object-cover" unoptimized /> : <div className="grid h-full place-items-center text-xs font-semibold text-[#d8c3a5]">{friend.displayName.slice(0, 1).toUpperCase()}</div>}
                    </div>
                    <span className={friend.isOnline ? "h-2.5 w-2.5 shrink-0 rounded-full bg-[#55d6ab] shadow-[0_0_12px_rgba(85,214,171,0.72)]" : "h-2.5 w-2.5 shrink-0 rounded-full bg-[#665d53]"} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#f0dfcc]">{friend.displayName}</p>
                      <p className="truncate text-xs text-[#958674]">{friend.duelistId} · {formatPresence(friend, presenceClock)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button type="button" className="ui-button-neutral min-h-[34px] px-3 py-1.5 text-[0.66rem]" onClick={() => void inviteToCampaign(friend)} disabled={pendingAction === `invite:${friend.userId}`}>Kampagne</button>
                    <button type="button" className="ui-button-secondary min-h-[34px] px-3 py-1.5 text-[0.66rem]" onClick={() => void createDuelInvite(friend)} disabled={pendingAction === `duel:${friend.userId}`}>Duell</button>
                    <button type="button" className="ui-button-neutral min-h-[34px] px-3 py-1.5 text-[0.66rem]" onClick={() => openTrade(friend)}>Tauschen</button>
                  </div>
                </article>
              ))}
              {visibleFriends.length === 0 ? (
                <div className="ui-empty m-4 rounded-[8px] px-4 py-8 text-center text-sm">
                  {friendTab === "ONLINE" ? "Gerade ist niemand online." : "Keine Freunde gefunden."}
                </div>
              ) : null}
            </div>
          </Panel>
        )}
      </div>

      <div className="hidden">
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel kicker="Kontakte" title="Freunde">
            <form onSubmit={handleAddFriend} className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="ui-input"
                value={duelistId}
                onChange={(event) => setDuelistId(event.target.value)}
                placeholder="Duelist-ID eingeben"
              />
              <button
                type="submit"
                className="ui-button-primary min-h-[52px]"
                disabled={pendingAction === "add"}
              >
                {pendingAction === "add" ? "Sendet..." : "Anfrage senden"}
              </button>
            </form>

            {feedback ? (
              <div className="mt-4 rounded-[18px] border border-[rgba(208,170,110,0.18)] bg-[rgba(208,170,110,0.08)] px-4 py-3 text-sm text-[#f0dfcc]">
                {feedback}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3">
              {acceptedFriends.length > 0 ? (
                acceptedFriends.map((friend) => (
                  <article
                    key={friend.userId}
                    className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-[#f0dfcc]">
                          {friend.displayName}
                        </p>
                        <p className="mt-1 text-sm uppercase tracking-[0.16em] text-[#9f8c77]">
                          {friend.duelistId}
                        </p>
                        <p
                          className={
                            friend.isOnline
                              ? "mt-2 flex items-center gap-2 text-xs font-semibold text-[#72d6b6]"
                              : "mt-2 flex items-center gap-2 text-xs text-[#a9957b]"
                          }
                        >
                          <span
                            className={
                              friend.isOnline
                                ? "h-2 w-2 rounded-full bg-[#55d6ab] shadow-[0_0_12px_rgba(85,214,171,0.72)]"
                                : "h-2 w-2 rounded-full bg-[#665d53]"
                            }
                          />
                          {formatPresence(friend, presenceClock)}
                        </p>
                      </div>
                      <StatusPill tone="teal">Freund</StatusPill>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ui-button-neutral"
                        onClick={() => void inviteToCampaign(friend)}
                        disabled={pendingAction === `invite:${friend.userId}`}
                      >
                        Kampagne einladen
                      </button>
                      <button
                        type="button"
                        className="ui-button-secondary"
                        onClick={() => void createDuelInvite(friend)}
                        disabled={pendingAction === `duel:${friend.userId}`}
                      >
                        Duell anfragen
                      </button>
                      <button
                        type="button"
                        className="ui-button-neutral"
                        onClick={() => openTrade(friend)}
                      >
                        Tauschen
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="ui-empty rounded-[20px] px-4 py-6 text-sm">
                  Noch keine Freunde. Sende oben eine Anfrage per Duelist-ID.
                </div>
              )}
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel kicker="Eingang" title="Offene Anfragen">
              <div className="grid gap-3">
                {incomingRequests.length > 0 ? (
                  incomingRequests.map((request) => (
                    <article
                      key={request.id}
                      className="rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#f0dfcc]">
                            {request.requester.displayName}
                          </p>
                          <p className="mt-1 text-sm text-[#9f8c77]">
                            {request.requester.duelistId}
                          </p>
                        </div>
                        <StatusPill tone="gold">Wartet</StatusPill>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="ui-button-primary"
                          onClick={() => void handleDecision(request.id, "accept")}
                          disabled={pendingAction === `accept:${request.id}`}
                        >
                          Annehmen
                        </button>
                        <button
                          type="button"
                          className="ui-button-neutral"
                          onClick={() => void handleDecision(request.id, "decline")}
                          disabled={pendingAction === `decline:${request.id}`}
                        >
                          Ablehnen
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="ui-empty rounded-[20px] px-4 py-6 text-sm">
                    Keine offenen eingehenden Anfragen.
                  </div>
                )}
              </div>
            </Panel>

            <Panel kicker="Ausgang" title="Gesendet">
              {outgoingRequests.length > 0 ? (
                <div className="grid gap-3">
                  {outgoingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.025)] px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-[#f0dfcc]">
                          {request.addressee.displayName}
                        </p>
                        <p className="text-sm text-[#9f8c77]">
                          {request.addressee.duelistId}
                        </p>
                      </div>
                      <StatusPill tone="slate">Ausstehend</StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ui-empty rounded-[20px] px-4 py-6 text-sm">
                  Keine gesendeten offenen Anfragen.
                </div>
              )}
            </Panel>

            <Panel kicker="Kontext" title="Aktive Kampagne">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[rgba(208,170,110,0.18)] bg-[rgba(255,255,255,0.04)] text-[#d8bc91]">
                  <AssetIcon name="shield" className="h-6 w-6 text-current" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-[#f0dfcc]">
                    {activeRun?.name ?? "Keine Kampagne aktiv"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#cdb79c]">
                    Kampagnen-Einladungen nutzen immer diese aktive Kampagne.
                    Host- oder Organizer-Rechte werden serverseitig geprüft.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </section>
      </div>
    </DuelConsoleScaffold>
  );
}
