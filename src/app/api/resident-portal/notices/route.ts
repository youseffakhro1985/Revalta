import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { listResidentMatchedLeases } from "@/lib/resident-portal-leases";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/resident-portal/notices";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const publishedStatuses = new Set(["sent", "paid", "overdue", "cancelled", "issued", "published"]);

function asNumber(value: { toString(): string } | number | null | undefined) {
  return Number(value ?? 0);
}

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
) {
  return observability.correlate(NextResponse.json(body, { headers: SUCCESS_HEADERS }));
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
  observability.logger.warn("resident notice request rejected", observability.elapsed({
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
        event: "resident_notices.list.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Endast boende kan använda denna yta",
        event: "resident_notices.list.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const leases = await listResidentMatchedLeases(user.company_id, user.email);
    const leaseIds = leases.map((lease) => lease.id);
    const propertyIds = [...new Set(leases.map((lease) => lease.property_id))];

    const notices = leaseIds.length === 0
      ? []
      : await db.rentNotice.findMany({
          where: {
            company_id: user.company_id,
            property: { deleted_at: null },
            status: { not: "draft" },
            OR: [
              { lease_id: { in: leaseIds } },
              {
                lease_id: null,
                property_id: { in: propertyIds },
                unit: { in: leases.map((lease) => lease.unit.designation).filter(Boolean) },
              },
            ],
          },
          orderBy: { due_date: "desc" },
          take: 200,
          include: { property: { select: { id: true, name: true, address: true, city: true } } },
        });

    const visible = notices.filter((notice) => (
      publishedStatuses.has(notice.status) || notice.status !== "draft"
    ));

    observability.logger.info("resident notice list completed", observability.elapsed({
      event: "resident_notices.list.completed",
      userId: user.id,
      companyId: user.company_id,
      leaseCount: leases.length,
      noticeCount: visible.length,
    }));

    return successResponse(observability, {
      leases: leases.map((lease) => ({
        id: lease.id,
        leaseNumber: lease.lease_number,
        property: lease.property,
        unit: lease.unit,
      })),
      notices: visible.map((notice) => ({
        id: notice.id,
        property: notice.property,
        leaseId: notice.lease_id,
        tenantName: notice.tenant_name,
        unit: notice.unit,
        period: notice.period,
        dueDate: notice.due_date.toISOString().slice(0, 10),
        status: notice.status,
        baseRent: asNumber(notice.base_rent),
        indexPercent: asNumber(notice.index_percent),
        indexedRent: asNumber(notice.indexed_rent),
        additions: asNumber(notice.additions),
        deductions: asNumber(notice.deductions),
        total: asNumber(notice.total),
        note: notice.note,
        createdAt: notice.created_at,
      })),
    });
  } catch (error) {
    observability.logger.error("resident notice list failed", error, observability.elapsed({
      event: "resident_notices.list.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
