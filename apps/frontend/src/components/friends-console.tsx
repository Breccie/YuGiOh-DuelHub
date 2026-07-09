"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export function FriendsConsole() {
  const router = useRouter();
  const [payload, setPayload] = useState<FriendsPayload>(createFallbackPayload);
  const [duelistId, setDuelistId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<FriendAction | null>(null);

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
      <div className="space-y-6">
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
