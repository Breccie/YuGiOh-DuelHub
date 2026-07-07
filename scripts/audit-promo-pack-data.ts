import { PrismaClient } from "@prisma/client";
import { classifyPromoSource } from "../apps/frontend/src/lib/promo-source-classification";

const prisma = new PrismaClient();

type IssueSeverity = "error" | "warning";

type AuditIssue = {
  severity: IssueSeverity;
  code: string;
  subject: string;
  message: string;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}

function isTournamentPackName(name: string) {
  const normalized = normalize(name);

  return (
    normalized.includes("tournament pack") ||
    normalized.includes("champion pack") ||
    normalized.includes("turbo pack") ||
    normalized.includes("astral pack") ||
    normalized.includes("ots tournament pack")
  );
}

function looksLikePromoName(name: string) {
  const normalized = normalize(name);

  return (
    normalized.includes("mcdonald") ||
    normalized.includes("jump") ||
    normalized.includes("manga") ||
    normalized.includes("video game") ||
    normalized.includes("game promotional") ||
    normalized.includes("movie") ||
    normalized.includes("dvd") ||
    normalized.includes("duelist league") ||
    normalized.includes("hobby league") ||
    normalized.includes("sneak peek") ||
    normalized.includes("prize card") ||
    normalized.includes("world championship prize")
  );
}

function addIssue(issues: AuditIssue[], issue: AuditIssue) {
  issues.push(issue);
}

async function main() {
  const issues: AuditIssue[] = [];
  const [sets, promoSources] = await Promise.all([
    prisma.cardSet.findMany({
      orderBy: [{ releaseDate: "asc" }, { code: "asc" }],
      include: {
        _count: {
          select: {
            setCards: true,
          },
        },
      },
    }),
    prisma.promoSource.findMany({
      orderBy: [{ availableFrom: "asc" }, { code: "asc" }],
      include: {
        set: true,
        _count: {
          select: {
            cards: true,
          },
        },
      },
    }),
  ]);

  const promoSourceBySetId = new Map(
    promoSources
      .filter((source) => source.setId)
      .map((source) => [source.setId!, source]),
  );

  for (const source of promoSources) {
    if (source._count.cards === 0) {
      addIssue(issues, {
        severity: "error",
        code: "promo_source_without_cards",
        subject: source.code,
        message: `${source.name} hat keine PromoSourceCard-Einträge.`,
      });
    }

    if (!source.availableFrom) {
      addIssue(issues, {
        severity: "warning",
        code: "promo_source_missing_available_from",
        subject: source.code,
        message: `${source.name} hat kein availableFrom-Datum.`,
      });
    }

    if (source.set && isTournamentPackName(source.set.name) && source.sourceType !== "PACK_REWARD") {
      addIssue(issues, {
        severity: "error",
        code: "tournament_pack_as_claimable_promo",
        subject: source.code,
        message: `${source.set.name} ist ein Tournament-Pack und darf keine frei claimbare PromoSource sein.`,
      });
    }
  }

  for (const set of sets) {
    const source = promoSourceBySetId.get(set.id);
    const classification = classifyPromoSource(set);
    const tournamentPack = isTournamentPackName(set.name);
    const promoLike = looksLikePromoName(set.name);

    if (source && set.isOpenable && source.sourceType !== "PACK_REWARD") {
      addIssue(issues, {
        severity: "error",
        code: "openable_pack_as_promo",
        subject: set.code,
        message: `${set.name} ist openable, hat aber eine claimbare PromoSource.`,
      });
    }

    if (tournamentPack && (!set.isOpenable || set.productType === "PROMO")) {
      addIssue(issues, {
        severity: "error",
        code: "tournament_pack_wrongly_classified",
        subject: set.code,
        message: `${set.name} sollte als Pack-/Reward-Produkt openable sein, nicht als Promo.`,
      });
    }

    if (promoLike && !tournamentPack && set.isOpenable && set.productType === "PROMO") {
      addIssue(issues, {
        severity: "warning",
        code: "promo_marked_openable",
        subject: set.code,
        message: `${set.name} sieht wie eine Promo aus, ist aber als openable markiert.`,
      });
    }

    if (classification && !source) {
      addIssue(issues, {
        severity: "warning",
        code: "missing_promo_source",
        subject: set.code,
        message: `${set.name} sieht wie eine Promo-Quelle aus, hat aber keine PromoSource.`,
      });
    }

    if (set.productType === "PROMO" && !classification && !source && set._count.setCards > 0) {
      addIssue(issues, {
        severity: "warning",
        code: "unclassified_promo_set",
        subject: set.code,
        message: `${set.name} ist als PROMO klassifiziert, aber nicht als PromoSource erkannt.`,
      });
    }
  }

  const summary = {
    checkedSets: sets.length,
    checkedPromoSources: promoSources.length,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
  };

  console.log(JSON.stringify({ summary, issues }, null, 2));

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
