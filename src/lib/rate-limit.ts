import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  source: "database" | "memory_fallback";
};

const fallbackBuckets = new Map<string, Bucket>();
let cleanupCounter = 0;

export const RATE_LIMIT_TRANSACTION_OPTIONS = {
  maxWait: 1_500,
  timeout: 2_500,
} as const;

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function checkMemoryFallback(keyHash: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = fallbackBuckets.get(keyHash);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    fallbackBuckets.set(keyHash, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt: new Date(resetAt), source: "memory_fallback" };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: new Date(bucket.resetAt), source: "memory_fallback" };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetAt: new Date(bucket.resetAt),
    source: "memory_fallback",
  };
}

export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const keyHash = hashKey(key);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    const result = await db.$transaction(async (tx) => {
      // A transaction-scoped advisory lock makes the count-and-insert operation
      // deterministic even when several Vercel instances receive the same request.
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${keyHash})::bigint)
      `);

      await tx.rateLimitAttempt.deleteMany({
        where: { key_hash: keyHash, created_at: { lt: windowStart } },
      });

      const count = await tx.rateLimitAttempt.count({
        where: { key_hash: keyHash, created_at: { gte: windowStart } },
      });

      if (count >= limit) {
        const oldest = await tx.rateLimitAttempt.findFirst({
          where: { key_hash: keyHash, created_at: { gte: windowStart } },
          orderBy: { created_at: "asc" },
          select: { created_at: true },
        });
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date((oldest?.created_at ?? now).getTime() + windowMs),
        };
      }

      await tx.rateLimitAttempt.create({ data: { key_hash: keyHash } });
      return { allowed: true, remaining: Math.max(0, limit - count - 1), resetAt };
    }, RATE_LIMIT_TRANSACTION_OPTIONS);

    cleanupCounter += 1;
    if (cleanupCounter % 100 === 0) {
      void db.rateLimitAttempt
        .deleteMany({ where: { created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
        .catch(() => undefined);
    }

    return { ...result, source: "database" };
  } catch (error) {
    console.error(
      "Persistent rate limiter unavailable; using bounded in-memory fallback",
      error instanceof Error ? error.name : "UnknownError",
    );
    return checkMemoryFallback(keyHash, limit, windowMs);
  }
}

export function getClientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
