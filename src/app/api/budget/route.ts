import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "budget.entry.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({ where: { company_id: user.company_id ?? undefined, action }, orderBy: { created_at: "desc" }, take: 600, select: { id: true, entity_id: true, metadata: true, created_at: true } }),
      db.property.findMany({ where: tenantWhere(user), orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ entries: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })), properties });
  } catch (error) {
    console.error("Get budget error:", error);
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
    const year = Number(body.year || new Date().getFullYear());
    const category = String(body.category || "other").trim();
    const account = String(body.account || "").trim();
    const budget = Number(body.budget || 0);
    const forecast = Number(body.forecast || 0);
    const actual = Number(body.actual || 0);
    const note = String(body.note || "").trim();
    const allowed = new Set(["income", "operations", "maintenance", "energy", "administration", "finance", "investment", "other"]);

    if (!propertyId || !account || !Number.isInteger(year) || year < 2000 || year > 2100 || !allowed.has(category)) return NextResponse.json({ error: "Fastighet, år, kostnadsslag och konto krävs" }, { status: 400 });
    if ([budget, forecast, actual].some((value) => !Number.isFinite(value))) return NextResponse.json({ error: "Kontrollera beloppen" }, { status: 400 });

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    await writeAuditLog(user, { entityType: "property", entityId: property.id, action, metadata: { property_name: property.name, year, category, account, budget, forecast, actual, variance_budget: actual - budget, variance_forecast: actual - forecast, note } });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create budget error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
