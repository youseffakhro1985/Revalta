import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification, recordAiEvent } from "@/lib/integrations";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();
    const priority = searchParams.get("priority")?.trim();
    const propertyId = searchParams.get("propertyId")?.trim();
    const assignedToId = searchParams.get("assignedToId")?.trim();
    const where = {
      ...tenantWhere(user),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(propertyId ? { property_id: propertyId } : {}),
      ...(assignedToId ? { assigned_to_id: assignedToId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const tickets = await db.ticket.findMany({
      where,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        category: true,
        priority: true,
        property_id: true,
        assigned_to_id: true,
        created_at: true,
        updated_at: true,
        due_date: true,
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
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("Get tickets error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa ärenden" }, { status: 403 });
    }

    const { title, description, propertyId, category, priority, assignedToId } = await request.json();
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    const normalizedPropertyId = typeof propertyId === "string" && propertyId.trim() ? propertyId.trim() : null;
    const normalizedCategory = typeof category === "string" && category.trim() ? category.trim() : "other";
    const normalizedPriority = typeof priority === "string" && priority.trim() ? priority.trim() : "normal";
    const normalizedAssignedToId = typeof assignedToId === "string" && assignedToId.trim() ? assignedToId.trim() : null;

    if (!normalizedTitle || !normalizedDescription) {
      return NextResponse.json({ error: "Titel och beskrivning krävs" }, { status: 400 });
    }

    if (normalizedPropertyId) {
      const property = await db.property.findFirst({
        where: {
          id: normalizedPropertyId,
          ...tenantWhere(user),
        },
        select: { id: true },
      });

      if (!property) {
        return NextResponse.json({ error: "Vald fastighet hittades inte" }, { status: 400 });
      }
    }

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

    const ticket = await db.ticket.create({
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
        category: normalizedCategory,
        priority: normalizedPriority,
        property_id: normalizedPropertyId,
        assigned_to_id: normalizedAssignedToId,
        company_id: user.company_id,
        user_id: user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        category: true,
        priority: true,
        property_id: true,
        assigned_to_id: true,
        created_at: true,
        updated_at: true,
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
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.created",
      metadata: {
        title: ticket.title,
        priority: ticket.priority,
        category: ticket.category,
        assignedToId: ticket.assigned_to_id,
      },
    });
    await queueTicketNotification(user, {
      ticketId: ticket.id,
      title: ticket.title,
      recipient: user.email,
      event: "created",
    });
    await recordAiEvent(user, {
      ticketId: ticket.id,
      action: "classification.requested",
      category: ticket.category,
      priority: ticket.priority,
    });

    return NextResponse.json({ success: true, ticket }, { status: 201 });
  } catch (error) {
    console.error("Create ticket error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
