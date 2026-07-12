import { redirect } from "next/navigation";
import type { FriendRequestsResponse } from "@ygo/contracts";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { listFriendRequests } from "@/lib/friend-service";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";
import { SettingsConsole } from "@/components/settings-console";

export default async function SettingsPage() {
  if (shouldProxyToApiService()) {
    const session = await getOnlineViewerSession();
    const [binderPayload, friendPayload] = await Promise.all([
      fetchApiServiceJson<{ binders: Array<{ id: string; name: string }> }>(
        "/api/v1/collection/binders",
      ),
      fetchApiServiceJson<FriendRequestsResponse>("/api/v1/friends/requests"),
    ]);

    return (
      <SettingsConsole
        session={session}
        profile={{
          displayName: session.displayName,
          bio: null,
          favoriteEra: session.favoriteEra,
          avatarKey: session.avatarKey,
          isPublic: session.isPublic,
          showcaseBinderId: session.showcaseBinderId,
        }}
        binderOptions={binderPayload.binders.map((binder) => ({
          id: binder.id,
          name: binder.name,
        }))}
        deviceSessions={[
          {
            id: session.sessionId,
            deviceLabel: session.deviceLabel,
            userAgent: null,
            rememberDevice: session.rememberDevice,
            expiresAt: session.expiresAt,
            lastSeenAt: new Date().toISOString(),
          },
        ]}
        friendRequests={friendPayload.requests}
      />
    );
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const [profile, deviceSessions, binderOptions, friendRequests] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: session.userId,
      },
      select: {
        displayName: true,
        bio: true,
        favoriteEra: true,
        avatarKey: true,
        isPublic: true,
        showcaseBinderId: true,
      },
    }),
    prisma.session.findMany({
      where: {
        userId: session.userId,
      },
      orderBy: {
        lastSeenAt: "desc",
      },
      select: {
        id: true,
        deviceLabel: true,
        userAgent: true,
        rememberDevice: true,
        expiresAt: true,
        lastSeenAt: true,
      },
    }),
    prisma.collectionBinder.findMany({
      where: {
        userId: session.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        name: true,
      },
    }),
    listFriendRequests(prisma, session.userId),
  ]);

  if (!profile) {
    redirect("/login");
  }

  return (
    <SettingsConsole
      session={session}
      profile={profile}
      binderOptions={binderOptions}
      deviceSessions={deviceSessions.map((deviceSession) => ({
        ...deviceSession,
        expiresAt: deviceSession.expiresAt.toISOString(),
        lastSeenAt: deviceSession.lastSeenAt.toISOString(),
      }))}
      friendRequests={friendRequests}
    />
  );
}
