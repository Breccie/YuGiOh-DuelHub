import { notFound, redirect } from "next/navigation";
import { RuleArticleConsole } from "@/components/rule-article-console";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRuleTopicData, getRulesOverviewData } from "@/lib/rules-data";

type RulesSlugPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function RulesSlugPage({ params }: RulesSlugPageProps) {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const { slug } = await params;
  const [topic, overview] = await Promise.all([
    getRuleTopicData(slug),
    getRulesOverviewData(),
  ]);

  if (!topic) {
    notFound();
  }

  return (
    <RuleArticleConsole
      viewer={{
        displayName: session.displayName,
      }}
      topic={topic}
      relatedTopics={overview.topics
        .filter((candidate) => candidate.slug !== topic.slug)
        .slice(0, 5)}
    />
  );
}
