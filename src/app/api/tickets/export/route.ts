import db from "@/lib/db";
import { canExportTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { NextResponse } from "next/server";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canExportTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att exportera ärenden" }, { status: 403 });
    }

    const tickets = await db.ticket.findMany({
      where: { deleted_at: null, ...tenantWhere(user) },
      orderBy: { created_at: "desc" },
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

    const header = ["Referens", "Titel", "Status", "Prioritet", "Kategori", "Fastighet", "Ansvarig", "Reporter", "Skapad", "SLA"];
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

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="revalta-arenden.csv"`,
      },
    });
  } catch (error) {
    console.error("Export tickets error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
