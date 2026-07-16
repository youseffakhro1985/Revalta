import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification } from "@/lib/integrations";
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

    return NextResponse.json({
      ticket: {
        ...ticket,
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
    const { status, priority, assignedToId } = await request.json();

    const existing = await db.ticket.findFirst({
      where: { id, ...tenantWhere(user) },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const shouldUpdateAssignee = typeof assignedToId === "string";
    const normalizedAssignedToId =
      shouldUpdateAssignee && assignedToId.trim() ? assignedToId.trim() : null;

    if (normalizedAssignedToId) {
      const assignee = await db.user.findFirst({
        where: {
          id: normalizedAssignedToId,
          company_id: user.company_id ?? undefined,
        },
        select: { id: true },
      });

      if (!assignee) {
        return NextResponse.json({ error: "Vald ansvarig hittades inte" }, { status: 400 });
      }
    }

    const normalizedStatus = typeof status === "string" && status.trim() ? status.trim() : undefined;
    const normalizedPriority = typeof priority === "string" && priority.trim() ? priority.trim() : undefined;

    const allowedStatuses = new Set(["new", "assigned", "in_progress", "waiting", "closed"]);
    const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);

    if (normalizedStatus && !allowedStatuses.has(normalizedStatus)) {
      return NextResponse.json({ error: "Ogiltig ärendestatus" }, { status: 400 });
    }
    if (normalizedPriority && !allowedPriorities.has(normalizedPriority)) {
      return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
    }

    const ticket = await db.ticket.update({
      where: { id },
      data: {
        status: normalizedStatus,
        priority: normalizedPriority,
        assigned_to_id: shouldUpdateAssignee ? normalizedAssignedToId : undefined,
        closed_at: normalizedStatus === "closed" ? new Date() : undefined,
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        assigned_to: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.updated",
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

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error("Update ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
