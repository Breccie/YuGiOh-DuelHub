import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CollectionBinderConsole } from "@/components/collection-binder-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import {
  getCollectionSnapshot,
  type CollectionSnapshot,
} from "@/lib/collection-ledger";
import {
  getCollectionBinderEditorSnapshot,
  getCollectionShowcaseSnapshot,
  type CollectionBinderDto,
  type CollectionBinderEditorSnapshot,
  type CollectionPresetDto,
} from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";
import Loading from "../loading";

type RemoteCollectionPagePayload = {
  viewer: CollectionSnapshot["viewer"];
  binders: CollectionBinderDto[];
  presets: CollectionPresetDto[];
  totals: CollectionSnapshot["totals"];
  cards: CollectionSnapshot["cards"];
  recentEntries: CollectionSnapshot["recentEntries"];
  totalCards: number;
};

function getSingleQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

async function CollectionPageContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const editorMode = getSingleQueryValue(resolvedSearchParams?.mode);
  const editorBinderId = getSingleQueryValue(resolvedSearchParams?.binder);
  const shouldLoadEditorSnapshot =
    editorMode === "edit" && Boolean(editorBinderId?.trim());

  if (shouldProxyToApiService()) {
    const [pageData, initialEditorSnapshot] = await Promise.all([
      fetchApiServiceJson<RemoteCollectionPagePayload>("/api/v1/collection"),
      shouldLoadEditorSnapshot && editorBinderId
        ? fetchApiServiceJson<CollectionBinderEditorSnapshot>(
            `/api/v1/collection/binders/${editorBinderId}/editor`,
          )
        : Promise.resolve(null),
    ]);

    return (
      <CollectionBinderConsole
        viewer={{
          displayName: pageData.viewer.displayName,
        }}
        collectionProgress={{
          owned: pageData.totals.uniqueCards,
          total: pageData.totalCards,
          copies: pageData.totals.totalCopies,
          duplicates: pageData.totals.cardsWithDuplicates,
          available: pageData.totals.availableCopies,
        }}
        binders={pageData.binders}
        presets={pageData.presets}
        cards={pageData.cards}
        recentEntries={pageData.recentEntries}
        initialEditorSnapshot={initialEditorSnapshot}
      />
    );
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
      shouldLoadEditorSnapshot && editorBinderId
        ? getCollectionBinderEditorSnapshot(prisma, session.userId, editorBinderId)
        : Promise.resolve(null),
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

export default function CollectionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<Loading />}>
      <CollectionPageContent searchParams={searchParams} />
    </Suspense>
  );
}
