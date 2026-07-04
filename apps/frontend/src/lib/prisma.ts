import { PrismaClient } from "@prisma/client";

type PrismaGlobal = typeof globalThis & {
  __prismaClient?: PrismaClient;
};

export function getPrisma() {
  const globalForPrisma = globalThis as PrismaGlobal;

  if (!globalForPrisma.__prismaClient) {
    globalForPrisma.__prismaClient = new PrismaClient();
  }

  return globalForPrisma.__prismaClient;
}
