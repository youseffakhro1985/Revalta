import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import {
  canAccessResidentPortal,
  getCurrentUser,
  requireCompanyMember,
} from "@/lib/current-user";
import {
  canCommentOnResidentPortalTicket,
  findAccessibleResidentPortalTicket,
  mapResidentPortalComments,
} from "@/lib/resident-portal-tickets";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/resident-portal/tickets/[id]";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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
  observability.logger.warn("resident ticket detail request rejected", observability.elapsed({
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_tickets.detail.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet till boendeportalen",
        event: "resident_tickets.detail.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const { id } = await params;
    const ticket = await findAccessibleResidentPortalTicket(user, id);
    if (!ticket) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Ärendet hittades inte",
        event: "resident_tickets.detail.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const comments = mapResidentPortalComments(ticket.comments, ticket.reporter_name);
    observability.logger.info("resident ticket detail completed", observability.elapsed({
      event: "resident_tickets.detail.completed",
      userId: user.id,
      companyId: user.company_id,
      ticketId: ticket.id,
      commentCount: comments.length,
    }));

    return observability.correlate(NextResponse.json({
      canComment: canCommentOnResidentPortalTicket(user.role),
      ticket: {
        id: ticket.id,
        public_reference: ticket.public_reference,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        reporter_name: ticket.reporter_name,
        reporter_unit: ticket.reporter_unit,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        property: ticket.property,
        comments,
      },
    }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("resident ticket detail failed", error, observability.elapsed({
      event: "resident_tickets.detail.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
