import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "maintenance.plan.item";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action },
        orderBy: { created_at: "asc" },
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    return NextResponse.json({
      items: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      properties,
    });
  } catch (error) {
    console.error("Get maintenance plan error:", error);
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
    const component = String(body.component || "").trim();
    const measure = String(body.measure || "").trim();
    const plannedYear = Number(body.plannedYear);
    const estimatedCost = Number(body.estimatedCost);
    const priority = String(body.priority || "normal");
    const intervalYears = Number(body.intervalYears || 0);

    if (!propertyId || !component || !measure || !Number.isInteger(plannedYear) || plannedYear < 2020 || !Number.isFinite(estimatedCost) || estimatedCost < 0) {
      return NextResponse.json({ error: "Kontrollera fastighet, byggnadsdel, åtgärd, år och kostnad" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: { property_name: property.name, component, measure, planned_year: plannedYear, estimated_cost: estimatedCost, priority, interval_years: intervalYears, status: "planned" },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create maintenance item error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
