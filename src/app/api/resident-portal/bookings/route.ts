import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
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
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/resident-portal/bookings";
const action = "booking.created";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(SUCCESS_HEADERS)) headers.set(name, value);
  return observability.correlate(NextResponse.json(body, { ...init, headers }));
}

function reject(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("resident booking request rejected", observability.elapsed({
    event: options.event,
    ...options.context,
  }));
  return apiErrorResponse({
    status: options.status,
    code: options.code,
    message: options.message,
    requestId: observability.requestId,
  });
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_bookings.list.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Endast boende kan använda denna yta",
        event: "resident_bookings.list.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
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

    observability.logger.info("resident booking list completed", observability.elapsed({
      event: "resident_bookings.list.completed",
      userId: user.id,
      companyId: user.company_id,
      leaseCount: leases.length,
      bookingCount: bookings.length,
    }));

    return successResponse(observability, {
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
    observability.logger.error("resident booking list failed", error, observability.elapsed({
      event: "resident_bookings.list.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_bookings.create.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Endast boende kan använda denna yta",
        event: "resident_bookings.create.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`resident-booking:${user.id}:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return reject(observability, {
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många bokningar. Vänta en stund och prova igen.",
        event: "resident_bookings.create.rate_limited",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const leaseId = String(body.leaseId || "").trim();
    const resource = String(body.resource || "").trim();
    const start = new Date(String(body.start || ""));
    const end = new Date(String(body.end || ""));
    const note = String(body.note || "").trim();
    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "resident_bookings.create.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id },
    });

    if (!leaseId || !resource || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return validationFailure("Kontrollera avtal, resurs och tid", "invalid_booking_input");
    }
    if (resource.length > 120 || note.length > 1000) {
      return validationFailure("En eller flera uppgifter är för långa", "field_too_long");
    }

    const leases = await listResidentMatchedLeases(user.company_id, user.email);
    const lease = leases.find((item) => item.id === leaseId);
    if (!lease) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Hyresavtalet hittades inte",
        event: "resident_bookings.create.lease_not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const residentName = user.name?.trim()
      || lease.lease_holder.contact_name
      || lease.lease_holder.name
      || "Boende";
    const lockKey = `resident-booking:${user.company_id}:${lease.property_id}:${resource.toLocaleLowerCase("sv-SE")}`;

    const bookingResult = await db.$transaction(async (tx) => {
      // Serialize create attempts for the same tenant/property/resource. The
      // conflict check must happen after this lock so two concurrent requests
      // cannot both observe an empty slot and double-book it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const conflict = await tx.booking.findFirst({
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
      if (conflict) return { conflict: true as const, booking: null };

      const booking = await tx.booking.create({
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
      }, tx);

      return { conflict: false as const, booking };
    });

    if (bookingResult.conflict) {
      return reject(observability, {
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: "Tiden är redan bokad för denna resurs",
        event: "resident_bookings.create.conflict",
        context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
      });
    }

    const booking = bookingResult.booking;
    observability.logger.info("resident booking created", observability.elapsed({
      event: "resident_bookings.create.completed",
      userId: user.id,
      companyId: user.company_id,
      bookingId: booking.id,
      leaseId: lease.id,
    }));

    return successResponse(observability, {
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
    observability.logger.error("resident booking create failed", error, observability.elapsed({
      event: "resident_bookings.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function PATCH(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_bookings.cancel.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Endast boende kan använda denna yta",
        event: "resident_bookings.cancel.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await request.json().catch(() => ({})) as { bookingId?: unknown; status?: unknown };
    const bookingId = String(body.bookingId || "").trim();
    const status = String(body.status || "").trim();
    if (!bookingId || status !== "cancelled") {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Endast avbokning stöds",
        event: "resident_bookings.cancel.validation_failed",
        context: { reason: "invalid_cancel_request", userId: user.id, companyId: user.company_id },
      });
    }

    const updated = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: bookingId,
          company_id: user.company_id,
          created_by_id: user.id,
          property: { deleted_at: null },
        },
        select: { id: true, status: true },
      });
      if (!booking) return null;

      const cancelled = await tx.booking.update({
        where: { id: booking.id },
        data: { status: "cancelled" },
        select: { id: true, status: true },
      });

      await writeAuditLog(user, {
        entityType: "booking",
        entityId: booking.id,
        action: "booking.cancelled",
        metadata: { accessMode: "resident_self_service", previousStatus: booking.status },
      }, tx);

      return cancelled;
    });

    if (!updated) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Bokningen hittades inte",
        event: "resident_bookings.cancel.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    observability.logger.info("resident booking cancelled", observability.elapsed({
      event: "resident_bookings.cancel.completed",
      userId: user.id,
      companyId: user.company_id,
      bookingId: updated.id,
    }));
    return successResponse(observability, { success: true, booking: updated });
  } catch (error) {
    observability.logger.error("resident booking cancel failed", error, observability.elapsed({
      event: "resident_bookings.cancel.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
