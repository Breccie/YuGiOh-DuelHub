import { redirect } from "next/navigation";
import { getViewerSession } from "@/lib/auth";
import { DuelsConsole } from "@/components/duels-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { listDuelRequests } from "@/lib/duel-service";
import { getPrisma } from "@/lib/prisma";

type RemoteDuelsPayload = {
  duels: Awaited<ReturnType<typeof listDuelRequests>>;
  decks: Array<{ id: string; name: string }>;
};

export default async function DuelsPage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  if (shouldProxyToApiService()) {
    const pageData = await fetchApiServiceJson<RemoteDuelsPayload>("/api/v1/duels");

    return (
      <DuelsConsole session={session} duelRequests={pageData.duels} decks={pageData.decks} />
    );
  }

  const [duelRequests, decks] = await Promise.all([
    listDuelRequests(prisma, session.userId),
    prisma.deck.findMany({
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
  ]);

  return <DuelsConsole session={session} duelRequests={duelRequests} decks={decks} />;
}
