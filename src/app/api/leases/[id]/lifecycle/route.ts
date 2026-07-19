import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";

const occupyingStatuses = ["reserved", "active", "notice"];
const transitions: Record<string, Record<string, string>> = {
  draft: { reserve: "reserved", activate: "active", cancel: "cancelled" },
  reserved: { activate: "active", cancel: "cancelled" },
  active: { give_notice: "notice", end: "ended" },
  notice: { withdraw_notice: "active", end: "ended" },
};

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function parseDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(`${value.trim()}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const lease = await db.lease.findFirst({
      where: { id, company_id: user.company_id },
      select: { id: true, lease_number: true, status: true, start_date: true, notice_date: true, end_date: true, ended_at: true, updated_at: true },
    });
    if (!lease) return noStore({ error: "Avtalet hittades inte" }, { status: 404 });

    const history = await db.auditLog.findMany({
      where: { company_id: user.company_id, entity_type: "lease", entity_id: id, action: { startsWith: "lease.lifecycle." } },
      orderBy: { created_at: "desc" },
      take: 100,
      select: { id: true, action: true, metadata: true, created_at: true, actor: { select: { name: true, email: true } } },
    });

    return noStore({ lease, history, permissions: { canManage: canManageLeases(user.role) } });
  } catch (error) {
    console.error("Get lease lifecycle error:", error);
    return noStore({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return noStore({ error: "Du saknar behörighet att hantera avtal" }, { status: 403 });
    if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

    const existing = await db.lease.findFirst({ where: { id, company_id: user.company_id } });
    if (!existing) return noStore({ error: "Avtalet hittades inte" }, { status: 404 });

    const nextStatus = transitions[existing.status]?.[action];
    if (!nextStatus) return noStore({ error: "Åtgärden är inte tillåten från avtalets nuvarande status" }, { status: 409 });

    const effectiveDate = parseDate(body?.effectiveDate);
    if (!effectiveDate) return noStore({ error: "Ange ett giltigt datum" }, { status: 400 });

    if (occupyingStatuses.includes(nextStatus)) {
      const conflict = await db.lease.findFirst({
        where: { id: { not: existing.id }, company_id: user.company_id, unit_id: existing.unit_id, status: { in: occupyingStatuses } },
        select: { lease_number: true },
      });
      if (conflict) return noStore({ error: `Objektet har redan ett pågående avtal (${conflict.lease_number})` }, { status: 409 });
    }

    if ((action === "activate" || action === "reserve") && existing.end_date && effectiveDate > existing.end_date) {
      return noStore({ error: "Startdatum kan inte ligga efter avtalets slutdatum" }, { status: 400 });
    }
    if (action === "give_notice" && existing.end_date && effectiveDate > existing.end_date) {
      return noStore({ error: "Uppsägningsdatum kan inte ligga efter avtalets slutdatum" }, { status: 400 });
    }
    if (action === "end" && existing.start_date && effectiveDate < existing.start_date) {
      return noStore({ error: "Avflyttningsdatum kan inte ligga före avtalets startdatum" }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const lease = await tx.lease.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          start_date: action === "activate" ? existing.start_date || effectiveDate : existing.start_date,
          notice_date: action === "give_notice" ? effectiveDate : action === "withdraw_notice" ? null : existing.notice_date,
          end_date: action === "end" ? effectiveDate : existing.end_date,
          ended_at: action === "end" || action === "cancel" ? new Date() : null,
          note: note ? [existing.note, note].filter(Boolean).join("\n\n") : existing.note,
        },
        include: {
          property: { select: { id: true, name: true, address: true, city: true } },
          unit: { select: { id: true, designation: true, unit_type: true, floor: true, area: true, status: true } },
          lease_holder: true,
          created_by: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          company_id: user.company_id!,
          actor_user_id: user.id,
          entity_type: "lease",
          entity_id: existing.id,
          action: `lease.lifecycle.${action}`,
          metadata: {
            leaseNumber: existing.lease_number,
            previousStatus: existing.status,
            status: nextStatus,
            effectiveDate: effectiveDate.toISOString(),
            propertyId: existing.property_id,
            unitId: existing.unit_id,
            leaseHolderId: existing.lease_holder_id,
            note,
          },
        },
      });
      return lease;
    });

    return noStore({ success: true, lease: updated });
  } catch (error) {
    console.error("Update lease lifecycle error:", error);
    return noStore({ error: "Internt serverfel" }, { status: 500 });
  }
}
