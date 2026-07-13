import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "booking.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [logs, properties] = await Promise.all([
      db.auditLog.findMany({
        where: { company_id: user.company_id ?? undefined, action },
        orderBy: { created_at: "desc" },
        take: 250,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    return NextResponse.json({
      bookings: logs.map((log) => ({ id: log.id, property_id: log.entity_id, ...(log.metadata as object), created_at: log.created_at })),
      properties,
    });
  } catch (error) {
    console.error("Get bookings error:", error);
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
    const resource = String(body.resource || "").trim();
    const residentName = String(body.residentName || "").trim();
    const unit = String(body.unit || "").trim();
    const start = new Date(String(body.start || ""));
    const end = new Date(String(body.end || ""));
    const note = String(body.note || "").trim();

    if (!propertyId || !resource || !residentName || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "Kontrollera fastighet, resurs, boende och tid" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const existing = await db.auditLog.findMany({
      where: { company_id: user.company_id ?? undefined, action, entity_id: propertyId },
      select: { metadata: true },
      take: 250,
    });

    const conflict = existing.some((row) => {
      const metadata = row.metadata as Record<string, unknown> | null;
      if (!metadata || metadata.resource !== resource || metadata.status === "cancelled") return false;
      const bookedStart = new Date(String(metadata.start || ""));
      const bookedEnd = new Date(String(metadata.end || ""));
      return start < bookedEnd && end > bookedStart;
    });

    if (conflict) return NextResponse.json({ error: "Tiden är redan bokad för denna resurs" }, { status: 409 });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        property_name: property.name,
        resource,
        resident_name: residentName,
        unit,
        start: start.toISOString(),
        end: end.toISOString(),
        note,
        status: "confirmed",
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Create booking error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
