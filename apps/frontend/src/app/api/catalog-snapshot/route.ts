import { NextResponse } from "next/server";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  try {
    const prisma = getPrisma();
    await requireViewerSession(prisma);

    const [cards, textVersions, sets, openableSets, collectionEntries, decks] = await Promise.all([
      prisma.card.count(),
      prisma.cardTextVersion.count(),
      prisma.cardSet.count(),
      prisma.cardSet.count({
        where: {
          isOpenable: true,
        },
      }),
      prisma.collectionEntry.count(),
      prisma.deck.count(),
    ]);

    const latestBanlist = await prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
      include: {
        formatProfile: true,
        entries: {
          orderBy: {
            allowedCopies: "asc",
          },
          take: 5,
          include: {
            card: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      scope: "internal-dev",
      counts: {
        cards,
        textVersions,
        sets,
        openableSets,
        collectionEntries,
        decks,
      },
      latestBanlist: latestBanlist
        ? {
            name: latestBanlist.name,
            effectiveFrom: latestBanlist.effectiveFrom,
            errataPolicy:
              latestBanlist.errataPolicy ??
              latestBanlist.formatProfile.defaultErrataPolicy,
            format: latestBanlist.formatProfile.name,
            entries: latestBanlist.entries.map((entry) => ({
              card: entry.card.name,
              allowedCopies: entry.allowedCopies,
            })),
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Internal catalog snapshot is not available.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
