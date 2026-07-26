"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardList, Play, RefreshCw, Settings2, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/domain-labels";

type Row = {
  id: string;
  property_id: string;
  property_name: string;
  building_name: string | null;
  name: string;
  category: string | null;
  location: string | null;
  criticality: string | null;
  next_service_at: string | null;
  service_interval_months: number;
  service_lead_days: number;
  auto_create_service_work_orders: boolean;
  work_order_id: string | null;
  work_order_number: string | null;
  work_order_status: string | null;
  completed_at: string | null;
  maintenance_cycle_advanced_at: string | null;
};

type Payload = {
  rows: Row[];
  metrics: { total: number; overdue: number; dueSoon: number; automatic: number; withWorkOrder: number; completedCycles: number };
  canRun: boolean;
};

const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const criticalityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", critical: "Kritisk" };
const statusLabels = WORK_ORDER_STATUS_LABELS;

function serviceState(value: string | null) {
  if (!value) return { label: "Ej planerad", className: "bg-sand-100 text-ink-600" };
  const due = new Date(value);
  const now = new Date();
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} dagar försenad`, className: "bg-red-50 text-red-800" };
  if (days <= 7) return { label: `${days} dagar kvar`, className: "bg-amber-50 text-amber-800" };
  if (days <= 30) return { label: `${days} dagar kvar`, className: "bg-orange-50 text-orange-800" };
  return { label: date.format(due), className: "bg-petroleum-50 text-petroleum-800" };
}

export function PreventiveMaintenanceOverview() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | "soon" | "automatic">("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/maintenance/preventive", { cache: "no-store" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta underhållsöversikten");
      setData(payload);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta underhållsöversikten"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runEngine() {
    setRunning(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/maintenance/preventive", { method: "POST" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte köra underhållsmotorn");
      const result = payload.result;
      setMessage(`Körningen är klar. ${result.created} arbetsordrar skapades, ${result.skipped} hoppades över och ${result.failed} misslyckades.`);
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte köra underhållsmotorn"); }
    finally { setRunning(false); }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86_400_000);
    return data.rows.filter((row) => {
      const due = row.next_service_at ? new Date(row.next_service_at) : null;
      if (filter === "overdue") return Boolean(due && due < now);
      if (filter === "soon") return Boolean(due && due >= now && due <= in30Days);
      if (filter === "automatic") return row.auto_create_service_work_orders;
      return true;
    });
  }, [data, filter]);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (error && !data) return <InlineAlert>{error}</InlineAlert>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Förebyggande underhåll</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink-950">Serviceplan och automatik</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-500">Följ servicebehov, automatiskt skapade arbetsordrar och komponenternas aktuella underhållsstatus.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 shadow-sm hover:bg-sand-50"><RefreshCw className="h-4 w-4" /> Uppdatera</button>
          {data.canRun ? <button type="button" onClick={() => void runEngine()} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-petroleum-900 disabled:opacity-50"><Play className="h-4 w-4" /> {running ? "Kör..." : "Kör underhållsmotorn"}</button> : null}
        </div>
      </div>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={Wrench} label="Komponenter" value={data.metrics.total} hint="Aktiva och planerade" />
        <MetricCard icon={AlertTriangle} label="Förfallen service" value={data.metrics.overdue} hint="Kräver åtgärd" />
        <MetricCard icon={CalendarClock} label="Inom 30 dagar" value={data.metrics.dueSoon} hint="Kommande service" />
        <MetricCard icon={Settings2} label="Automatik aktiv" value={data.metrics.automatic} hint="Skapar arbetsorder" />
        <MetricCard icon={ClipboardList} label="Med arbetsorder" value={data.metrics.withWorkOrder} hint="Senaste servicecykeln" />
        <MetricCard icon={RefreshCw} label="Avslutade cykler" value={data.metrics.completedCycles} hint="Datum framflyttat" />
      </div>

      <Panel title="Serviceöversikt" description="Filtrera och öppna komponenter eller deras senaste planerade arbetsorder.">
        <div className="mb-5 flex flex-wrap gap-2">
          {([["all","Alla"],["overdue","Förfallna"],["soon","Inom 30 dagar"],["automatic","Automatik aktiv"]] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === value ? "bg-petroleum-800 text-white" : "bg-sand-100 text-ink-600 hover:bg-sand-200"}`}>{label}</button>)}
        </div>

        {rows.length === 0 ? <EmptyState title="Inga servicepunkter i detta urval" description="Ändra filtret eller lägg till nästa servicedatum på komponenterna." /> : (
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200 bg-white">
            {rows.map((row) => {
              const state = serviceState(row.next_service_at);
              return <div key={row.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                <div><Link href={`/dashboard/fastigheter/${row.property_id}/komponenter/${row.id}`} className="font-semibold text-ink-900 hover:text-petroleum-800">{row.name}</Link><p className="mt-1 text-xs text-ink-500">{[row.property_name, row.building_name, row.category, row.location].filter(Boolean).join(" · ")}</p></div>
                <div className="text-sm text-ink-600"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span><p className="mt-1 text-xs text-ink-400">Intervall {row.service_interval_months} mån · framförhållning {row.service_lead_days} dagar</p></div>
                <div className="text-sm"><p className="font-medium text-ink-800">{criticalityLabels[row.criticality || "normal"] || "Normal"} kritikalitet</p><p className="mt-1 text-xs text-ink-400">{row.auto_create_service_work_orders ? "Automatisk arbetsorder aktiv" : "Automatik avstängd"}</p></div>
                <div className="text-sm"><p className="font-medium text-ink-800">{row.maintenance_cycle_advanced_at ? `Cykel flyttad ${date.format(new Date(row.maintenance_cycle_advanced_at))}` : "Ingen avslutad cykel"}</p><p className="mt-1 text-xs text-ink-400">{row.completed_at ? `Service utförd ${date.format(new Date(row.completed_at))}` : "Inväntar genomförd service"}</p></div>
                <div className="flex justify-end">{row.work_order_id ? <Link href={`/dashboard/arbetsorder/${row.work_order_id}`} className="rounded-lg border border-sand-200 px-3 py-2 text-xs font-semibold text-petroleum-800 hover:bg-sand-50">{row.work_order_number || "Öppna arbetsorder"} · {statusLabels[row.work_order_status || ""] || row.work_order_status}</Link> : <span className="text-xs text-ink-400">Ingen arbetsorder skapad</span>}</div>
              </div>;
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
