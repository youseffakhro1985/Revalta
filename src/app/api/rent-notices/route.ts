import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const noticeAction = "rent_notice.created";
const leaseAction = "lease.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [notices, leases, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action: noticeAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action: leaseAction },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    return NextResponse.json({
      notices: notices.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      leases: leases.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object) })),
      properties,
    });
  } catch (error) {
    console.error("Get rent notices error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const leaseId = String(body.leaseId || "").trim();
    const tenantName = String(body.tenantName || "").trim();
    const unit = String(body.unit || "").trim();
    const period = String(body.period || "").trim();
    const dueDate = String(body.dueDate || "").trim();
    const status = String(body.status || "draft").trim();
    const baseRent = Number(body.baseRent || 0);
    const additions = Number(body.additions || 0);
    const deductions = Number(body.deductions || 0);
    const indexPercent = Number(body.indexPercent || 0);
    const note = String(body.note || "").trim();

    const allowedStatuses = new Set(["draft", "sent", "paid", "overdue", "credited"]);
    if (!propertyId || !period || !dueDate || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, period, förfallodatum och giltig status krävs" }, { status: 400 });
    }
    if ([baseRent, additions, deductions, indexPercent].some((value) => !Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: "Kontrollera hyra, tillägg, avdrag och index" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const indexedRent = baseRent * (1 + indexPercent / 100);
    const total = Math.max(0, indexedRent + additions - deductions);

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action: noticeAction,
      metadata: {
        property_name: property.name,
        lease_id: leaseId || null,
        tenant_name: tenantName,
        unit,
        period,
        due_date: dueDate,
        status,
        base_rent: baseRent,
        index_percent: indexPercent,
        indexed_rent: indexedRent,
        additions,
        deductions,
        total,
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create rent notice error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
