import db from "@/lib/db";
import {
  auditScopedWhere,
  canManageLeases,
  canManageTickets,
  canViewLeasingData,
  getCurrentUser,
  tenantWhere,
} from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isModernStorageMirror, mergeByCreatedAt, loadLegacyRows } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "booking.created";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    if (!canManageTickets(user.role) && !canViewLeasingData(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa bokningar" }, { status: 403 });
    }

    const includeResidentPii = canViewLeasingData(user.role);
    const [rows, legacyLogs, properties] = await Promise.all([
      db.booking.findMany({
        where: { company_id: user.company_id, property: { deleted_at: null } },
        orderBy: { created_at: "desc" },
        take: 250,
        include: { property: { select: { name: true } } },
      }),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "desc" },
        take: 250,
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      })),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      resource: row.resource,
      resident_name: includeResidentPii ? row.resident_name : null,
      unit: includeResidentPii ? (row.unit || "") : "",
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      note: includeResidentPii ? (row.note || "") : "",
      status: row.status,
      created_at: row.created_at,
      source: "table" as const,
    }));

    const modernIds = new Set(modern.map((row) => row.id));
    const activePropertyIds = new Set(properties.map((property) => property.id));
    const legacy = legacyLogs
      .filter((log) => !isModernStorageMirror(log.metadata, "Booking", modernIds, log.entity_id) && !modernIds.has(log.id))
      .filter((log) => !log.entity_id || activePropertyIds.has(log.entity_id))
      .map((log) => {
        const metadata = (log.metadata || {}) as Record<string, unknown>;
        return {
          id: log.id,
          property_id: log.entity_id,
          ...metadata,
          resident_name: includeResidentPii ? metadata.resident_name ?? metadata.residentName ?? null : null,
          unit: includeResidentPii ? metadata.unit ?? "" : "",
          note: includeResidentPii ? metadata.note ?? "" : "",
          created_at: log.created_at,
          source: "legacy" as const,
        };
      });

    return NextResponse.json({
      bookings: mergeByCreatedAt(modern, legacy, 250),
      properties,
      permissions: {
        canManage: canManageLeases(user.role),
        canViewResidentDetails: includeResidentPii,
      },
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
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
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
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const [tableConflicts, legacyRows] = await Promise.all([
      db.booking.findFirst({
        where: {
          company_id: user.company_id,
          property_id: property.id,
          property: { deleted_at: null },
          resource,
          status: { not: "cancelled" },
          start_at: { lt: end },
          end_at: { gt: start },
        },
        select: { id: true },
      }),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action, entity_id: propertyId },
        select: { metadata: true },
        take: 250,
      })),
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

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageLeases(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json();
    const bookingId = String(body.bookingId || body.id || "").trim();
    if (!bookingId) return NextResponse.json({ error: "Boknings-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = hasStatus ? String(body.status).trim() : "";
    const fieldKeys = ["resource", "residentName", "unit", "start", "end", "note"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    if (!hasStatus && !hasFieldUpdate) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }
    if (hasStatus && status !== "cancelled") {
      return NextResponse.json({ error: "Endast avbokning (cancelled) stöds som statusändring" }, { status: 400 });
    }

    const modern = await db.booking.findFirst({
      where: { id: bookingId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        property_id: true,
        status: true,
        resource: true,
        resident_name: true,
        unit: true,
        start_at: true,
        end_at: true,
        note: true,
      },
    });

    if (!modern) {
      const orphaned = await db.booking.findFirst({
        where: { id: bookingId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Bokningen hittades inte" }, { status: 404 });
      }
      const legacy = await db.auditLog.findFirst({
        where: { ...auditScopedWhere(user), action, id: bookingId },
        select: { id: true },
      });
      if (legacy) {
        return NextResponse.json({
          error: "Bokningen finns kvar i äldre lagring. Kör backfill till Booking innan den kan uppdateras.",
        }, { status: 409 });
      }
      return NextResponse.json({ error: "Bokningen hittades inte" }, { status: 404 });
    }

    if (hasStatus && status === "cancelled") {
      if (modern.status === "cancelled") return NextResponse.json({ success: true, alreadyCancelled: true });
      const updateResult = await db.booking.updateMany({
        where: { id: modern.id, company_id: user.company_id },
        data: { status: "cancelled" },
      });
      if (updateResult.count === 0) return NextResponse.json({ error: "Bokningen hittades inte" }, { status: 404 });

      await writeAuditLog(user, {
        entityType: "booking",
        entityId: modern.id,
        action: "booking.cancelled",
        metadata: {
          previousStatus: modern.status,
          status: "cancelled",
          resource: modern.resource,
          resident_name: modern.resident_name,
          storage: "Booking",
        },
      });
      return NextResponse.json({ success: true });
    }

    if (modern.status === "cancelled") {
      return NextResponse.json({ error: "Avbokade bokningar kan inte ändras" }, { status: 400 });
    }

    let resource = modern.resource;
    let residentName = modern.resident_name;
    let unit = modern.unit || "";
    let start = modern.start_at;
    let end = modern.end_at;
    let note = modern.note || "";

    if (body.resource !== undefined) resource = String(body.resource || "").trim();
    if (body.residentName !== undefined) residentName = String(body.residentName || "").trim();
    if (body.unit !== undefined) unit = String(body.unit || "").trim();
    if (body.start !== undefined) start = new Date(String(body.start || ""));
    if (body.end !== undefined) end = new Date(String(body.end || ""));
    if (body.note !== undefined) note = String(body.note || "").trim();

    if (!resource || !residentName || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "Kontrollera resurs, boende och tid" }, { status: 400 });
    }
    if (resource.length > 120 || residentName.length > 160 || unit.length > 80 || note.length > 1000) {
      return NextResponse.json({ error: "En eller flera uppgifter är för långa" }, { status: 400 });
    }

    const conflict = await db.booking.findFirst({
      where: {
        company_id: user.company_id,
        property_id: modern.property_id,
        property: { deleted_at: null },
        resource,
        status: { not: "cancelled" },
        id: { not: modern.id },
        start_at: { lt: end },
        end_at: { gt: start },
      },
      select: { id: true },
    });
    if (conflict) return NextResponse.json({ error: "Tiden är redan bokad för denna resurs" }, { status: 409 });

    const updateResult = await db.booking.updateMany({
      where: { id: modern.id, company_id: user.company_id },
      data: {
        resource,
        resident_name: residentName,
        unit: unit || null,
        start_at: start,
        end_at: end,
        note: note || null,
      },
    });
    if (updateResult.count === 0) return NextResponse.json({ error: "Bokningen hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "booking",
      entityId: modern.id,
      action: "booking.updated",
      metadata: {
        resource,
        resident_name: residentName,
        unit,
        start: start.toISOString(),
        end: end.toISOString(),
        note,
        storage: "Booking",
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update booking error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
