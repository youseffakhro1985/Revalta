import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "insurance_claim.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
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
      claims: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      properties,
    });
  } catch (error) {
    console.error("Get insurance claims error:", error);
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
    const title = String(body.title || "").trim();
    const damageType = String(body.damageType || "other").trim();
    const incidentDate = String(body.incidentDate || "").trim();
    const location = String(body.location || "").trim();
    const insurer = String(body.insurer || "").trim();
    const claimNumber = String(body.claimNumber || "").trim();
    const responsible = String(body.responsible || "").trim();
    const status = String(body.status || "reported").trim();
    const estimatedCost = Number(body.estimatedCost || 0);
    const deductible = Number(body.deductible || 0);
    const compensation = Number(body.compensation || 0);
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["water", "fire", "theft", "storm", "liability", "machine", "glass", "other"]);
    const allowedStatuses = new Set(["reported", "investigating", "awaiting_insurer", "repairing", "settled", "closed"]);
    if (!propertyId || !title || !allowedTypes.has(damageType) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, rubrik och giltig status krävs" }, { status: 400 });
    }
    if (![estimatedCost, deductible, compensation].every((value) => Number.isFinite(value) && value >= 0)) {
      return NextResponse.json({ error: "Kontrollera ekonomiska belopp" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        property_name: property.name,
        title,
        damage_type: damageType,
        incident_date: incidentDate || null,
        location,
        insurer,
        claim_number: claimNumber,
        responsible,
        status,
        estimated_cost: estimatedCost,
        deductible,
        compensation,
        net_cost: Math.max(0, estimatedCost - compensation),
        note,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create insurance claim error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
