import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canAssignWorkOrders, getCurrentUser, requireCompanyUser, tenantWhere } from "@/lib/current-user";
import { PRIORITY_LABELS } from "@/lib/domain-labels";
import { normalizeTicketStatus, ticketStatusLabel } from "@/lib/ticket-lifecycle";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
  if (!canAssignWorkOrders(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att tilldela ärenden" }, { status: 403 });
  }

  const [rows, assignees] = await Promise.all([
    db.ticket.findMany({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { notIn: ["closed", "cancelled", "invoiced"] },
        assigned_to_id: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      orderBy: [{ priority: "desc" }, { created_at: "asc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        public_reference: true,
        created_at: true,
        property: { select: { id: true, name: true } },
      },
    }),
    db.user.findMany({
      where: {
        company_id: user.company_id,
        status: "active",
        role: { in: ["owner", "admin", "manager", "technician"] },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  const tickets = rows.map((row) => {
    const status = normalizeTicketStatus(row.status);
    return {
      id: row.id,
      title: row.title,
      status,
      statusLabel: ticketStatusLabel(status),
      priority: row.priority,
      priorityLabel: PRIORITY_LABELS[row.priority] || row.priority,
      publicReference: row.public_reference,
      propertyName: row.property?.name || "Ingen fastighet",
      createdAt: row.created_at.toISOString(),
      href: `/dashboard/felanmalan/${row.id}`,
    };
  });

  return NextResponse.json(
    {
      summary: { tickets: tickets.length },
      selfId: user.id,
      assignees: assignees.map((member) => ({
        id: member.id,
        name: member.name || member.email,
        role: member.role,
      })),
      tickets,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
