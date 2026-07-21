import { Prisma } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, ShieldCheck, UserRoundX } from "lucide-react";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { buildSlaPriorityQueue } from "@/lib/work-order-sla-priority";
import { evaluateWorkOrderSla } from "@/lib/work-order-sla";

type EnterpriseRow = {
  id: string;
  work_order_number: string | null;
  sla_response_due_at: Date | null;
  sla_resolution_due_at: Date | null;
  responded_at: Date | null;
  paused_at: Date | null;
  pause_reason: string | null;
  closed_at: Date | null;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function duration(minutes: number | null) {
  if (minutes === null) return "Ingen aktiv nedräkning";
  const absolute = Math.abs(minutes);
  const days = Math.floor(absolute / 1440);
  const hours = Math.floor((absolute % 1440) / 60);
  const mins = absolute % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

function riskStyle(risk: string) {
  if (risk === "overdue") return "bg-red-50 text-red-700 ring-red-100";
  if (risk === "critical") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (risk === "soon") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-sand-100 text-ink-600 ring-sand-200";
}

export async function DashboardSlaOperations() {
  const user = await getCurrentUser();
  if (!user?.company_id) return null;

  const [workOrders, enterpriseRows] = await Promise.all([
    db.workOrder.findMany({
      where: { company_id: user.company_id },
      take: 300,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        completed_at: true,
        assigned_to_id: true,
        assigned_to: { select: { name: true, email: true } },
        property: { select: { name: true } },
      },
    }),
    db.$queryRaw<EnterpriseRow[]>(Prisma.sql`
      SELECT "id", "work_order_number", "sla_response_due_at", "sla_resolution_due_at",
             "responded_at", "paused_at", "pause_reason", "closed_at"
      FROM "WorkOrder"
      WHERE "company_id" = ${user.company_id}
      LIMIT 300
    `),
  ]);

  const now = new Date();
  const enterpriseById = new Map(enterpriseRows.map((row) => [row.id, row]));
  const evaluated = workOrders.map((workOrder) => {
    const enterprise = enterpriseById.get(workOrder.id);
    const sla = evaluateWorkOrderSla({
      status: workOrder.status,
      responseDueAt: enterprise?.sla_response_due_at,
      resolutionDueAt: enterprise?.sla_resolution_due_at,
      respondedAt: enterprise?.responded_at,
      completedAt: workOrder.completed_at,
      closedAt: enterprise?.closed_at,
      pausedAt: enterprise?.paused_at,
      pauseReason: enterprise?.pause_reason,
    }, now);
    return { ...workOrder, workOrderNumber: enterprise?.work_order_number ?? null, sla };
  });

  const active = evaluated.filter((item) => !["completed", "invoiced", "cancelled"].includes(item.status));
  const summary = {
    overdue: active.filter((item) => item.sla.risk === "overdue").length,
    critical: active.filter((item) => item.sla.risk === "critical").length,
    soon: active.filter((item) => item.sla.risk === "soon").length,
    unassigned: active.filter((item) => !item.assigned_to_id).length,
  };
  const queue = buildSlaPriorityQueue(evaluated.map((item) => ({
    id: item.id,
    status: item.status,
    priority: item.priority,
    assigned: Boolean(item.assigned_to_id),
    sla: item.sla,
    payload: item,
  })), 5);

  const healthy = summary.overdue === 0 && summary.critical === 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
      <div className="flex flex-col gap-4 border-b border-sand-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-ink-950">SLA och arbetsorderdrift</h2>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${healthy ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-700 ring-amber-100"}`}>{healthy ? "Stabilt läge" : "Kräver åtgärd"}</span>
          </div>
          <p className="mt-1 text-sm text-ink-500">Serverberäknad riskbild för organisationens aktiva arbetsordrar.</p>
        </div>
        <Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna arbetsordrar <ArrowRight className="h-4 w-4" /></Link>
      </div>

      <div className="grid gap-px bg-sand-200 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "SLA passerad", value: summary.overdue, icon: AlertTriangle, tone: "text-red-700" },
          { label: "Kritiska inom 4 h", value: summary.critical, icon: Clock3, tone: "text-orange-700" },
          { label: "Inom 24 timmar", value: summary.soon, icon: Clock3, tone: "text-amber-700" },
          { label: "Ej tilldelade", value: summary.unassigned, icon: UserRoundX, tone: "text-petroleum-700" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-ink-500">{label}</p><Icon className={`h-5 w-5 ${tone}`} /></div>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink-950">{value}</p>
          </div>
        ))}
      </div>

      {queue.length > 0 ? (
        <div className="divide-y divide-sand-100">
          {queue.map((entry) => {
            const item = entry.payload!;
            const timeText = item.sla.overdueMinutes !== null ? `${duration(item.sla.overdueMinutes)} försenad` : item.sla.remainingMinutes !== null ? `${duration(item.sla.remainingMinutes)} kvar` : "Deadline saknas";
            return (
              <Link key={item.id} href={`/dashboard/arbetsorder/${item.id}`} className="grid gap-3 px-6 py-4 transition hover:bg-sand-50/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-semibold text-petroleum-700">{item.workOrderNumber || `AO-${item.id.slice(0, 8)}`}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${riskStyle(item.sla.risk)}`}>{item.sla.label}</span>{!item.assigned_to_id ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Ej tilldelad</span> : null}</div>
                  <p className="mt-1 truncate font-semibold text-ink-900">{item.title}</p>
                  <p className="mt-1 text-xs text-ink-500">{item.property.name} · {item.assigned_to?.name || item.assigned_to?.email || "Saknar ansvarig"}</p>
                </div>
                <div className="sm:text-right"><p className={`text-sm font-semibold ${item.sla.risk === "overdue" ? "text-red-700" : item.sla.risk === "critical" ? "text-orange-700" : "text-amber-700"}`}>{timeText}</p>{item.sla.dueAt ? <p className="mt-1 text-[11px] text-ink-400">{dateTime.format(new Date(item.sla.dueAt))}</p> : null}</div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-4 px-6 py-8 sm:px-7"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-semibold text-ink-900">Inga aktiva SLA-risker</p><p className="mt-1 text-sm text-ink-500">Alla aktiva arbetsordrar ligger inom normal SLA eller är hanterade.</p></div></div>
      )}
    </section>
  );
}
