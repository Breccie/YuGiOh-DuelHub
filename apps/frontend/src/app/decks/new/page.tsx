import { redirect } from "next/navigation";
import { DeckEditorRouteLoader } from "@/components/deck-editor-route-loader";
import { DeckEditorWorkspace } from "@/components/deck-editor-workspace";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";
import { getPrisma } from "@/lib/prisma";

export default async function NewDeckPage() {
  if (shouldProxyToApiService()) {
    return <DeckEditorRouteLoader deckId={null} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const snapshot = await getDeckLegalitySnapshot({
    viewerId: session.userId,
  });

  return (
    <DeckEditorWorkspace
      viewer={snapshot.viewer}
      activeDeck={null}
      availableBanlists={snapshot.editor.availableBanlists}
      collectionCards={snapshot.editor.collectionCards}
    />
  );
}
