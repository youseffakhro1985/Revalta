import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTeam, canViewOperations, getCurrentUser } from "@/lib/current-user";

type ActiveLockRow = {
  work_order_id: string;
  work_order_number: string | null;
  title: string;
  status: string;
  priority: string;
  property_id: string;
  property_name: string;
  property_address: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  acquired_at: Date;
  expires_at: Date;
  updated_at: Date;
};

type ForceReleaseRow = {
  work_order_id: string;
  work_order_number: string | null;
  title: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  expires_at: Date;
};

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

async function clearExpiredLocks(companyId: string) {
  return db.$executeRaw(Prisma.sql`
    DELETE FROM "WorkOrderEditLock"
    WHERE "company_id" = ${companyId}
      AND "expires_at" <= CURRENT_TIMESTAMP
  `);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canViewOperations(user.role)) return noStore({ error: "Du saknar behörighet att visa driftläget" }, { status: 403 });

  const removedExpired = await clearExpiredLocks(user.company_id);
  const rows = await db.$queryRaw<ActiveLockRow[]>(Prisma.sql`
    SELECT l."work_order_id",
           w."work_order_number",
           w."title",
           w."status",
           w."priority",
           p."id" AS "property_id",
           p."name" AS "property_name",
           p."address" AS "property_address",
           u."id" AS "user_id",
           u."name" AS "user_name",
           u."email" AS "user_email",
           l."acquired_at",
           l."expires_at",
           l."updated_at"
    FROM "WorkOrderEditLock" l
    INNER JOIN "WorkOrder" w ON w."id" = l."work_order_id" AND w."company_id" = l."company_id" AND w."deleted_at" IS NULL
    INNER JOIN "Property" p ON p."id" = w."property_id" AND p."company_id" = l."company_id"
    INNER JOIN "User" u ON u."id" = l."user_id" AND u."company_id" = l."company_id"
    WHERE l."company_id" = ${user.company_id}
      AND l."expires_at" > CURRENT_TIMESTAMP
    ORDER BY l."expires_at" ASC, l."acquired_at" ASC
    LIMIT 500
  `);

  const now = Date.now();
  return noStore({
    locks: rows.map((row) => ({
      workOrderId: row.work_order_id,
      workOrderNumber: row.work_order_number,
      title: row.title,
      status: row.status,
      priority: row.priority,
      property: { id: row.property_id, name: row.property_name, address: row.property_address },
      holder: { id: row.user_id, name: row.user_name, email: row.user_email },
      acquiredAt: row.acquired_at,
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
      remainingSeconds: Math.max(0, Math.ceil((row.expires_at.getTime() - now) / 1000)),
    })),
    removedExpired,
    canForceRelease: canManageTeam(user.role),
    generatedAt: new Date(now),
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTeam(user.role)) return noStore({ error: "Endast ägare och administratörer kan frigöra andra användares lås" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { workOrderId?: unknown; reason?: unknown } | null;
  const workOrderId = typeof body?.workOrderId === "string" ? body.workOrderId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!workOrderId) return noStore({ error: "Arbetsorder-id krävs" }, { status: 400 });
  if (!reason) return noStore({ error: "Ange varför låset ska frigöras" }, { status: 400 });
  if (reason.length > 500) return noStore({ error: "Orsaken får vara högst 500 tecken" }, { status: 400 });

  const companyId = user.company_id;
  const notificationKey = `work-order-lock-forced:${workOrderId}:${randomUUID()}`;
  const occurredAt = new Date();
  const actorName = user.name || user.email;

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ForceReleaseRow[]>(Prisma.sql`
      SELECT l."work_order_id", w."work_order_number", w."title", u."id" AS "user_id",
             u."name" AS "user_name", u."email" AS "user_email", l."expires_at"
      FROM "WorkOrderEditLock" l
      INNER JOIN "WorkOrder" w ON w."id" = l."work_order_id" AND w."company_id" = l."company_id" AND w."deleted_at" IS NULL
      INNER JOIN "User" u ON u."id" = l."user_id" AND u."company_id" = l."company_id"
      WHERE l."work_order_id" = ${workOrderId}
        AND l."company_id" = ${companyId}
      LIMIT 1
      FOR UPDATE
    `);

    const lock = rows[0];
    if (!lock) return { ok: false as const, code: "not_found" as const };

    const removed = await tx.$executeRaw(Prisma.sql`
      DELETE FROM "WorkOrderEditLock"
      WHERE "work_order_id" = ${workOrderId}
        AND "company_id" = ${companyId}
    `);
    if (removed !== 1) return { ok: false as const, code: "conflict" as const };

    const reference = lock.work_order_number || lock.title;
    const notificationPayload = {
      notificationKey,
      title: "Ditt redigeringslås frigjordes",
      description: `${actorName} frigjorde redigeringslåset för ${reference}. Orsak: ${reason}`,
      dueAt: occurredAt.toISOString(),
      href: `/dashboard/arbetsorder/${workOrderId}`,
      high: true,
      workOrderId,
      workOrderNumber: lock.work_order_number,
      workOrderTitle: lock.title,
      releasedById: user.id,
      releasedByName: actorName,
      reason,
    };

    await tx.integrationEvent.create({
      data: {
        company_id: companyId,
        type: "work_order_edit_lock_forced_release",
        status: "unread",
        recipient: lock.user_id,
        payload: notificationPayload,
      },
    });

    await tx.auditLog.create({
      data: {
        company_id: companyId,
        actor_user_id: user.id,
        entity_type: "work_order",
        entity_id: workOrderId,
        action: "work_order.edit_lock.force_released",
        metadata: {
          workOrderNumber: lock.work_order_number,
          title: lock.title,
          previousHolderId: lock.user_id,
          previousHolderName: lock.user_name,
          previousHolderEmail: lock.user_email,
          previousExpiresAt: lock.expires_at.toISOString(),
          notificationKey,
          reason,
        },
      },
    });

    return { ok: true as const, lock };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!result.ok && result.code === "not_found") return noStore({ error: "Något aktivt lås hittades inte" }, { status: 404 });
  if (!result.ok) return noStore({ error: "Låset kunde inte frigöras" }, { status: 409 });

  return noStore({ released: true, workOrderId, notifiedUserId: result.lock.user_id });
}
