import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Alias kept for schema-readiness helpers that previously used a base client. */
export function getPrismaBaseClient() {
  return db;
}

export default db;
