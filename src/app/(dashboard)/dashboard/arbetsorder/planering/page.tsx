"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, UserRoundX } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";
import { WorkOrderQuickActions, type QuickActionUser } from "@/components/dashboard/work-order-quick-actions";
import { readResponseJson } from "@/lib/fetch-json";

type SlaRisk = "overdue" | "critical" | "soon" | "normal" | "fulfilled" | "paused" | "not_configured";
type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  enterprise: { work_order_number: string | null } | null;
  sla: { risk: SlaRisk; label: string; dueAt: string | null; remainingMinutes: number | null; overdueMinutes: number | null };
  property: { name: string; address: string; city: string };
  assigned_to: QuickActionUser | null;
};

type Group = {
  key: string;
  name: string;
  email: string | null;
  unassigned: boolean;
  orders: WorkOrder[];
  overdue: number;
  critical: number;
  soon: number;
};

const terminal = new Set(["completed", "invoiced", "cancelled"]);
const riskWeight: Record<SlaRisk, number> = { overdue: 0, critical: 1, soon: 2, not_configured: 3, normal: 4, paused: 5, fulfilled: 6 };
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function duration(item: WorkOrder) {
  if (item.sla.overdueMinutes !== null) {
    const hours = Math.floor(item.sla.overdueMinutes / 60);
    const minutes = item.sla.overdueMinutes % 60;
    return hours ? `${hours} h ${minutes} min försenad` : `${minutes} min försenad`;
  }
  if (item.sla.remainingMinutes === null) return "Ingen aktiv deadline";
  const hours = Math.floor(item.sla.remainingMinutes / 60);
  const minutes = item.sla.remainingMinutes % 60;
  return hours ? `${hours} h ${minutes} min kvar` : `${minutes} min kvar`;
}

function badge(risk: SlaRisk) {
  if (risk === "overdue") return "bg-red-50 text-red-700";
  if (risk === "critical") return "bg-orange-50 text-orange-700";
  if (risk === "soon") return "bg-amber-50 text-amber-700";
  if (risk === "not_configured") return "bg-sand-100 text-ink-600";
  return "bg-petroleum-50 text-petroleum-700";
}

export default function TechnicianPlanningPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [assignees, setAssignees] = useState<QuickActionUser[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canAssign, setCanAssign] = useState(false);
  const [scopedToAssigned, setScopedToAssigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/work-orders?view=planning", { cache: "no-store" });
      const body = await readResponseJson<{
        error?: string;
        workOrders?: WorkOrder[];
        assignees?: QuickActionUser[];
        permissions?: { canManage?: boolean; canAssign?: boolean; scopedToAssigned?: boolean };
      }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta arbetsordrar");
      setOrders(body.workOrders || []);
      setAssignees(body.assignees || []);
      setCanManage(Boolean(body.permissions?.canManage));
      setCanAssign(Boolean(body.permissions?.canAssign));
      setScopedToAssigned(Boolean(body.permissions?.scopedToAssigned));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta arbetsordrar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const active = useMemo(() => orders.filter((item) => !terminal.has(item.status)), [orders]);
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const order of active) {
      const key = order.assigned_to?.id || "unassigned";
      const current: Group = map.get(key) || {
        key,
        name: order.assigned_to?.name || order.assigned_to?.email || "Ej tilldelade",
        email: order.assigned_to?.email || null,
        unassigned: !order.assigned_to,
        orders: [], overdue: 0, critical: 0, soon: 0,
      };
      current.orders.push(order);
      if (order.sla.risk === "overdue") current.overdue += 1;
      if (order.sla.risk === "critical") current.critical += 1;
      if (order.sla.risk === "soon") current.soon += 1;
      map.set(key, current);
    }
    return [...map.values()].map((group) => ({
      ...group,
      orders: [...group.orders].sort((a, b) => {
        const risk = riskWeight[a.sla.risk] - riskWeight[b.sla.risk];
        if (risk !== 0) return risk;
        const aDue = a.sla.dueAt ? new Date(a.sla.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.sla.dueAt ? new Date(b.sla.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      }),
    })).sort((a, b) => {
      if (a.unassigned !== b.unassigned) return a.unassigned ? -1 : 1;
      const aRisk = a.overdue * 100 + a.critical * 10 + a.soon;
      const bRisk = b.overdue * 100 + b.critical * 10 + b.soon;
      return bRisk - aRisk || b.orders.length - a.orders.length;
    });
  }, [active]);

  const overdue = active.filter((item) => item.sla.risk === "overdue").length;
  const focus = active.filter((item) => item.sla.risk === "critical" || item.sla.risk === "soon").length;
  const unassigned = active.filter((item) => !item.assigned_to).length;
  const ready = active.filter((item) => item.assigned_to && !["overdue", "critical", "soon"].includes(item.sla.risk)).length;

  function updateOrder(id: string, patch: { status?: string; assigned_to?: QuickActionUser | null }) {
    setOrders((current) => current.map((order) => (
      order.id === id
        ? {
            ...order,
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.assigned_to !== undefined ? { assigned_to: patch.assigned_to } : {}),
          }
        : order
    )));
  }

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Operativ resursplanering"
      title="Teknikerplanering"
      description={scopedToAssigned
        ? "Din tilldelade arbetsbelastning efter SLA-risk och nästa deadline."
        : "Fördela arbetsbelastningen efter ansvarig, SLA-risk och nästa deadline. Tilldela direkt i listan."}
      action={<button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>}
    />
    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {scopedToAssigned ? <InlineAlert tone="info">Du ser endast arbetsordrar som är tilldelade dig.</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={AlertTriangle} label="SLA passerad" value={overdue} hint="Måste omprioriteras direkt" />
      <MetricCard icon={Clock3} label="Kräver fokus" value={focus} hint="Kritiska eller inom 24 timmar" />
      <MetricCard icon={UserRoundX} label="Ej tilldelade" value={unassigned} hint="Saknar ansvarig tekniker" />
      <MetricCard icon={CheckCircle2} label="Planerade utan akut risk" value={ready} hint="Tilldelade och inom stabilt läge" />
    </section>

    <Panel title="Arbetsbelastning per ansvarig" description="Ej tilldelade visas först, därefter teammedlemmar med högst SLA-risk." bodyClassName="p-4 sm:p-6">
      {loading && !orders.length ? <div className="h-64 animate-pulse rounded-xl bg-sand-50" /> : null}
      {!loading && groups.length === 0 ? <EmptyState title="Inga aktiva arbetsordrar" description="När arbetsordrar skapas eller planeras visas teamets arbetsbelastning här." /> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {groups.map((group) => <section key={group.key} className={`overflow-hidden rounded-2xl border bg-white ${group.unassigned ? "border-amber-200" : "border-sand-200"}`}>
          <header className="flex flex-col gap-3 border-b border-sand-100 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><h2 className="font-semibold text-ink-950">{group.name}</h2>{group.unassigned ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Behöver fördelas</span> : null}</div>
              <p className="mt-1 text-sm text-ink-500">{group.email || `${group.orders.length} arbetsordrar utan ansvarig`}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-sand-50 px-2.5 py-1 text-ink-600">{group.orders.length} aktiva</span>{group.overdue ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{group.overdue} passerade</span> : null}{group.critical ? <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-700">{group.critical} kritiska</span> : null}</div>
          </header>
          <div className="divide-y divide-sand-100">
            {group.orders.slice(0, 8).map((order) => (
              <div key={order.id} className="p-5">
                <Link href={`/dashboard/arbetsorder/${order.id}`} className="block transition hover:opacity-90">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-petroleum-700">{order.enterprise?.work_order_number || "Arbetsorder"}</p><h3 className="mt-1 truncate font-semibold text-ink-950">{order.title}</h3><p className="mt-1 truncate text-sm text-ink-500">{order.property.name} · {order.property.address}, {order.property.city}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge(order.sla.risk)}`}>{order.sla.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-ink-600">{duration(order)}</span><span className="text-ink-400">{order.sla.dueAt ? dateTime.format(new Date(order.sla.dueAt)) : "Deadline saknas"}</span></div>
                </Link>
                <WorkOrderQuickActions
                  workOrderId={order.id}
                  status={order.status}
                  assignedToId={order.assigned_to?.id || null}
                  users={assignees}
                  canManage={canManage}
                  canAssign={canAssign}
                  compact
                  onUpdated={(patch) => updateOrder(order.id, patch)}
                />
              </div>
            ))}
          </div>
        </section>)}
      </div>
    </Panel>
  </div>;
}
