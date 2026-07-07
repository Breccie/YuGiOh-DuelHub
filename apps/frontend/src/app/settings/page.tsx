import { redirect } from "next/navigation";
import { getViewerSession } from "@/lib/auth";
import { listFriendRequests } from "@/lib/friend-service";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";
import { SettingsConsole } from "@/components/settings-console";

export default async function SettingsPage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const activeRun = await getActiveRun(prisma, session.userId);
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
        runId: activeRun.id,
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
