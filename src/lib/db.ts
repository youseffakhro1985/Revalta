import { PrismaClient } from "@prisma/client";
import { sanitizeSoftDeleteArgs } from "@/lib/soft-delete-compat";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Raw / connection actions must never enter soft-delete sanitizing (avoids $queryRaw recursion). */
const PASSTHROUGH_ACTIONS = new Set([
  "queryRaw",
  "queryRawUnsafe",
  "executeRaw",
  "executeRawUnsafe",
  "runCommandRaw",
]);

export function shouldSanitizeSoftDeleteParams(params: {
  model?: string;
  action: string;
}): boolean {
  if (!params.model) return false;
  if (PASSTHROUGH_ACTIONS.has(params.action)) return false;
  return true;
}

function createPrismaClient() {
  const client = new PrismaClient();

  // Middleware keeps PrismaClient typings stable while stripping soft-delete
  // filters/columns when migrations are not deployed yet on shared preview DBs.
  client.$use(async (params, next) => {
    if (shouldSanitizeSoftDeleteParams(params)) {
      params.args = await sanitizeSoftDeleteArgs(
        client,
        params.model,
        params.action,
        params.args,
      );
    }
    return next(params);
  });

  return client;
}

const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Same client; readiness uses $queryRaw which bypasses soft-delete middleware. */
export function getPrismaBaseClient() {
  return db;
}

export default db;
