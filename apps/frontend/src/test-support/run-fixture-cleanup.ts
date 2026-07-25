import type { PrismaClient } from "@prisma/client";

export async function deleteRunFixture(prisma: PrismaClient, runId: string) {
  // PostgreSQL evaluates the historical rule-version RESTRICT constraints
  // before the run's cascading deletes. Remove those audit consumers first.
  await prisma.packOpening.deleteMany({ where: { runId } });
  await prisma.packOpeningBatch.deleteMany({ where: { runId } });
  await prisma.rewardGrant.deleteMany({ where: { runId } });
  await prisma.runProgressionCheckpoint.deleteMany({ where: { runId } });
  await prisma.tournament.deleteMany({ where: { runId } });
  await prisma.playGroupRun.deleteMany({ where: { id: runId } });
}
