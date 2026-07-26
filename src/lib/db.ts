import { PrismaClient } from "@prisma/client";
import { sanitizeSoftDeleteArgs } from "@/lib/soft-delete-compat";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  softDeleteMiddlewareInstalled?: boolean;
};

function createPrismaClient() {
  const client = new PrismaClient();

  // Middleware keeps PrismaClient typings stable (unlike $extends) while
  // stripping soft-delete filters/columns when migrations are not deployed yet.
  client.$use(async (params, next) => {
    if (params.model) {
      params.args = await sanitizeSoftDeleteArgs(client, params.model, params.action, params.args);
    } else if (params.args) {
      params.args = await sanitizeSoftDeleteArgs(client, undefined, params.action, params.args);
    }
    return next(params);
  });

  return client;
}

const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export function getPrismaBaseClient() {
  return db;
}

export default db;
