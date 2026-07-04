import { notFound, redirect } from "next/navigation";
import { PackMotionPreviewConsole } from "@/components/pack-motion-preview-console";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getViewerSession } from "@/lib/auth";
import { getPackDashboardSnapshot } from "@/lib/pack-openings";
import { getPreferredPackHeroImage } from "@/lib/pack-renders";
import { getPrisma } from "@/lib/prisma";

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function getEraLabel(value: string) {
  const year = new Date(value).getUTCFullYear();

  if (year <= 2003) {
    return "DM Ära";
  }

  if (year <= 2007) {
    return "GX Ära";
  }

  if (year <= 2011) {
    return "5D's Ära";
  }

  if (year <= 2014) {
    return "ZEXAL Ära";
  }

  if (year <= 2017) {
    return "ARC-V Ära";
  }

  return "Moderne Ära";
}

export default async function PackMotionPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const snapshot = await getPackDashboardSnapshot(prisma, session.userId);
  const viewerId = snapshot.viewer.id;

  const [ownedUniqueCards, totalCards, latestBanlist] = await Promise.all([
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        userId: viewerId,
      },
    }),
    prisma.card.count(),
    prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
    }),
  ]);

  const selectedSet =
    snapshot.sets.find((set) => set.id === snapshot.selectedSetId) ??
    snapshot.sets.find((set) => set.productType === "CORE_BOOSTER") ??
    snapshot.sets[0];

  if (!selectedSet) {
    throw new Error("Kein Booster-Set für die Bewegungsstudie gefunden.");
  }

  const setWithCards = await prisma.cardSet.findUnique({
    where: {
      id: selectedSet.id,
    },
    include: {
      setCards: {
        take: 3,
        orderBy: {
          setCode: "asc",
        },
        include: {
          card: {
            select: {
              id: true,
              name: true,
              externalCardId: true,
            },
          },
        },
      },
    },
  });

  const sampleCards = (setWithCards?.setCards ?? []).map((setCard) => ({
    id: setCard.card.id,
    name: setCard.card.name,
    imageUrl: getCardAssetUrl(setCard.card.externalCardId),
    rarity: setCard.rarity,
  }));

  return (
    <PackMotionPreviewConsole
      viewer={{
        displayName: snapshot.viewer.displayName,
      }}
      collectionValue={`${formatNumber(ownedUniqueCards.length)} / ${formatNumber(totalCards)}`}
      latestBanlistName={latestBanlist?.name ?? "Keine Bannliste"}
      activeEra={getEraLabel(selectedSet.releaseDate)}
      pack={{
        name: selectedSet.name,
        code: selectedSet.code,
        imageUrl: getPreferredPackHeroImage(
          selectedSet.code,
          selectedSet.name,
          selectedSet.imageUrl,
        ),
      }}
      sampleCards={sampleCards}
    />
  );
}
