import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";
import { PATCH as updateWorkOrder } from "../route";

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return noStore({ error: "Du saknar behörighet att redigera arbetsordrar" }, { status: 403 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) return noStore({ error: "Ogiltigt innehåll" }, { status: 400 });

  const editToken = typeof body.editToken === "string" ? body.editToken.trim() : "";
  const version = typeof body.version === "string" ? body.version.trim() : "";
  if (!editToken || !version) {
    return noStore({ error: "Ett aktivt redigeringslås och en dokumentversion krävs", code: "lock_required" }, { status: 409 });
  }

  const expectedVersion = new Date(version);
  if (Number.isNaN(expectedVersion.getTime())) {
    return noStore({ error: "Ogiltig arbetsorderversion", code: "invalid_version" }, { status: 400 });
  }

  const [workOrderGuard, propertyGuard] = await Promise.all([
    sqlSoftDeleteGuard(db, "WorkOrder", "w"),
    sqlSoftDeleteGuard(db, "Property", "p"),
  ]);
  const rows = await db.$queryRaw<Array<{ updated_at: Date; lock_valid: boolean }>>(Prisma.sql`
    SELECT w."updated_at",
           EXISTS (
             SELECT 1
             FROM "WorkOrderEditLock" l
             WHERE l."work_order_id" = w."id"
               AND l."company_id" = w."company_id"
               AND l."user_id" = ${user.id}
               AND l."token_hash" = ${hashToken(editToken)}
               AND l."expires_at" > CURRENT_TIMESTAMP
           ) AS "lock_valid"
    FROM "WorkOrder" w
    INNER JOIN "Property" p ON p."id" = w."property_id" AND p."company_id" = w."company_id"
    WHERE w."id" = ${id} AND w."company_id" = ${user.company_id}
      ${workOrderGuard}
      ${propertyGuard}
    LIMIT 1
  `);

  const current = rows[0];
  if (!current) return noStore({ error: "Arbetsordern hittades inte" }, { status: 404 });
  if (!current.lock_valid) {
    return noStore({ error: "Redigeringslåset har gått förlorat. Ladda om arbetsordern.", code: "lock_lost" }, { status: 409 });
  }
  if (current.updated_at.getTime() !== expectedVersion.getTime()) {
    return noStore(
      {
        error: "Arbetsordern har ändrats av någon annan sedan du öppnade den. Ladda om innan du sparar.",
        code: "version_conflict",
        currentVersion: current.updated_at.toISOString(),
      },
      { status: 409 },
    );
  }

  const { editToken: _editToken, version: _version, ...updateBody } = body;
  void _editToken;
  void _version;
  const delegatedRequest = new Request(request.url.replace("/locked-update", ""), {
    method: "PATCH",
    headers: request.headers,
    body: JSON.stringify(updateBody),
  });
  return updateWorkOrder(delegatedRequest, context);
}
