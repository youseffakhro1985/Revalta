"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3, FolderKanban } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";

type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_cost: string | number | null;
  actual_cost: string | number | null;
  created_at: string;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string } | null;
  ticket: { id: string; public_reference: string | null; title: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
  projects: { id: string; name: string; status: string }[];
};

const columns = [
  { key: "planned", label: "Planerade" },
  { key: "assigned", label: "Tilldelade" },
  { key: "in_progress", label: "Pågående" },
  { key: "waiting", label: "Väntar" },
  { key: "completed", label: "Klara" },
] as const;

const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(value: string | number | null) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(Number(value));
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/work-orders", { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordrar");
        if (mounted) setWorkOrders(data.workOrders || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordrar");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  const visibleWorkOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workOrders.filter((workOrder) => {
      if (workOrder.status === "cancelled") return false;
      if (!query) return true;
      return [
        workOrder.title,
        workOrder.property.name,
        workOrder.property.address,
        workOrder.unit?.designation,
        workOrder.ticket?.public_reference,
        workOrder.assigned_to?.name,
        workOrder.assigned_to?.email,
        workOrder.projects[0]?.name,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    });
  }, [search, workOrders]);

  const urgent = visibleWorkOrders.filter((workOrder) => workOrder.priority === "urgent").length;
  const overdue = visibleWorkOrders.filter((workOrder) => workOrder.scheduled_end && new Date(workOrder.scheduled_end) < new Date() && workOrder.status !== "completed").length;
  const unassigned = visibleWorkOrders.filter((workOrder) => !workOrder.assigned_to).length;
  const completed = visibleWorkOrders.filter((workOrder) => workOrder.status === "completed").length;

  async function changeStatus(workOrderId: string, status: string) {
    setUpdatingId(workOrderId);
    setError("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetsordern");
      setWorkOrders((current) => current.map((workOrder) => workOrder.id === workOrderId ? data.workOrder : workOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera arbetsordern");
    } finally {
      setUpdatingId(null);
    }
  }

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Operativ förvaltning"
      title="Arbetsordrar"
      description="Planera, tilldela och följ upp riktiga arbetsordrar med koppling till ärende, fastighet, enhet, kostnad och projekt."
      action={<Link href="/dashboard/felanmalan" className="inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800 focus:outline-none focus:ring-2 focus:ring-petroleum-200">Skapa från ärende</Link>}
    />

    {error ? <InlineAlert>{error}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={AlertTriangle} label="Akuta" value={urgent} hint="Kräver omedelbar prioritering" />
      <MetricCard icon={CalendarClock} label="Försenade" value={overdue} hint="Har passerat planerat slutdatum" />
      <MetricCard icon={Clock3} label="Ej tilldelade" value={unassigned} hint="Saknar ansvarig utförare" />
      <MetricCard icon={CheckCircle2} label="Klara för kontroll" value={completed} hint="Redo för ekonomisk och teknisk slutkontroll" />
    </section>

    <Panel title="Planeringstavla" description="Sök, prioritera och flytta arbetsordrar mellan statusstegen." bodyClassName="p-4 sm:p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök arbetsorder, fastighet, enhet eller projekt" className={`${premiumFieldClass} sm:max-w-md`} aria-label="Sök arbetsordrar" />
        <p className="text-xs font-medium text-ink-400">{visibleWorkOrders.length} aktiva arbetsordrar</p>
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-5">{columns.map((column) => <div key={column.key} className="h-96 animate-pulse rounded-2xl bg-sand-100" />)}</div>
      ) : visibleWorkOrders.length === 0 ? (
        <EmptyState title="Inga arbetsordrar matchar sökningen" description="Skapa en arbetsorder från ett ärende eller justera sökningen." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          {columns.map((column) => {
            const items = visibleWorkOrders.filter((workOrder) => workOrder.status === column.key);
            return <section key={column.key} className="min-h-[420px] rounded-2xl border border-sand-200 bg-[#F1F1EC] p-3">
              <div className="flex items-center justify-between px-2 py-2">
                <div><h2 className="text-sm font-semibold text-ink-900">{column.label}</h2><p className="mt-0.5 text-xs text-ink-400">{items.length} arbetsordrar</p></div>
                <span className="rounded-full border border-sand-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-500">{items.length}</span>
              </div>
              <div className="mt-2 space-y-3">
                {items.map((workOrder) => <article key={workOrder.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-[0_1px_2px_rgba(17,34,31,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(17,34,31,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="font-semibold leading-5 text-ink-900 transition hover:text-petroleum-800">{workOrder.title}</Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${workOrder.priority === "urgent" ? "bg-red-50 text-red-700" : workOrder.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-sand-50 text-ink-500"}`}>{priorityLabels[workOrder.priority] || workOrder.priority}</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-500">{workOrder.property.name}{workOrder.unit ? ` · ${workOrder.unit.designation}` : ""}</p>
                  <p className="text-xs leading-5 text-ink-400">{workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"}</p>
                  {workOrder.ticket ? <p className="mt-1 text-[11px] text-ink-400">Ärende {workOrder.ticket.public_reference || workOrder.ticket.id.slice(0, 8)}</p> : null}
                  {workOrder.projects[0] ? <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-petroleum-50 px-2.5 py-2 text-[11px] font-medium text-petroleum-700"><FolderKanban className="h-3.5 w-3.5" />{workOrder.projects[0].name}</div> : null}
                  <div className="mt-4 border-t border-sand-100 pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400"><span>{formatDate(workOrder.scheduled_end)}</span>{formatMoney(workOrder.estimated_cost) ? <span>{formatMoney(workOrder.estimated_cost)}</span> : null}</div>
                    <select value={workOrder.status} disabled={updatingId === workOrder.id} onChange={(event) => void changeStatus(workOrder.id, event.target.value)} className="h-10 w-full rounded-xl border border-sand-200 bg-sand-50 px-3 text-xs font-semibold text-ink-700 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Ändra status för ${workOrder.title}`}>
                      {columns.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                      <option value="cancelled">Avbruten</option>
                    </select>
                  </div>
                </article>)}
                {items.length === 0 ? <div className="rounded-xl border border-dashed border-sand-300 bg-white/60 p-6 text-center"><ClipboardList className="mx-auto h-5 w-5 text-ink-300" /><p className="mt-2 text-xs text-ink-400">Inga arbetsordrar</p></div> : null}
              </div>
            </section>;
          })}
        </div>
      )}
    </Panel>
  </div>;
}
