import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  canAssignWorkOrders,
  canManageTickets,
  canManageWorkOrderFinance,
  getCurrentUser,
  requireCompanyUser,
} from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { isAssignedWorkAccessible, notFoundTicket } from "@/lib/assigned-work-access";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  setWorkOrderEnterpriseFields,
} from "@/lib/work-order-enterprise-core";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";
import { createLogger } from "@/lib/structured-logger";
import { analyzeTicket } from "@/lib/ai";
import { recordAiEvent } from "@/lib/integrations";
import { notifyAssignee } from "@/lib/assignee-notify";
import { API_ERROR_CODES } from "@/lib/api-error-response";
import {
  hasTicketAiSourceColumn,
  hasWorkOrderVendorContractColumn,
  isMissingSchemaColumnError,
  isMissingTableError,
  schemaGapFromError,
  schemaMismatchUserMessage,
  ticketAiSourceWrite,
  workOrderVendorWrite,
} from "@/lib/schema-readiness";

const logger = createLogger({ route: "/api/tickets/[id]/work-order" });

function schemaUnavailableResponse(error?: unknown) {
  const missing = schemaGapFromError(error);
  return NextResponse.json(
    {
      error: schemaMismatchUserMessage(),
      errorCode: API_ERROR_CODES.serviceUnavailable,
      ...(missing ? { missing } : {}),
    },
    { status: 503 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) {
    return NextResponse.json(
      { error: "En aktiv organisation och personalbehörighet krävs", errorCode: API_ERROR_CODES.forbidden },
      { status: 403 },
    );
  }

  const { id } = await params;
  try {
    const ticket = await db.ticket.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null, OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: {
        id: true,
        property_id: true,
        assigned_to_id: true,
      },
    });

    if (!ticket) return notFoundTicket();
    if (!isAssignedWorkAccessible(user, ticket.assigned_to_id)) return notFoundTicket();

    const workOrder = await db.workOrder.findFirst({
      where: { ticket_id: ticket.id, company_id: user.company_id, deleted_at: null },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        scheduled_start: true,
        scheduled_end: true,
        created_at: true,
        assigned_to: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      workOrder,
      canCreate: Boolean(ticket.property_id),
      suggestedAssignedToId: ticket.assigned_to_id,
    });
  } catch (error) {
    if (isMissingSchemaColumnError(error) || isMissingTableError(error)) {
      return schemaUnavailableResponse(error);
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) {
    return NextResponse.json(
      { error: "En aktiv organisation och personalbehörighet krävs", errorCode: API_ERROR_CODES.forbidden },
      { status: 403 },
    );
  }
  if (!canManageTickets(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsordrar" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  const scheduledStart = body.scheduledStart ? new Date(String(body.scheduledStart)) : null;
  const scheduledEnd = body.scheduledEnd ? new Date(String(body.scheduledEnd)) : null;
  const estimatedCostSupplied = body.estimatedCost !== undefined && body.estimatedCost !== null && body.estimatedCost !== "";
  const estimatedCost = body.estimatedCost === "" || body.estimatedCost === undefined
    ? null
    : Number(body.estimatedCost);

  if (scheduledStart && Number.isNaN(scheduledStart.getTime())) {
    return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
  }
  if (scheduledEnd && Number.isNaN(scheduledEnd.getTime())) {
    return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
  }
  if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
    return NextResponse.json({ error: "Sluttiden måste ligga efter starttiden" }, { status: 400 });
  }
  if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
    return NextResponse.json({ error: "Ogiltig beräknad kostnad" }, { status: 400 });
  }

  try {
    const ticket = await db.ticket.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null, OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: {
        id: true,
        property_id: true,
        assigned_to_id: true,
        status: true,
        title: true,
        description: true,
        priority: true,
        ai_summary: true,
        ai_recommended_action: true,
        ai_processed_at: true,
      },
    });
    if (!ticket) return notFoundTicket();
    if (!isAssignedWorkAccessible(user, ticket.assigned_to_id)) return notFoundTicket();
    if (!ticket.property_id) {
      return NextResponse.json(
        {
          error: "Ärendet måste kopplas till en fastighet innan en arbetsorder kan skapas",
          errorCode: API_ERROR_CODES.conflict,
        },
        { status: 409 },
      );
    }
    const activeWorkOrder = await db.workOrder.findFirst({
      where: { ticket_id: ticket.id, company_id: user.company_id, deleted_at: null },
      select: { id: true },
    });
    if (activeWorkOrder) {
      return NextResponse.json({ workOrderId: activeWorkOrder.id, created: false });
    }

    if (assignedToId && assignedToId !== ticket.assigned_to_id && !canAssignWorkOrders(user.role)) {
      return NextResponse.json(
        {
          error: "Du saknar behörighet att tilldela arbetsorder till andra",
          errorCode: API_ERROR_CODES.forbidden,
        },
        { status: 403 },
      );
    }
    if (estimatedCostSupplied && !canManageWorkOrderFinance(user.role)) {
      return NextResponse.json(
        {
          error: "Du saknar behörighet att sätta arbetsorderkostnader",
          errorCode: API_ERROR_CODES.forbidden,
        },
        { status: 403 },
      );
    }

    if (unitId) {
      const unit = await db.unit.findFirst({
        where: {
          id: unitId,
          property_id: ticket.property_id,
          property: { company_id: user.company_id, deleted_at: null },
        },
        select: { id: true },
      });
      if (!unit) {
        return NextResponse.json(
          { error: "Enheten hittades inte", errorCode: API_ERROR_CODES.notFound },
          { status: 404 },
        );
      }
    }

    let assigneeEmail: string | null = null;
    if (assignedToId) {
      const assignee = await db.user.findFirst({
        where: { id: assignedToId, company_id: user.company_id, status: "active" },
        select: { id: true, email: true },
      });
      if (!assignee) {
        return NextResponse.json(
          { error: "Ansvarig användare hittades inte", errorCode: API_ERROR_CODES.notFound },
          { status: 404 },
        );
      }
      assigneeEmail = assignee.email;
    }

    const persistVendor = await hasWorkOrderVendorContractColumn();
    const persistAiSource = await hasTicketAiSourceColumn();
    const analysis = ticket.ai_processed_at
      ? null
      : await analyzeTicket(`${ticket.title}. ${ticket.description}`);
    const recommendedAction = ticket.ai_recommended_action || analysis?.recommendedAction || null;
    const priority = normalizeWorkOrderPriority(analysis?.priority || ticket.priority);
    const createdAt = new Date();
    const sla = calculateWorkOrderSla(createdAt, priority);

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.workOrder.findFirst({
        where: { ticket_id: ticket.id, company_id: user.company_id! },
        select: { id: true, deleted_at: true },
      });
      if (existing && !existing.deleted_at) {
        return { id: existing.id, created: false, workOrderNumber: null };
      }
      if (existing?.deleted_at) {
        const unlinked = await tx.workOrder.updateMany({
          where: { id: existing.id, company_id: user.company_id! },
          data: { ticket_id: null },
        });
        if (unlinked.count !== 1) {
          throw new Error("Kunde inte frisläppa ärendekopplingen");
        }
      }

      const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
      const status = assignedToId || ticket.assigned_to_id ? "planned" : "new";
      const created = await tx.workOrder.create({
        data: {
          company_id: user.company_id!,
          ticket_id: ticket.id,
          property_id: ticket.property_id!,
          unit_id: unitId,
          assigned_to_id: assignedToId || ticket.assigned_to_id,
          created_by_id: user.id,
          title: ticket.title,
          description: ticket.description,
          notes: recommendedAction,
          status,
          priority,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          estimated_cost: estimatedCost,
          created_at: createdAt,
          work_order_number: workOrderNumber,
          work_type: "corrective",
          source: "ticket",
          sla_response_due_at: sla.responseDueAt,
          sla_resolution_due_at: sla.resolutionDueAt,
          sla_status: "not_set",
          ...workOrderVendorWrite(persistVendor, null),
        },
        select: { id: true },
      });

      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: created.id,
        companyId: user.company_id!,
        workOrderNumber,
        workType: "corrective",
        source: "ticket",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId: user.company_id!,
        workOrderId: created.id,
        actorUserId: user.id,
        fromStatus: null,
        toStatus: status,
        reason: "Skapad från felanmälan",
        metadata: { ticketId: ticket.id, workOrderNumber, unitId },
      });
      await tx.ticket.updateMany({
        where: { id: ticket.id, company_id: user.company_id! },
        data: {
          status: ticket.status === "new" ? "received" : ticket.status,
          assigned_to_id: assignedToId || ticket.assigned_to_id,
          ...(analysis
            ? {
                ai_summary: analysis.summary,
                ai_recommended_action: analysis.recommendedAction,
                ai_confidence: analysis.confidence,
                ai_processed_at: new Date(),
                ...ticketAiSourceWrite(persistAiSource, analysis.source),
              }
            : {}),
        },
      });

      return { id: created.id, created: true, workOrderNumber };
    });

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: result.id,
      action: result.created ? "work_order.created_from_ticket" : "work_order.reused_from_ticket",
      metadata: {
        ticketId: ticket.id,
        propertyId: ticket.property_id,
        unitId,
        assignedToId: assignedToId || ticket.assigned_to_id,
        estimatedCost,
        workOrderNumber: result.workOrderNumber,
      },
    });

    if (result.created && analysis) {
      try {
        await recordAiEvent(user, {
          workOrderId: result.id,
          ticketId: ticket.id,
          action: "classification.completed",
          category: analysis.category,
          priority: analysis.priority,
          confidence: analysis.confidence,
          summary: analysis.summary,
          source: analysis.source,
        });
      } catch {
        logger.warn("work-order from ticket ai telemetry failed", { workOrderId: result.id, ticketId: ticket.id });
      }
    }

    const nextAssigneeId = assignedToId || ticket.assigned_to_id;
    if (result.created && nextAssigneeId && nextAssigneeId !== user.id) {
      try {
        await notifyAssignee(user, {
          id: result.id,
          title: ticket.title,
          kind: "work_order",
          assigneeId: nextAssigneeId,
          assigneeEmail,
        });
      } catch (notificationError) {
        logger.error("Work-order from ticket assignee notification failed", notificationError);
      }
    }

    return NextResponse.json(
      { workOrderId: result.id, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    try {
      const concurrent = await db.workOrder.findFirst({
        where: { ticket_id: id, company_id: user.company_id, deleted_at: null },
        select: { id: true },
      });
      if (concurrent) {
        return NextResponse.json({ workOrderId: concurrent.id, created: false });
      }
    } catch {
      // Concurrent lookup can fail for the same schema gap as create.
    }
    logger.error("Create work order from ticket error", error);
    if (isMissingSchemaColumnError(error) || isMissingTableError(error)) {
      return schemaUnavailableResponse(error);
    }
    return NextResponse.json(
      {
        error: "Kunde inte skapa arbetsorder från ärendet",
        errorCode: API_ERROR_CODES.internalError,
      },
      { status: 500 },
    );
  }
}
