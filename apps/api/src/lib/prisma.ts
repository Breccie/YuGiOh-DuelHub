import { PrismaClient } from "../../generated/prisma";

type PrismaGlobal = typeof globalThis & {
  __apiPrismaClient?: PrismaClient;
};

export function getPrisma() {
  const globalForPrisma = globalThis as PrismaGlobal;

  if (!globalForPrisma.__apiPrismaClient) {
    globalForPrisma.__apiPrismaClient = new PrismaClient();
  }

  return globalForPrisma.__apiPrismaClient;
}
