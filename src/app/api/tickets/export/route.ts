import db from "@/lib/db";
import {
  canExportTickets,
  getCurrentUser,
  requireCompanyUser,
} from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";

const MAX_EXPORT_ROWS = 50_000;
const CSV_FORMULA_PREFIX = /^[\s]*[=+\-@]/;

function successHeaders(requestId: string) {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="revalta-arenden.csv"',
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const withoutNullBytes = raw.replaceAll("\u0000", "");
  const spreadsheetSafe = CSV_FORMULA_PREFIX.test(withoutNullBytes)
    ? `'${withoutNullBytes}`
    : withoutNullBytes;

  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/tickets/export",
    method: "GET",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) {
      logger.warn("ticket export unauthorized", {
        eventCode: "tickets.export.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }

    const user = requireCompanyUser(rawUser);
    if (!user || !canExportTickets(user.role)) {
      logger.warn("ticket export forbidden", {
        eventCode: "tickets.export.forbidden",
        companyId: user?.company_id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att exportera ärenden",
        requestId,
      });
    }

    const ticketActive = await notDeletedFilter("Ticket");
    const propertyActive = await notDeletedFilter("Property");
    const tickets = await db.ticket.findMany({
      where: {
        company_id: user.company_id,
        ...ticketActive,
        OR: [
          { property_id: null },
          { property: { company_id: user.company_id, ...propertyActive } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: MAX_EXPORT_ROWS + 1,
      select: {
        public_reference: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        due_date: true,
        created_at: true,
        reporter_email: true,
        property: { select: { name: true } },
        assigned_to: { select: { email: true, name: true } },
      },
    });

    if (tickets.length > MAX_EXPORT_ROWS) {
      logger.warn("ticket export row limit exceeded", {
        eventCode: "tickets.export.limit_exceeded",
        companyId: user.company_id,
        maxRows: MAX_EXPORT_ROWS,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 413,
        code: API_ERROR_CODES.validationFailed,
        message: `Exporten innehåller fler än ${MAX_EXPORT_ROWS} ärenden och måste avgränsas innan den kan skapas`,
        requestId,
      });
    }

    const header = [
      "Referens",
      "Titel",
      "Status",
      "Prioritet",
      "Kategori",
      "Fastighet",
      "Ansvarig",
      "Reporter",
      "Skapad",
      "SLA",
    ];
    const rows = tickets.map((ticket) => [
      ticket.public_reference,
      ticket.title,
      ticket.status,
      ticket.priority,
      ticket.category,
      ticket.property?.name,
      ticket.assigned_to?.name || ticket.assigned_to?.email,
      ticket.reporter_email,
      ticket.created_at.toISOString(),
      ticket.due_date?.toISOString(),
    ]);

    const csvBody = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const csv = `\uFEFF${csvBody}`;

    try {
      await writeAuditLog(user, {
        entityType: "ticket_export",
        entityId: requestId,
        action: "tickets.exported",
        metadata: {
          format: "csv",
          rowCount: tickets.length,
          maxRows: MAX_EXPORT_ROWS,
        },
      });
    } catch (error) {
      logger.warn("ticket export audit failed", {
        eventCode: "tickets.export.audit_failed",
        companyId: user.company_id,
        rowCount: tickets.length,
        error,
      });
    }

    logger.info("ticket export succeeded", {
      eventCode: "tickets.export.succeeded",
      companyId: user.company_id,
      rowCount: tickets.length,
      byteLength: Buffer.byteLength(csv, "utf8"),
      latencyMs: Date.now() - startedAt,
    });

    return new Response(csv, { headers: successHeaders(requestId) });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("ticket export schema unavailable", {
        eventCode: "tickets.export.schema_unavailable",
        latencyMs: Date.now() - startedAt,
        error,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage,
        requestId,
      });
    }

    logger.error("ticket export failed", {
      eventCode: "tickets.export.failed",
      latencyMs: Date.now() - startedAt,
      error,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}
