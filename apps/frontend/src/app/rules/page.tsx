import { redirect } from "next/navigation";
import { RulesConsole } from "@/components/rules-console";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRulesOverviewData } from "@/lib/rules-data";

function getEraLabel(value: string | null | undefined) {
  if (!value) {
    return "Keine Saison";
  }

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

export default async function RulesPage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const [rulesOverview, collectionCount, latestBanlist] = await Promise.all([
    getRulesOverviewData(),
    prisma.collectionEntry.count({
      where: {
        userId: session.userId,
      },
    }),
    prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
      include: {
        entries: true,
      },
    }),
  ]);

  return (
    <RulesConsole
      viewer={{
        displayName: session.displayName,
      }}
      collectionValue={`${collectionCount} Kopien`}
      latestBanlistName={latestBanlist?.name ?? "Keine Bannliste"}
      activeEra={getEraLabel(latestBanlist?.effectiveFrom.toISOString())}
      banlistSummary={{
        forbidden:
          latestBanlist?.entries.filter((entry) => entry.allowedCopies === 0).length ?? 0,
        limited:
          latestBanlist?.entries.filter((entry) => entry.allowedCopies === 1).length ?? 0,
        semiLimited:
          latestBanlist?.entries.filter((entry) => entry.allowedCopies === 2).length ?? 0,
      }}
      formatCards={rulesOverview.topics.slice(0, 5).map((topic) => ({
        id: topic.slug,
        name: topic.title,
        detail: topic.summary,
        action: topic.kicker,
      }))}
      faqItems={rulesOverview.faq}
    />
  );
}
