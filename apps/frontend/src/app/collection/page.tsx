import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CollectionBinderLoader } from "@/components/collection-binder-loader";
import { CollectionBinderConsole } from "@/components/collection-binder-console";
import { shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import {
  getCollectionSnapshot,
} from "@/lib/collection-ledger";
import {
  getCollectionShowcaseSnapshot,
} from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";
import Loading from "../loading";

async function CollectionPageContent() {
  if (shouldProxyToApiService()) {
    return <CollectionBinderLoader />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const [collectionSnapshot, collectionShowcase, totalCards, initialEditorSnapshot] =
    await Promise.all([
      getCollectionSnapshot({ viewerId: session.userId }),
      getCollectionShowcaseSnapshot(prisma, session.userId),
      prisma.card.count(),
      Promise.resolve(null),
    ]);

  return (
    <CollectionBinderConsole
      viewer={{
        displayName: collectionSnapshot.viewer.displayName,
      }}
      collectionProgress={{
        owned: collectionSnapshot.totals.uniqueCards,
        total: totalCards,
        copies: collectionSnapshot.totals.totalCopies,
        duplicates: collectionSnapshot.totals.cardsWithDuplicates,
        available: collectionSnapshot.totals.availableCopies,
      }}
      binders={collectionShowcase.binders}
      presets={collectionShowcase.presets}
      cards={collectionSnapshot.cards}
      recentEntries={collectionSnapshot.recentEntries}
      initialEditorSnapshot={initialEditorSnapshot}
    />
  );
}

export default function CollectionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CollectionPageContent />
    </Suspense>
  );
}
