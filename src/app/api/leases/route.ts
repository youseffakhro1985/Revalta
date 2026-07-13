import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "lease.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action },
        orderBy: { created_at: "desc" },
        take: 400,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    return NextResponse.json({
      leases: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      properties,
    });
  } catch (error) {
    console.error("Get leases error:", error);
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
    const objectType = String(body.objectType || "apartment").trim();
    const unit = String(body.unit || "").trim();
    const tenantName = String(body.tenantName || "").trim();
    const status = String(body.status || "vacant").trim();
    const startDate = String(body.startDate || "").trim();
    const endDate = String(body.endDate || "").trim();
    const noticeDate = String(body.noticeDate || "").trim();
    const monthlyRent = Number(body.monthlyRent || 0);
    const area = Number(body.area || 0);
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["apartment", "commercial", "parking", "garage", "storage", "other"]);
    const allowedStatuses = new Set(["vacant", "reserved", "active", "notice", "ended"]);
    if (!propertyId || !unit || !allowedTypes.has(objectType) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, objekt och giltig status krävs" }, { status: 400 });
    }
    if (![monthlyRent, area].every((value) => Number.isFinite(value) && value >= 0)) {
      return NextResponse.json({ error: "Kontrollera hyra och area" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        property_name: property.name,
        object_type: objectType,
        unit,
        tenant_name: tenantName,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
        notice_date: noticeDate || null,
        monthly_rent: monthlyRent,
        area,
        annual_rent: monthlyRent * 12,
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create lease error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
