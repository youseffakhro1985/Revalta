import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  canExportTickets,
  canManageTickets,
  getCurrentUser,
  shouldScopeToAssignedWork,
  tenantWhere,
} from "@/lib/current-user";
import { notDeletedFilter } from "@/lib/schema-readiness";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/tickets/dashboard";
const CLOSED_STATUSES = ["completed", "closed"];
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
) {
  const headers = new Headers(SUCCESS_HEADERS);
  return observability.correlate(NextResponse.json(body, { headers }));
}

function startOfMonth(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function startOfTrend(value = new Date()) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  date.setDate(date.getDate() - 89);
  return date;
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }

    const ticketActive = await notDeletedFilter("Ticket");
    const scopedToAssigned = shouldScopeToAssignedWork(user.role);
    const tenantScope: Prisma.TicketWhereInput = {
      ...ticketActive,
      ...tenantWhere(user),
      ...(scopedToAssigned ? { assigned_to_id: user.id } : {}),
    };
    const propertyScope: Prisma.TicketWhereInput = {
      OR: [{ property_id: null }, { property: { deleted_at: null } }],
    };
    const baseWhere: Prisma.TicketWhereInput = {
      ...tenantScope,
      AND: [propertyScope],
    };

    const monthStart = startOfMonth();
    const trendStart = startOfTrend();

    const [
      total,
      open,
      urgent,
      inProgress,
      completedThisMonth,
      statusGroups,
      categoryGroups,
      trendRows,
    ] = await Promise.all([
      db.ticket.count({ where: baseWhere }),
      db.ticket.count({ where: { ...baseWhere, status: { notIn: CLOSED_STATUSES } } }),
      db.ticket.count({ where: { ...baseWhere, priority: "urgent", status: { notIn: CLOSED_STATUSES } } }),
      db.ticket.count({ where: { ...baseWhere, status: "in_progress" } }),
      db.ticket.count({
        where: {
          ...baseWhere,
          status: { in: CLOSED_STATUSES },
          updated_at: { gte: monthStart },
        },
      }),
      db.ticket.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
      db.ticket.groupBy({
        by: ["category"],
        where: baseWhere,
        _count: { _all: true },
      }),
      db.ticket.findMany({
        where: {
          ...tenantScope,
          AND: [
            propertyScope,
            {
              OR: [
                { created_at: { gte: trendStart } },
                { updated_at: { gte: trendStart } },
              ],
            },
          ],
        },
        orderBy: { created_at: "desc" },
        take: 5000,
        select: {
          created_at: true,
          updated_at: true,
          status: true,
        },
      }),
    ]);

    observability.logger.info("ticket dashboard completed", observability.elapsed({
      event: "tickets.dashboard.completed",
      userId: user.id,
      companyId: user.company_id,
      total,
      trendRows: trendRows.length,
      scopedToAssigned,
    }));

    return successResponse(observability, {
      summary: {
        total,
        open,
        urgent,
        inProgress,
        completedThisMonth,
      },
      statusCounts: Object.fromEntries(statusGroups.map((row) => [row.status, row._count._all])),
      categoryCounts: Object.fromEntries(categoryGroups.map((row) => [row.category, row._count._all])),
      trendStart: trendStart.toISOString(),
      trendRows: trendRows.map((row) => ({
        created_at: row.created_at,
        updated_at: row.updated_at,
        status: row.status,
      })),
      truncatedTrend: trendRows.length >= 5000,
      permissions: {
        canManage: canManageTickets(user.role),
        canExport: canExportTickets(user.role),
        scopedToAssigned,
      },
    });
  } catch (error) {
    observability.logger.error("ticket dashboard failed", error, observability.elapsed({
      event: "tickets.dashboard.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Kunde inte hämta ärendeöversikten",
      requestId: observability.requestId,
    });
  }
}
