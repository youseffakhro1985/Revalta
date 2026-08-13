import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { listResidentMatchedLeases } from "@/lib/resident-portal-leases";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/resident-portal/bookings" });

const action = "booking.created";

export async function GET() {
  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return NextResponse.json({ error: "Endast boende kan använda denna yta" }, { status: 403 });
    }

    const leases = await listResidentMatchedLeases(user.company_id, user.email);
    const propertyIds = [...new Set(leases.map((lease) => lease.property_id))];

    const unitDesignations = leases.map((lease) => lease.unit.designation).filter(Boolean);
    const bookings = await db.booking.findMany({
      where: {
        company_id: user.company_id,
        property: { deleted_at: null },
        OR: [
          { created_by_id: user.id },
          ...(propertyIds.length > 0 && unitDesignations.length > 0
            ? [{
                property_id: { in: propertyIds },
                unit: { in: unitDesignations },
              }]
            : []),
        ],
      },
      orderBy: { start_at: "desc" },
      take: 200,
      include: { property: { select: { id: true, name: true, address: true, city: true } } },
    });

    return NextResponse.json({
      leases: leases.map((lease) => ({
        id: lease.id,
        leaseNumber: lease.lease_number,
        property: lease.property,
        unit: lease.unit,
        holderName: lease.lease_holder.contact_name || lease.lease_holder.name,
      })),
      bookings: bookings.map((booking) => ({
        id: booking.id,
        property: booking.property,
        resource: booking.resource,
        residentName: booking.resident_name,
        unit: booking.unit,
        start: booking.start_at.toISOString(),
        end: booking.end_at.toISOString(),
        note: booking.note,
        status: booking.status,
        createdByMe: booking.created_by_id === user.id,
        createdAt: booking.created_at,
      })),
    });
  } catch (error) {
    logger.error("Get resident bookings error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return NextResponse.json({ error: "Endast boende kan använda denna yta" }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`resident-booking:${user.id}:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många bokningar. Vänta en stund och prova igen." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const leaseId = String(body.leaseId || "").trim();
    const resource = String(body.resource || "").trim();
    const start = new Date(String(body.start || ""));
    const end = new Date(String(body.end || ""));
    const note = String(body.note || "").trim();

    if (!leaseId || !resource || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "Kontrollera avtal, resurs och tid" }, { status: 400 });
    }
    if (resource.length > 120 || note.length > 1000) {
      return NextResponse.json({ error: "En eller flera uppgifter är för långa" }, { status: 400 });
    }

    const leases = await listResidentMatchedLeases(user.company_id, user.email);
    const lease = leases.find((item) => item.id === leaseId);
    if (!lease) {
      return NextResponse.json({ error: "Hyresavtalet hittades inte" }, { status: 404 });
    }

    const conflict = await db.booking.findFirst({
      where: {
        company_id: user.company_id,
        property_id: lease.property_id,
        property: { deleted_at: null },
        resource,
        status: { not: "cancelled" },
        start_at: { lt: end },
        end_at: { gt: start },
      },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json({ error: "Tiden är redan bokad för denna resurs" }, { status: 409 });
    }

    const residentName = user.name?.trim()
      || lease.lease_holder.contact_name
      || lease.lease_holder.name
      || "Boende";

    const booking = await db.booking.create({
      data: {
        company_id: user.company_id,
        property_id: lease.property_id,
        resource,
        resident_name: residentName,
        unit: lease.unit.designation,
        start_at: start,
        end_at: end,
        note: note || null,
        status: "confirmed",
        created_by_id: user.id,
      },
      select: {
        id: true,
        resource: true,
        resident_name: true,
        unit: true,
        start_at: true,
        end_at: true,
        note: true,
        status: true,
        created_at: true,
        property: { select: { id: true, name: true, address: true, city: true } },
      },
    });

    await writeAuditLog(user, {
      entityType: "booking",
      entityId: booking.id,
      action,
      metadata: {
        property_id: lease.property_id,
        property_name: lease.property.name,
        resource,
        resident_name: residentName,
        unit: lease.unit.designation,
        start: start.toISOString(),
        end: end.toISOString(),
        note,
        status: "confirmed",
        storage: "Booking",
        accessMode: "resident_self_service",
        leaseId: lease.id,
      },
    });

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        property: booking.property,
        resource: booking.resource,
        residentName: booking.resident_name,
        unit: booking.unit,
        start: booking.start_at.toISOString(),
        end: booking.end_at.toISOString(),
        note: booking.note,
        status: booking.status,
        createdByMe: true,
        createdAt: booking.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Create resident booking error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return NextResponse.json({ error: "Endast boende kan använda denna yta" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { bookingId?: unknown; status?: unknown };
    const bookingId = String(body.bookingId || "").trim();
    const status = String(body.status || "").trim();
    if (!bookingId || status !== "cancelled") {
      return NextResponse.json({ error: "Endast avbokning stöds" }, { status: 400 });
    }

    const booking = await db.booking.findFirst({
      where: {
        id: bookingId,
        company_id: user.company_id,
        created_by_id: user.id,
        property: { deleted_at: null },
      },
      select: { id: true, status: true },
    });
    if (!booking) {
      return NextResponse.json({ error: "Bokningen hittades inte" }, { status: 404 });
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled" },
      select: { id: true, status: true },
    });

    await writeAuditLog(user, {
      entityType: "booking",
      entityId: booking.id,
      action: "booking.cancelled",
      metadata: { accessMode: "resident_self_service", previousStatus: booking.status },
    });

    return NextResponse.json({ success: true, booking: updated });
  } catch (error) {
    logger.error("Cancel resident booking error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
