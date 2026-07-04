import { notFound, redirect } from "next/navigation";
import type { PublicProfileResponse } from "@ygo/contracts";
import { ProfileConsole } from "@/components/profile-console";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";
import { getPublicProfileByDuelistId } from "@/lib/profile-service";
import { getLocalViewerSession, getOnlineViewerSession } from "@/lib/session-data";

type PublicProfilePageProps = {
  params: Promise<{
    duelistId: string;
  }>;
};

async function getOnlineProfile(duelistId: string) {
  try {
    return await fetchApiServiceJson<PublicProfileResponse>(
      `/api/v1/profiles/${encodeURIComponent(duelistId)}`,
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;

    if (status === 401) {
      redirect("/login");
    }

    if (status === 404) {
      notFound();
    }

    throw error;
  }
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { duelistId } = await params;

  if (shouldProxyToApiService()) {
    const session = await getOnlineViewerSession();

    if (!session) {
      redirect("/login");
    }

    const { profile } = await getOnlineProfile(duelistId);

    return (
      <ProfileConsole
        session={session}
        profile={profile}
        isOwnProfile={session.userId === profile.userId}
      />
    );
  }

  const prisma = getPrisma();
  const session = await getLocalViewerSession();

  if (!session) {
    redirect("/login");
  }

  const profile = await getPublicProfileByDuelistId(prisma, duelistId, session.userId);

  return (
    <ProfileConsole
      session={session}
      profile={profile}
      isOwnProfile={session.userId === profile.userId}
    />
  );
}
