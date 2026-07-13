import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "imd.reading.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({ where: { company_id: user.company_id ?? undefined, action }, orderBy: { created_at: "desc" }, take: 500, select: { id: true, entity_id: true, metadata: true, created_at: true } }),
      db.property.findMany({ where: tenantWhere(user), orderBy: { name: "asc" }, select: { id: true, name: true, address: true, city: true } }),
    ]);
    return NextResponse.json({ readings: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })), properties });
  } catch (error) {
    console.error("Get IMD readings error:", error);
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
    const unit = String(body.unit || "").trim();
    const meterId = String(body.meterId || "").trim();
    const type = String(body.type || "electricity").trim();
    const period = String(body.period || "").trim();
    const previousReading = Number(body.previousReading || 0);
    const currentReading = Number(body.currentReading || 0);
    const unitPrice = Number(body.unitPrice || 0);
    const note = String(body.note || "").trim();
    const allowedTypes = new Set(["electricity", "hot_water", "cold_water", "heating"]);
    if (!propertyId || !unit || !meterId || !period || !allowedTypes.has(type)) return NextResponse.json({ error: "Fyll i fastighet, objekt, mätare, typ och period" }, { status: 400 });
    if (![previousReading, currentReading, unitPrice].every((value) => Number.isFinite(value) && value >= 0) || currentReading < previousReading) return NextResponse.json({ error: "Kontrollera avläsningar och pris" }, { status: 400 });
    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
    const consumption = currentReading - previousReading;
    await writeAuditLog(user, { entityType: "property", entityId: property.id, action, metadata: { property_name: property.name, unit, meter_id: meterId, meter_type: type, period, previous_reading: previousReading, current_reading: currentReading, consumption, unit_price: unitPrice, charge: consumption * unitPrice, note } });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create IMD reading error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}