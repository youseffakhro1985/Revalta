"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, Clock3, Download, RefreshCw, UserRoundX } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Summary = {
  periodDays: number;
  from: string;
  to: string;
  incidents: number;
  responseMeasured: number;
  responseMet: number;
  responseCompliance: number | null;
  resolutionMeasured: number;
  resolutionMet: number;
  resolutionCompliance: number | null;
  averageResponseHours: number | null;
  averageResolutionHours: number | null;
  activeBreaches: number;
  unassigned: number;
};

type Row = {
  notificationKey: string;
  source: string;
  assignee: string;
  status: string;
  responseDueAt: string | null;
  acknowledgedAt: string | null;
  responseMet: boolean | null;
  responseHours: number | null;
  resolutionDueAt: string | null;
  resolvedAt: string | null;
  resolutionMet: boolean | null;
  resolutionHours: number | null;
  activeBreach: boolean;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
function when(value: string | null) { return value ? dateTime.format(new Date(value)) : "–"; }
function percent(value: number | null) { return value === null ? "–" : `${value.toLocaleString("sv-SE")} %`; }
function hours(value: number | null) { return value === null ? "–" : `${value.toLocaleString("sv-SE")} h`; }
function statusLabel(status: string) {
  if (status === "resolved") return "Löst";
  if (status === "acknowledged") return "Kvitterat";
  if (status === "reopened") return "Återöppnat";
  return "Öppen";
}

export default function RecurringIncidentSlaReportPage() {
  const [days, setDays] = useState("30");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (selectedDays: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/work-orders/recurring/incidents/sla-report?days=${selectedDays}`, { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta SLA-rapporten");
      setSummary(body.summary); setRows(body.rows || []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta SLA-rapporten");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load("30"); }, [load]);

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Driftuppföljning"
      title="SLA-rapport för schemaincidenter"
      description="Följ svarstider, lösningstider, måluppfyllelse och aktiva avvikelser för återkommande arbetsordrar."
      action={<div className="flex flex-wrap gap-2">
        <Link href="/dashboard/arbetsorder/aterkommande/incidenter" className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><ChevronLeft className="h-4 w-4" /> Till incidenter</Link>
        <a href={`/api/work-orders/recurring/incidents/sla-report?days=${days}&format=csv`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-petroleum-700 px-4 text-sm font-semibold text-white"><Download className="h-4 w-4" /> Exportera CSV</a>
        <button type="button" onClick={() => void load(days)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
      </div>}
    />

    <Panel title="Rapportperiod" description="Välj hur långt bak rapporten ska analysera senaste SLA-inställningen per incident.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="w-full max-w-xs text-sm font-semibold text-ink-700">Period
          <select className={`${premiumFieldClass} mt-2`} value={days} onChange={(event) => { const value = event.target.value; setDays(value); void load(value); }}>
            <option value="7">Senaste 7 dagarna</option>
            <option value="30">Senaste 30 dagarna</option>
            <option value="90">Senaste 90 dagarna</option>
            <option value="180">Senaste 180 dagarna</option>
            <option value="365">Senaste 365 dagarna</option>
          </select>
        </label>
        {summary ? <p className="pb-3 text-sm text-ink-500">{dateTime.format(new Date(summary.from))} – {dateTime.format(new Date(summary.to))}</p> : null}
      </div>
    </Panel>

    {error ? <InlineAlert>{error}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={BarChart3} label="Incidenter med SLA" value={summary?.incidents ?? 0} />
      <MetricCard icon={CheckCircle2} label="Svarsmål uppfyllt" value={percent(summary?.responseCompliance ?? null)} />
      <MetricCard icon={CheckCircle2} label="Lösningsmål uppfyllt" value={percent(summary?.resolutionCompliance ?? null)} />
      <MetricCard icon={AlertTriangle} label="Aktiva SLA-brott" value={summary?.activeBreaches ?? 0} />
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Clock3} label="Genomsnittlig svarstid" value={hours(summary?.averageResponseHours ?? null)} />
      <MetricCard icon={Clock3} label="Genomsnittlig lösningstid" value={hours(summary?.averageResolutionHours ?? null)} />
      <MetricCard icon={UserRoundX} label="Öppna utan ansvarig" value={summary?.unassigned ?? 0} />
      <MetricCard icon={CheckCircle2} label="Lösta inom mål" value={summary ? `${summary.resolutionMet}/${summary.resolutionMeasured}` : "0/0"} />
    </section>

    <Panel title="Incidentdetaljer" description="Rapporten visar den senaste SLA-versionen inom vald period och aktuell incidentstatus." bodyClassName="p-0">
      {loading && !rows.length ? <div className="p-8 text-sm text-ink-500">Hämtar rapportdata…</div> : null}
      {!loading && !rows.length ? <EmptyState title="Ingen SLA-data i perioden" description="Sätt svarstid eller lösningstid på en schemaincident för att börja följa måluppfyllelse." /> : null}
      {rows.length ? <div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-left text-sm">
        <thead className="border-b border-sand-200 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink-500"><tr>
          <th className="px-5 py-4">Incident</th><th className="px-4 py-4">Ansvarig</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Svarsmål</th><th className="px-4 py-4">Svarstid</th><th className="px-4 py-4">Lösningsmål</th><th className="px-4 py-4">Lösningstid</th><th className="px-4 py-4">Avvikelse</th>
        </tr></thead>
        <tbody className="divide-y divide-sand-100">{rows.map((row) => <tr key={row.notificationKey} className={row.activeBreach ? "bg-red-50/40" : "bg-white"}>
          <td className="px-5 py-4"><p className="font-semibold text-ink-900">{row.source}</p><p className="mt-1 max-w-[280px] truncate text-xs text-ink-400" title={row.notificationKey}>{row.notificationKey}</p></td>
          <td className="px-4 py-4 text-ink-700">{row.assignee}</td>
          <td className="px-4 py-4"><span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{statusLabel(row.status)}</span></td>
          <td className="px-4 py-4"><p className="text-ink-700">{when(row.responseDueAt)}</p><p className={`mt-1 text-xs font-semibold ${row.responseMet === false ? "text-red-700" : row.responseMet ? "text-emerald-700" : "text-ink-400"}`}>{row.responseMet === null ? "Ej mätt" : row.responseMet ? "Uppfyllt" : "Ej uppfyllt"}</p></td>
          <td className="px-4 py-4"><p className="font-semibold text-ink-800">{hours(row.responseHours)}</p><p className="mt-1 text-xs text-ink-400">Kvitterad {when(row.acknowledgedAt)}</p></td>
          <td className="px-4 py-4"><p className="text-ink-700">{when(row.resolutionDueAt)}</p><p className={`mt-1 text-xs font-semibold ${row.resolutionMet === false ? "text-red-700" : row.resolutionMet ? "text-emerald-700" : "text-ink-400"}`}>{row.resolutionMet === null ? "Ej mätt" : row.resolutionMet ? "Uppfyllt" : "Ej uppfyllt"}</p></td>
          <td className="px-4 py-4"><p className="font-semibold text-ink-800">{hours(row.resolutionHours)}</p><p className="mt-1 text-xs text-ink-400">Löst {when(row.resolvedAt)}</p></td>
          <td className="px-4 py-4">{row.activeBreach ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">Aktivt SLA-brott</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Ingen aktiv avvikelse</span>}</td>
        </tr>)}</tbody>
      </table></div> : null}
    </Panel>
  </div>;
}
