import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/** Explicit select avoids querying soft-delete columns that may not exist yet. */
const propertyListSelect = (ticketActive: { deleted_at: null } | Record<string, never>) => ({
  id: true,
  name: true,
  address: true,
  postal_code: true,
  city: true,
  property_identifier: true,
  property_type: true,
  status: true,
  created_at: true,
  updated_at: true,
  _count: {
    select: { tickets: { where: ticketActive }, buildings: true, units: true },
  },
} as const);

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
  observability.logger.warn("property request rejected", observability.elapsed({
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
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "properties.list.unauthorized",
      });
    }

    const [propertyActive, ticketActive] = await Promise.all([
      notDeletedFilter("Property"),
      notDeletedFilter("Ticket"),
    ]);
    const properties = await db.property.findMany({
      where: { ...propertyActive, ...tenantWhere(user) },
      orderBy: { created_at: "desc" },
      select: propertyListSelect(ticketActive),
      // Safety cap: the property list is not yet paginated client-side, but must
      // not be truly unbounded for a very large multi-property landlord/company.
      take: 2000,
    });

    observability.logger.info("property list completed", observability.elapsed({
      event: "properties.list.completed",
      userId: user.id,
      companyId: user.company_id,
      returned: properties.length,
      canCreate: canCreateProperties(user.role),
    }));

    return successResponse(observability, {
      properties,
      permissions: { canCreate: canCreateProperties(user.role) },
    });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      observability.logger.error("property list schema unavailable", error, observability.elapsed({
        event: "properties.list.schema_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId: observability.requestId,
      });
    }

    observability.logger.error("property list failed", error, observability.elapsed({
      event: "properties.list.failed",
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
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "properties.create.unauthorized",
      });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa fastigheter",
        event: "properties.create.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltigt innehåll",
        event: "properties.create.validation_failed",
        context: { reason: "invalid_body", userId: user.id, companyId: user.company_id },
      });
    }

    const normalizedName = typeof body.name === "string" ? body.name.trim() : "";
    const normalizedAddress = typeof body.address === "string" ? body.address.trim() : "";
    const normalizedPostalCode = typeof body.postalCode === "string" && body.postalCode.trim() ? body.postalCode.trim() : null;
    const normalizedCity = typeof body.city === "string" ? body.city.trim() : "";

    if (!normalizedName || !normalizedAddress || !normalizedCity) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Namn, adress och ort krävs",
        event: "properties.create.validation_failed",
        context: { reason: "missing_required_fields", userId: user.id, companyId: user.company_id },
      });
    }
    if (
      normalizedName.length > 160
      || normalizedAddress.length > 240
      || (normalizedPostalCode?.length ?? 0) > 32
      || normalizedCity.length > 120
    ) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "En eller flera fastighetsuppgifter är för långa",
        event: "properties.create.validation_failed",
        context: { reason: "field_too_long", userId: user.id, companyId: user.company_id },
      });
    }

    const ticketActive = await notDeletedFilter("Ticket");
    const property = await db.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          name: normalizedName,
          address: normalizedAddress,
          postal_code: normalizedPostalCode,
          city: normalizedCity,
          company_id: user.company_id,
          user_id: user.id,
        },
        select: propertyListSelect(ticketActive),
      });
      await writeAuditLog(user, {
        entityType: "property",
        entityId: created.id,
        action: "property.created",
        metadata: { name: created.name, address: created.address, city: created.city },
      }, tx);
      return created;
    });

    observability.logger.info("property create completed", observability.elapsed({
      event: "properties.create.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: property.id,
    }));
    return successResponse(observability, { success: true, property }, { status: 201 });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      observability.logger.error("property create schema unavailable", error, observability.elapsed({
        event: "properties.create.schema_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId: observability.requestId,
      });
    }

    observability.logger.error("property create failed", error, observability.elapsed({
      event: "properties.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
