import db from "@/lib/db";
import { auditScopedWhere, canManageAccessCredentials, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "access.credential.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageAccessCredentials(user.role)) return NextResponse.json({ error: "Du saknar behörighet att visa nycklar och passage" }, { status: 403 });

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
      credentials: logs.map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
      })),
      properties,
    });
  } catch (error) {
    console.error("Get access credentials error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageAccessCredentials(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const identifier = String(body.identifier || "").trim();
    const credentialType = String(body.credentialType || "key").trim();
    const holder = String(body.holder || "").trim();
    const unit = String(body.unit || "").trim();
    const accessArea = String(body.accessArea || "").trim();
    const status = String(body.status || "in_stock").trim();
    const issuedAt = String(body.issuedAt || "").trim();
    const returnDue = String(body.returnDue || "").trim();
    const note = String(body.note || "").trim();

    const allowedTypes = new Set(["key", "tag", "card", "code", "remote"]);
    const allowedStatuses = new Set(["in_stock", "issued", "returned", "blocked", "lost"]);
    if (!propertyId || !identifier || !allowedTypes.has(credentialType) || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Fastighet, identitet, typ och giltig status krävs" }, { status: 400 });
    }
    if (status === "issued" && !holder) {
      return NextResponse.json({ error: "Mottagare krävs vid utlämning" }, { status: 400 });
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
        identifier,
        credential_type: credentialType,
        holder,
        unit,
        access_area: accessArea,
        status,
        issued_at: issuedAt || null,
        return_due: returnDue || null,
        note,
        registered_by: user.name || user.email,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create access credential error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
