import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "inspection.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 300,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    return NextResponse.json({
      inspections: logs.map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
      })),
      properties,
    });
  } catch (error) {
    console.error("Get inspections error:", error);
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
    const title = String(body.title || "").trim();
    const dueDate = String(body.dueDate || "").trim();
    const responsible = String(body.responsible || "").trim();
    const supplier = String(body.supplier || "").trim();
    const intervalMonths = Number(body.intervalMonths || 0);
    const status = String(body.status || "planned").trim();
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["ovk", "sba", "elevator", "energy", "radon", "pressure", "playground", "electrical", "other"]);
    const allowedStatuses = new Set(["planned", "booked", "completed", "action_required"]);

    if (!propertyId || !title || !dueDate || !allowedTypes.has(type) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, kontrolltyp, namn och förfallodatum krävs" }, { status: 400 });
    }
    if (!Number.isFinite(intervalMonths) || intervalMonths < 0 || intervalMonths > 240) {
      return NextResponse.json({ error: "Kontrollera intervallet" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        property_name: property.name,
        type,
        title,
        due_date: dueDate,
        responsible,
        supplier,
        interval_months: intervalMonths,
        status,
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create inspection error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
