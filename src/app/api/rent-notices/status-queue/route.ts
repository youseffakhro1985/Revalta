import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageLeases, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  sent: "Skickad",
  paid: "Betald",
  overdue: "Förfallen",
  credited: "Krediterad",
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isPastDue(due: Date) {
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  return dueDay.getTime() < startOfToday().getTime();
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageLeases(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att ändra aviestatus" }, { status: 403 });
  }

  const rows = await db.rentNotice.findMany({
    where: {
      company_id: user.company_id,
      status: { notIn: ["paid", "credited"] },
      property: { deleted_at: null },
    },
    orderBy: [{ due_date: "asc" }, { created_at: "desc" }],
    take: 80,
    select: {
      id: true,
      tenant_name: true,
      unit: true,
      period: true,
      due_date: true,
      status: true,
      total: true,
      property: { select: { name: true } },
    },
  });

  const notices = rows.slice(0, 50).map((row) => {
    const pastDue = isPastDue(row.due_date);
    const nextStatus = row.status === "draft" ? "sent" : "paid";
    return {
      id: row.id,
      tenantName: row.tenant_name.trim() || "Hyresgäst",
      propertyName: row.property.name,
      unit: row.unit?.trim() || "",
      period: row.period,
      dueDate: row.due_date.toISOString().slice(0, 10),
      status: row.status,
      statusLabel: statusLabels[row.status] || row.status,
      total: num(row.total),
      pastDue,
      nextStatus,
      nextStatusLabel: nextStatus === "sent" ? "Markera som skickad" : "Markera som betald",
      canMarkOverdue: row.status === "sent" && pastDue,
      href: "/dashboard/hyresavisering",
    };
  });

  return NextResponse.json(
    {
      summary: {
        notices: notices.length,
        overdue: notices.filter((row) => row.status === "overdue" || row.pastDue).length,
      },
      notices,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
