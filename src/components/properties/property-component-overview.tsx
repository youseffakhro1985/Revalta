"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CircleDollarSign, Gauge, RefreshCw, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Row = Record<string, unknown>;
type Overview = {
  components: Row[];
  summary: { total: number; overdue: number; dueSoon: number; critical: number; highRisk: number; totalCostExVat: number };
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const criticalityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", critical: "Kritisk" };
const statusLabels: Record<string, string> = { active: "Aktiv", planned: "Planerad", inactive: "Inaktiv", replaced: "Utbytt", decommissioned: "Avvecklad" };

function text(row: Row, key: string) { return row[key] == null ? "" : String(row[key]); }
function number(row: Row, key: string) { return Number(row[key] || 0); }
function formatDate(value: unknown) { if (!value) return "Ej planerad"; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? "Ej planerad" : date.format(parsed); }

function serviceState(value: unknown) {
  if (!value) return { label: "Ej planerad", className: "bg-sand-100 text-ink-600" };
  const due = new Date(String(value));
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (due < now) return { label: "Förfallen", className: "bg-red-50 text-red-700" };
  if (due <= soon) return { label: "Inom 30 dagar", className: "bg-amber-50 text-amber-800" };
  return { label: "Planerad", className: "bg-emerald-50 text-emerald-800" };
}

export function PropertyComponentOverview({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | "risk">("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/overview`, { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta komponentöversikten");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta komponentöversikten");
    } finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === "overdue") return data.components.filter((row) => row.next_service_at && new Date(String(row.next_service_at)) < new Date());
    if (filter === "risk") return data.components.filter((row) => text(row, "criticality") === "critical" || text(row, "criticality") === "high" || number(row, "condition_grade") >= 4);
    return data.components;
  }, [data, filter]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Gauge} label="Komponenter" value={data?.summary.total ?? "–"} />
        <MetricCard icon={AlertTriangle} label="Förfallen service" value={data?.summary.overdue ?? "–"} hint="Kräver åtgärd" />
        <MetricCard icon={CalendarClock} label="Service inom 30 dagar" value={data?.summary.dueSoon ?? "–"} />
        <MetricCard icon={Wrench} label="Hög eller kritisk risk" value={data ? data.summary.highRisk + data.summary.critical : "–"} />
        <MetricCard icon={CircleDollarSign} label="Livscykelkostnad" value={data ? money.format(data.summary.totalCostExVat) : "–"} hint="Exklusive moms" />
      </div>

      <Panel title="Tekniska komponenter och serviceplan" description="Samlad risk-, service- och kostnadsöversikt för fastigheten." bodyClassName="p-0">
        <div className="flex flex-col justify-between gap-3 border-b border-sand-200 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-wrap gap-2">
            {([ ["all", "Alla"], ["overdue", "Förfallen service"], ["risk", "Hög risk"] ] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === key ? "bg-petroleum-800 text-white" : "border border-sand-200 bg-white text-ink-600 hover:bg-sand-50"}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 self-start rounded-lg border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-sand-50 disabled:opacity-50 sm:self-auto"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
        </div>

        {error ? <div className="p-5"><InlineAlert>{error}</InlineAlert></div> : null}
        {loading && !data ? <div className="m-5 h-44 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data && rows.length === 0 ? <EmptyState title="Inga komponenter i detta urval" description="Registrerade tekniska komponenter och servicepunkter visas här." /> : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-sand-100 text-sm">
              <thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-400"><tr><th className="px-5 py-3">Komponent</th><th className="px-5 py-3">Risk</th><th className="px-5 py-3">Nästa service</th><th className="px-5 py-3">Skick</th><th className="px-5 py-3 text-right">Kostnad</th><th className="px-5 py-3" /></tr></thead>
              <tbody className="divide-y divide-sand-100">
                {rows.map((row) => { const state = serviceState(row.next_service_at); return (
                  <tr key={text(row, "id")} className="transition hover:bg-sand-50/70">
                    <td className="px-5 py-4"><p className="font-semibold text-ink-900">{text(row, "name")}</p><p className="mt-1 text-xs text-ink-500">{text(row, "building_name") || "Ingen byggnad"}{text(row, "location") ? ` · ${text(row, "location")}` : ""} · {statusLabels[text(row, "status")] || text(row, "status")}</p></td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${text(row, "criticality") === "critical" ? "bg-red-50 text-red-700" : text(row, "criticality") === "high" ? "bg-amber-50 text-amber-800" : "bg-sand-100 text-ink-600"}`}>{criticalityLabels[text(row, "criticality")] || "Normal"}</span></td>
                    <td className="px-5 py-4"><p className="font-medium text-ink-700">{formatDate(row.next_service_at)}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.className}`}>{state.label}</span></td>
                    <td className="px-5 py-4 text-ink-600">{number(row, "condition_grade") ? `${number(row, "condition_grade")}/5` : "Ej bedömt"}</td>
                    <td className="px-5 py-4 text-right font-semibold text-ink-900">{money.format(number(row, "total_cost_ex_vat"))}</td>
                    <td className="px-5 py-4 text-right"><Link href={`/dashboard/fastigheter/${propertyId}/komponenter/${text(row, "id")}`} className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna</Link></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
