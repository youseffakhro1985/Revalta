"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, ShieldAlert, UserRoundX } from "lucide-react";
import { InlineAlert, Panel } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";
import { buildSlaPriorityQueue } from "@/lib/work-order-sla-priority";
import type { WorkOrderSlaEvaluation } from "@/lib/work-order-sla";

type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: { id: string; name: string | null; email: string } | null;
  property: { name: string };
  enterprise: { work_order_number: string | null } | null;
  sla: WorkOrderSlaEvaluation;
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

function tone(risk: WorkOrderSlaEvaluation["risk"]) {
  if (risk === "overdue") return "border-red-200 bg-red-50 text-red-800";
  if (risk === "critical") return "border-orange-200 bg-orange-50 text-orange-800";
  if (risk === "soon") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sand-200 bg-sand-50 text-ink-700";
}

export function WorkOrderSlaPriorityQueue() {
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/work-orders?view=priority", { cache: "no-store" });
        const data = await readResponseJson<{ error?: string; workOrders?: WorkOrder[] }>(response);
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta SLA-prioriteringen");
        if (mounted) setItems(Array.isArray(data.workOrders) ? data.workOrders : []);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : "Kunde inte hämta SLA-prioriteringen");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const queue = useMemo(() => buildSlaPriorityQueue(items.map((item) => ({
    id: item.id,
    status: item.status,
    priority: item.priority,
    assigned: Boolean(item.assigned_to),
    sla: item.sla,
    payload: item,
  })), 6), [items]);

  if (loading) return <div className="h-48 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar SLA-prioritering" />;
  if (error) return <InlineAlert>{error}</InlineAlert>;
  if (queue.length === 0) return null;

  return <Panel title="Nästa SLA-åtgärder" description="Automatiskt prioriterad kö med passerade, kritiska och snart förfallande arbetsordrar.">
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {queue.map((entry) => {
        const workOrder = entry.payload!;
        const sla = workOrder.sla;
        const time = sla.overdueMinutes !== null
          ? `${duration(sla.overdueMinutes)} försenad`
          : sla.remainingMinutes !== null
            ? `${duration(sla.remainingMinutes)} kvar`
            : "Deadline saknas";
        const Icon = sla.risk === "overdue" || sla.risk === "critical" ? AlertTriangle : ShieldAlert;
        return <article key={workOrder.id} className={`rounded-2xl border p-4 ${tone(sla.risk)}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-xl bg-white/70 p-2"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-semibold opacity-70">{workOrder.enterprise?.work_order_number || `AO-${workOrder.id.slice(0, 8)}`}</p>
                <h3 className="mt-1 line-clamp-2 font-semibold leading-5">{workOrder.title}</h3>
              </div>
            </div>
            {!workOrder.assigned_to ? <UserRoundX className="h-4 w-4 shrink-0" aria-label="Ej tilldelad" /> : null}
          </div>
          <div className="mt-4 rounded-xl bg-white/65 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Clock3 className="h-3.5 w-3.5" />{time}</div>
            <p className="mt-1 text-xs opacity-75">{sla.dueAt ? dateTime.format(new Date(sla.dueAt)) : "Konfigurera SLA-deadline"}</p>
          </div>
          <p className="mt-3 truncate text-xs opacity-75">{workOrder.property.name} · {workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"}</p>
          <Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-current/20 bg-white/70 text-xs font-semibold transition hover:bg-white">Öppna och åtgärda <ArrowRight className="h-3.5 w-3.5" /></Link>
        </article>;
      })}
    </div>
  </Panel>;
}
