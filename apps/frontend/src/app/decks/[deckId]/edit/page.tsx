import { notFound, redirect } from "next/navigation";
import { DeckEditorRouteLoader } from "@/components/deck-editor-route-loader";
import { DeckEditorWorkspace } from "@/components/deck-editor-workspace";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";
import { getPrisma } from "@/lib/prisma";

export default async function EditDeckPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;

  if (shouldProxyToApiService()) {
    return <DeckEditorRouteLoader deckId={deckId} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const snapshot = await getDeckLegalitySnapshot({
    viewerId: session.userId,
    deckId,
  });

  if (!snapshot.activeDeck || snapshot.activeDeck.id !== deckId) {
    notFound();
  }

  return (
    <DeckEditorWorkspace
      viewer={snapshot.viewer}
      activeDeck={snapshot.activeDeck}
      availableBanlists={snapshot.editor.availableBanlists}
      collectionCards={snapshot.editor.collectionCards}
    />
  );
}
