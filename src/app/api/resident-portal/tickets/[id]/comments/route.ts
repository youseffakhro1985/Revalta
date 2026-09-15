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
import { queueTicketNotification } from "@/lib/integrations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  canCommentOnResidentPortalTicket,
  findAccessibleResidentPortalTicket,
} from "@/lib/resident-portal-tickets";
import { createRouteObservability } from "@/lib/route-observability";
import { getPublicAppUrl } from "@/lib/app-url";

const ROUTE = "/api/resident-portal/tickets/[id]/comments";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readCommentBody(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return String(form?.get("body") || "").trim();
  }
  const bodyJson = await request.json().catch(() => ({})) as { body?: unknown };
  return typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
}

function ticketPath(id: string) {
  return `/dashboard/boendeportal/arenden/${encodeURIComponent(id)}`;
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
  observability.logger.warn("resident ticket comment request rejected", observability.elapsed({
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const observability = createRouteObservability(request, ROUTE);
  const nativeForm = isNativeFormPost(request);
  const { id } = await params;

  const nativeRedirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, getPublicAppUrl(request.url)), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return observability.correlate(response);
  };

  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) {
      if (nativeForm) return nativeRedirect("/login");
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_tickets.comments.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role) || !canCommentOnResidentPortalTicket(user.role)) {
      if (nativeForm) return nativeRedirect(`${ticketPath(id)}?reason=forbidden`);
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att kommentera",
        event: "resident_tickets.comments.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`resident-comment:${user.id}:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      if (nativeForm) return nativeRedirect(`${ticketPath(id)}?reason=rate`);
      return reject(observability, {
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många kommentarer. Vänta en stund och prova igen.",
        event: "resident_tickets.comments.rate_limited",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await readCommentBody(request);
    if (!body) {
      if (nativeForm) return nativeRedirect(`${ticketPath(id)}?reason=invalid`);
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Kommentaren får inte vara tom",
        event: "resident_tickets.comments.validation_failed",
        context: { reason: "empty_comment", userId: user.id, companyId: user.company_id },
      });
    }
    if (body.length > 5_000) {
      if (nativeForm) return nativeRedirect(`${ticketPath(id)}?reason=invalid`);
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Kommentaren är för lång",
        event: "resident_tickets.comments.validation_failed",
        context: { reason: "comment_too_long", userId: user.id, companyId: user.company_id },
      });
    }

    const ticket = await findAccessibleResidentPortalTicket(user, id);
    if (!ticket?.company_id) {
      if (nativeForm) return nativeRedirect("/dashboard/boendeportal?reason=missing");
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Ärendet hittades inte",
        event: "resident_tickets.comments.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const authorName = isResident(user.role)
      ? (user.name?.trim() || ticket.reporter_name || "Boende")
      : (user.name?.trim() || "Förvaltningen");
    const authorType = isResident(user.role) ? "resident" : "staff";
    const authorEmail = isResident(user.role)
      ? (ticket.reporter_email || user.email)
      : user.email;

    const comment = await db.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticket_id: ticket.id,
          user_id: isResident(user.role) ? ticket.user_id : user.id,
          body,
          is_internal: false,
          author_type: authorType,
          author_name: authorName,
          author_email: authorEmail,
        },
        select: {
          id: true,
          body: true,
          created_at: true,
          author_type: true,
          author_name: true,
        },
      });

      await writeAuditLog(user, {
        entityType: "ticket",
        entityId: ticket.id,
        action: isResident(user.role) ? "resident_portal.comment_created" : "ticket.comment_created",
        metadata: {
          commentId: created.id,
          accessMode: isResident(user.role) ? "resident_self_service" : "operations",
          schemaVersion: 2,
        },
      }, tx);

      return created;
    });

    if (isResident(user.role) && ticket.company_id) {
      try {
        await queueTicketNotification({ company_id: ticket.company_id }, {
          ticketId: ticket.id,
          title: ticket.title,
          recipient: authorEmail,
          event: "commented",
        });
      } catch {
        observability.logger.warn("resident ticket comment notification failed", observability.elapsed({
          event: "resident_tickets.comments.notification_failed",
          userId: user.id,
          companyId: user.company_id,
          ticketId: ticket.id,
          commentId: comment.id,
        }));
      }
    }

    observability.logger.info("resident ticket comment created", observability.elapsed({
      event: "resident_tickets.comments.completed",
      userId: user.id,
      companyId: user.company_id,
      ticketId: ticket.id,
      commentId: comment.id,
      authorType,
    }));

    if (nativeForm) return nativeRedirect(`${ticketPath(ticket.id)}?commented=1`);
    return observability.correlate(NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        author: {
          type: comment.author_type === "resident" ? "resident" : "management",
          name: comment.author_name || authorName,
        },
      },
    }, { status: 201, headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("resident ticket comment create failed", error, observability.elapsed({
      event: "resident_tickets.comments.failed",
    }));
    if (nativeForm) return nativeRedirect(`${ticketPath(id)}?reason=error`);
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
