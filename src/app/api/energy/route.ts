import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "energy.reading.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 500,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true, total_area: true },
      }),
    ]);

    return NextResponse.json({
      readings: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      properties,
    });
  } catch (error) {
    console.error("Get energy readings error:", error);
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
    const type = String(body.type || "").trim();
    const period = String(body.period || "").trim();
    const unit = String(body.unit || "").trim();
    const value = Number(body.value || 0);
    const cost = Number(body.cost || 0);
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["electricity", "heating", "water"]);
    if (!propertyId || !allowedTypes.has(type) || !period || !unit) {
      return NextResponse.json({ error: "Fastighet, typ, period och enhet krävs" }, { status: 400 });
    }
    if (![value, cost].every((number) => Number.isFinite(number) && number >= 0)) {
      return NextResponse.json({ error: "Kontrollera förbrukning och kostnad" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, ...tenantWhere(user) },
      select: { id: true, name: true, total_area: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const area = Number(property.total_area || 0);
    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        property_name: property.name,
        type,
        period,
        unit,
        value,
        cost,
        value_per_sqm: area > 0 ? value / area : null,
        cost_per_sqm: area > 0 ? cost / area : null,
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create energy reading error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
