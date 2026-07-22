import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  source: "database" | "unavailable";
};

let cleanupCounter = 0;

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
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
    });

    cleanupCounter += 1;
    if (cleanupCounter % 100 === 0) {
      void db.rateLimitAttempt
        .deleteMany({ where: { created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
        .catch(() => undefined);
    }

    return { ...result, source: "database" };
  } catch (error) {
    console.error("Persistent rate limiter unavailable; denying request", error);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + Math.min(windowMs, 60_000)),
      source: "unavailable",
    };
  }
}

export function getClientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
