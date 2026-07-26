import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification } from "@/lib/integrations";
import { calculateDueDate } from "@/lib/sla";
import {
  allowedWorkOrderTransitions,
  canTransitionWorkOrder,
  deriveWorkOrderStatus,
  isTerminalWorkOrderStatus,
  isWorkOrderStatus,
  type WorkOrderStatus,
} from "@/lib/work-order-lifecycle";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att uppdatera ärenden" }, { status: 403 });
    }
    const { id } = await params;

    const ticket = await db.ticket.findFirst({
      where: {
        id,
        deleted_at: null,
        ...tenantWhere(user),
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        category: true,
        priority: true,
        public_reference: true,
        source: true,
        reporter_name: true,
        reporter_email: true,
        reporter_phone: true,
        reporter_unit: true,
        property_id: true,
        assigned_to_id: true,
        created_at: true,
        updated_at: true,
        due_date: true,
        ai_summary: true,
        ai_recommended_action: true,
        ai_confidence: true,
        ai_processed_at: true,
        property: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
          },
        },
        assigned_to: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        comments: {
          orderBy: { created_at: "asc" },
          select: {
            id: true,
            body: true,
            is_internal: true,
            created_at: true,
            author_type: true,
            author_name: true,
            author_email: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        attachments: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            file_name: true,
            content_type: true,
            size_bytes: true,
            data_url: true,
            created_at: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const normalizedStatus = isWorkOrderStatus(ticket.status) ? ticket.status : "new";

    return NextResponse.json({
      ticket: {
        ...ticket,
        status: normalizedStatus,
        allowedTransitions: allowedWorkOrderTransitions(normalizedStatus),
        attachments: ticket.attachments.map((attachment) => ({
          ...attachment,
          data_url: `/api/attachments/${attachment.id}`,
        })),
      },
    });
  } catch (error) {
    console.error("Get ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att uppdatera ärenden" }, { status: 403 });
    }
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
      priority?: unknown;
      assignedToId?: unknown;
      transitionReason?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });

    const existing = await db.ticket.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user) },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        assigned_to_id: true,
        due_date: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const currentStatus: WorkOrderStatus = isWorkOrderStatus(existing.status) ? existing.status : "new";
    const shouldUpdateAssignee = typeof body.assignedToId === "string" || body.assignedToId === null;
    const normalizedAssignedToId =
      typeof body.assignedToId === "string" && body.assignedToId.trim() ? body.assignedToId.trim() : null;

    if (normalizedAssignedToId) {
      const assignee = await db.user.findFirst({
        where: user.company_id
          ? { id: normalizedAssignedToId, company_id: user.company_id }
          : { id: user.id },
        select: { id: true },
      });

      if (!assignee || assignee.id !== normalizedAssignedToId) {
        return NextResponse.json({ error: "Vald ansvarig hittades inte" }, { status: 400 });
      }
    }

    const requestedStatus = body.status === undefined ? undefined : body.status;
    if (requestedStatus !== undefined && !isWorkOrderStatus(requestedStatus)) {
      return NextResponse.json({ error: "Ogiltig arbetsorderstatus" }, { status: 400 });
    }

    const normalizedPriority =
      typeof body.priority === "string" && body.priority.trim() ? body.priority.trim() : undefined;
    const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);
    if (normalizedPriority && !allowedPriorities.has(normalizedPriority)) {
      return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
    }

    const nextAssigneeId = shouldUpdateAssignee ? normalizedAssignedToId : existing.assigned_to_id;
    const nextStatus = deriveWorkOrderStatus({
      current: currentStatus,
      requested: requestedStatus as WorkOrderStatus | undefined,
      assignedToId: nextAssigneeId,
    });

    if (!canTransitionWorkOrder(currentStatus, nextStatus)) {
      return NextResponse.json(
        {
          error: "Statusövergången är inte tillåten",
          currentStatus,
          requestedStatus: nextStatus,
          allowedTransitions: allowedWorkOrderTransitions(currentStatus),
        },
        { status: 409 },
      );
    }

    if (["assigned", "in_progress", "inspection"].includes(nextStatus) && !nextAssigneeId) {
      return NextResponse.json({ error: "En ansvarig måste väljas för denna status" }, { status: 400 });
    }

    const nextPriority = normalizedPriority || existing.priority;
    const priorityChanged = Boolean(normalizedPriority && normalizedPriority !== existing.priority);
    const terminal = isTerminalWorkOrderStatus(nextStatus);
    const transitionReason = typeof body.transitionReason === "string"
      ? body.transitionReason.trim().slice(0, 500)
      : "";

    const ticket = await db.$transaction(async (tx) => {
      const updateResult = await tx.ticket.updateMany({
        where: { id, company_id: user.company_id!, deleted_at: null },
        data: {
          status: nextStatus,
          priority: normalizedPriority,
          assigned_to_id: shouldUpdateAssignee ? normalizedAssignedToId : undefined,
          due_date: priorityChanged && !terminal ? calculateDueDate(nextPriority) : undefined,
          closed_at: nextStatus === "closed" ? new Date() : currentStatus === "closed" ? null : undefined,
        },
      });
      if (updateResult.count === 0) {
        throw new Error("TICKET_NOT_FOUND");
      }

      const updated = await tx.ticket.findFirst({
        where: { id, company_id: user.company_id!, deleted_at: null },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          due_date: true,
          closed_at: true,
          assigned_to: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
      if (!updated) {
        throw new Error("TICKET_NOT_FOUND");
      }

      await tx.auditLog.create({
        data: {
          actor_user_id: user.id,
          company_id: user.company_id,
          entity_type: "ticket",
          entity_id: updated.id,
          action: currentStatus === nextStatus ? "ticket.updated" : "ticket.status_changed",
          metadata: {
            previousStatus: currentStatus,
            nextStatus,
            previousPriority: existing.priority,
            nextPriority: updated.priority,
            previousAssignedToId: existing.assigned_to_id,
            nextAssignedToId: updated.assigned_to?.id ?? null,
            previousDueDate: existing.due_date,
            nextDueDate: updated.due_date,
            reason: transitionReason || null,
          },
        },
      });

      return updated;
    }).catch((error) => {
      if (error instanceof Error && error.message === "TICKET_NOT_FOUND") {
        return null;
      }
      throw error;
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärende hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.lifecycle_processed",
      metadata: {
        status: ticket.status,
        priority: ticket.priority,
        assignedToId: ticket.assigned_to?.id ?? null,
      },
    });
    await queueTicketNotification(user, {
      ticketId: ticket.id,
      title: ticket.title,
      recipient: user.email,
      event: "updated",
    });

    return NextResponse.json({
      success: true,
      ticket,
      allowedTransitions: allowedWorkOrderTransitions(ticket.status as WorkOrderStatus),
    });
  } catch (error) {
    console.error("Update ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ta bort ärenden" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const { id } = await params;
    const existing = await db.ticket.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: { id: true, title: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const deleteResult = await db.ticket.updateMany({
      where: { id: existing.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: existing.id,
      action: "ticket.deleted",
      metadata: { title: existing.title, previousStatus: existing.status, softDelete: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
