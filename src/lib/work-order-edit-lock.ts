import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";

const DEFAULT_LEASE_SECONDS = 120;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 300;

type LockRow = {
  work_order_id: string;
  company_id: string;
  user_id: string;
  acquired_at: Date;
  expires_at: Date;
  updated_at: Date;
  user_name: string | null;
  user_email: string;
};

function normalizeLeaseSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LEASE_SECONDS;
  return Math.min(MAX_LEASE_SECONDS, Math.max(MIN_LEASE_SECONDS, Math.round(parsed)));
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createToken() {
  return randomBytes(32).toString("base64url");
}

export async function acquireWorkOrderEditLock(args: {
  companyId: string;
  workOrderId: string;
  userId: string;
  leaseSeconds?: unknown;
}) {
  const leaseSeconds = normalizeLeaseSeconds(args.leaseSeconds);
  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + leaseSeconds * 1000);

  return db.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findFirst({
      where: { id: args.workOrderId, company_id: args.companyId },
      select: { id: true, updated_at: true },
    });
    if (!workOrder) return { ok: false as const, code: "not_found" as const };

    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "WorkOrderEditLock"
      WHERE "work_order_id" = ${args.workOrderId}
        AND "company_id" = ${args.companyId}
        AND "expires_at" <= CURRENT_TIMESTAMP
    `);

    const existing = await tx.$queryRaw<LockRow[]>(Prisma.sql`
      SELECT l."work_order_id", l."company_id", l."user_id", l."acquired_at", l."expires_at", l."updated_at",
             u."name" AS "user_name", u."email" AS "user_email"
      FROM "WorkOrderEditLock" l
      INNER JOIN "User" u ON u."id" = l."user_id"
      WHERE l."work_order_id" = ${args.workOrderId}
        AND l."company_id" = ${args.companyId}
      LIMIT 1
      FOR UPDATE
    `);

    const current = existing[0];
    if (current && current.user_id !== args.userId) {
      return {
        ok: false as const,
        code: "locked" as const,
        holder: {
          userId: current.user_id,
          name: current.user_name,
          email: current.user_email,
          acquiredAt: current.acquired_at,
          expiresAt: current.expires_at,
        },
        version: workOrder.updated_at,
      };
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderEditLock"
        ("work_order_id", "company_id", "user_id", "token_hash", "acquired_at", "expires_at", "updated_at")
      VALUES
        (${args.workOrderId}, ${args.companyId}, ${args.userId}, ${tokenHash}, CURRENT_TIMESTAMP, ${expiresAt}, CURRENT_TIMESTAMP)
      ON CONFLICT ("work_order_id") DO UPDATE
      SET "user_id" = EXCLUDED."user_id",
          "token_hash" = EXCLUDED."token_hash",
          "expires_at" = EXCLUDED."expires_at",
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "WorkOrderEditLock"."company_id" = EXCLUDED."company_id"
        AND "WorkOrderEditLock"."user_id" = EXCLUDED."user_id"
    `);

    return {
      ok: true as const,
      token,
      expiresAt,
      leaseSeconds,
      version: workOrder.updated_at,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function renewWorkOrderEditLock(args: {
  companyId: string;
  workOrderId: string;
  userId: string;
  token: string;
  leaseSeconds?: unknown;
}) {
  const leaseSeconds = normalizeLeaseSeconds(args.leaseSeconds);
  const expiresAt = new Date(Date.now() + leaseSeconds * 1000);
  const tokenHash = hashToken(args.token);

  const changed = await db.$executeRaw(Prisma.sql`
    UPDATE "WorkOrderEditLock"
    SET "expires_at" = ${expiresAt}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "work_order_id" = ${args.workOrderId}
      AND "company_id" = ${args.companyId}
      AND "user_id" = ${args.userId}
      AND "token_hash" = ${tokenHash}
      AND "expires_at" > CURRENT_TIMESTAMP
  `);

  return changed === 1
    ? { ok: true as const, expiresAt, leaseSeconds }
    : { ok: false as const, code: "lock_lost" as const };
}

export async function releaseWorkOrderEditLock(args: {
  companyId: string;
  workOrderId: string;
  userId: string;
  token: string;
}) {
  const tokenHash = hashToken(args.token);
  const changed = await db.$executeRaw(Prisma.sql`
    DELETE FROM "WorkOrderEditLock"
    WHERE "work_order_id" = ${args.workOrderId}
      AND "company_id" = ${args.companyId}
      AND "user_id" = ${args.userId}
      AND "token_hash" = ${tokenHash}
  `);
  return { ok: changed === 1 };
}

export async function getWorkOrderEditLock(companyId: string, workOrderId: string) {
  await db.$executeRaw(Prisma.sql`
    DELETE FROM "WorkOrderEditLock"
    WHERE "work_order_id" = ${workOrderId}
      AND "company_id" = ${companyId}
      AND "expires_at" <= CURRENT_TIMESTAMP
  `);

  const rows = await db.$queryRaw<LockRow[]>(Prisma.sql`
    SELECT l."work_order_id", l."company_id", l."user_id", l."acquired_at", l."expires_at", l."updated_at",
           u."name" AS "user_name", u."email" AS "user_email"
    FROM "WorkOrderEditLock" l
    INNER JOIN "User" u ON u."id" = l."user_id"
    WHERE l."work_order_id" = ${workOrderId}
      AND l."company_id" = ${companyId}
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.user_name,
    email: row.user_email,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}
