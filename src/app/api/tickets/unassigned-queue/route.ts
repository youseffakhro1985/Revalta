import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canAssignWorkOrders, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { OPERATIONS_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/domain-labels";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canAssignWorkOrders(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att tilldela ärenden" }, { status: 403 });
  }

  const [rows, assignees] = await Promise.all([
    db.ticket.findMany({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { notIn: ["closed", "cancelled"] },
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

  const tickets = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    statusLabel: OPERATIONS_STATUS_LABELS[row.status] || row.status,
    priority: row.priority,
    priorityLabel: PRIORITY_LABELS[row.priority] || row.priority,
    publicReference: row.public_reference,
    propertyName: row.property?.name || "Ingen fastighet",
    createdAt: row.created_at.toISOString(),
    href: `/dashboard/felanmalan/${row.id}`,
  }));

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
