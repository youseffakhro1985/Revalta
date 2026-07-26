import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { NextResponse } from "next/server";

const action = "booking.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [rows, legacyLogs, properties] = await Promise.all([
      db.booking.findMany({
        where: { company_id: user.company_id },
        orderBy: { created_at: "desc" },
        take: 250,
        include: { property: { select: { name: true } } },
      }),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
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

    const modernIds = new Set(rows.map((row) => row.id));
    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      resource: row.resource,
      resident_name: row.resident_name,
      unit: row.unit || "",
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      note: row.note || "",
      status: row.status,
      created_at: row.created_at,
      source: "table" as const,
    }));

    const legacy = legacyLogs
      .filter((log) => !modernIds.has(log.id))
      .map((log) => ({
        id: log.id,
        property_id: log.entity_id,
        ...(log.metadata as object),
        created_at: log.created_at,
        source: "legacy" as const,
      }));

    return NextResponse.json({
      bookings: [...modern, ...legacy].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, 250),
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
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

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
    if (resource.length > 120 || residentName.length > 160 || unit.length > 80 || note.length > 1000) {
      return NextResponse.json({ error: "En eller flera uppgifter är för långa" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const [tableConflicts, legacyRows] = await Promise.all([
      db.booking.findFirst({
        where: {
          company_id: user.company_id,
          property_id: property.id,
          resource,
          status: { not: "cancelled" },
          start_at: { lt: end },
          end_at: { gt: start },
        },
        select: { id: true },
      }),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action, entity_id: propertyId },
        select: { metadata: true },
        take: 250,
      }),
    ]);

    if (tableConflicts) {
      return NextResponse.json({ error: "Tiden är redan bokad för denna resurs" }, { status: 409 });
    }

    const legacyConflict = legacyRows.some((row) => {
      const metadata = row.metadata as Record<string, unknown> | null;
      if (!metadata || metadata.resource !== resource || metadata.status === "cancelled") return false;
      const bookedStart = new Date(String(metadata.start || ""));
      const bookedEnd = new Date(String(metadata.end || ""));
      return start < bookedEnd && end > bookedStart;
    });
    if (legacyConflict) return NextResponse.json({ error: "Tiden är redan bokad för denna resurs" }, { status: 409 });

    const booking = await db.booking.create({
      data: {
        company_id: user.company_id,
        property_id: property.id,
        resource,
        resident_name: residentName,
        unit: unit || null,
        start_at: start,
        end_at: end,
        note: note || null,
        status: "confirmed",
        created_by_id: user.id,
      },
      select: { id: true, created_at: true },
    });

    await writeAuditLog(user, {
      entityType: "booking",
      entityId: booking.id,
      action,
      metadata: {
        property_id: property.id,
        property_name: property.name,
        resource,
        resident_name: residentName,
        unit,
        start: start.toISOString(),
        end: end.toISOString(),
        note,
        status: "confirmed",
        storage: "Booking",
      },
    });

    return NextResponse.json({ success: true, booking }, { status: 201 });
  } catch (error) {
    console.error("Create booking error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
