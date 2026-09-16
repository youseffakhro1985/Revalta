"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, ShieldAlert, UserRoundX } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";
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
  if (risk === "overdue") return "border-danger-200 bg-danger-50 text-danger-800";
  if (risk === "critical") return "border-warning-200 bg-warning-50 text-warning-800";
  if (risk === "soon") return "border-warning-200 bg-warning-50 text-warning-800";
  return "border-sand-200 bg-sand-50 text-ink-700";
}

export function WorkOrderSlaPriorityQueue() {
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

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

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#slafilter") return;
    document.getElementById("slafilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  const queue = useMemo(() => buildSlaPriorityQueue(items.map((item) => ({
    id: item.id,
    status: item.status,
    priority: item.priority,
    assigned: Boolean(item.assigned_to),
    sla: item.sla,
    payload: item,
  })), 6), [items]);

  const visible = useMemo(() => {
    if (riskFilter === "unassigned") return queue.filter((item) => !item.assigned);
    if (riskFilter !== "all") return queue.filter((item) => item.sla.risk === riskFilter);
    return queue;
  }, [queue, riskFilter]);

  if (!loading && error) return <InlineAlert>{error}</InlineAlert>;
  if (!loading && queue.length === 0) return null;

  return <div id="slafilter" className="scroll-mt-36">
  <Panel title="Nästa SLA-åtgärder" description="Automatiskt prioriterad kö med passerade, kritiska och snart förfallande arbetsordrar. Otilldelade arbetsordrar tilldelas i Planering eller Dagens förvaltning.">
    <form onSubmit={(event) => event.preventDefault()} className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <fieldset disabled={loading} className="contents">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Filtrera kön</span>
          <select autoFocus value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera SLA-kö">
            <option value="all">Alla SLA-risker</option>
            <option value="overdue">Försenade</option>
            <option value="critical">Kritiska</option>
            <option value="soon">Snart förfallande</option>
            <option value="unassigned">Otilldelade</option>
          </select>
        </label>
      </fieldset>
    </form>
    {loading ? (
      <p className="text-sm text-ink-500">SLA-kön hämtas.</p>
    ) : visible.length === 0 ? (
      <EmptyState title="Inga poster matchar filtret" description="Ändra filtret för att visa fler SLA-åtgärder, eller tilldela otilldelade ordrar i Planering." />
    ) : (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {visible.map((entry) => {
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
          <div className="mt-4 grid gap-2">
            {!workOrder.assigned_to ? <Link href="/dashboard/arbetsorder/planering" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-current/20 bg-white/70 text-xs font-semibold transition hover:bg-white">Tilldela i Planering <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
            <Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-current/20 bg-white/70 text-xs font-semibold transition hover:bg-white">Öppna och åtgärda <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </article>;
      })}
    </div>
    )}
  </Panel>
  </div>;
}
