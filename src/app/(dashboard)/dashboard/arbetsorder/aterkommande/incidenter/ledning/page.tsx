"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, RefreshCw, ShieldAlert, UserRoundX } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";

type Summary = { incidents: number; open: number; resolved: number; activeBreaches: number; escalated: number; unassigned: number; responseCompliance: number | null; resolutionCompliance: number | null };
type Trend = { incidents: number; activeBreaches: number; unassigned: number; responseCompliance: number | null; resolutionCompliance: number | null };
type Workload = { assignee: string; open: number; breaches: number; escalated: number };
type Critical = { notificationKey: string; source: string; status: string; assignee: string; responseDueAt: string | null; resolutionDueAt: string | null; escalationLevel: number; activeBreach: boolean; riskScore: number };
type Overview = { period: { days: number; currentFrom: string; currentTo: string }; current: Summary; previous: Summary; trend: Trend; workload: Workload[]; critical: Critical[] };

const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function percentage(value: number | null) { return value === null ? "–" : `${value.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`; }
function TrendValue({ value, inverse = false, suffix = "" }: { value: number | null; inverse?: boolean; suffix?: string }) {
  if (value === null) return <span className="text-xs text-ink-400">Ingen jämförelse</span>;
  if (value === 0) return <span className="text-xs text-ink-500">Oförändrat</span>;
  const good = inverse ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${good ? "text-emerald-700" : "text-red-700"}`}><Icon className="h-3.5 w-3.5" />{Math.abs(value).toLocaleString("sv-SE", { maximumFractionDigits: 1 })}{suffix}</span>;
}
function risk(score: number) {
  if (score >= 60) return { label: "Kritisk", className: "bg-red-100 text-red-800" };
  if (score >= 30) return { label: "Hög", className: "bg-amber-100 text-amber-800" };
  return { label: "Bevaka", className: "bg-blue-50 text-blue-700" };
}

export default function ExecutiveIncidentOverviewPage() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(selectedDays = days) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/work-orders/recurring/incidents/executive-overview?days=${selectedDays}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta ledningsöversikten");
      setData(body);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta ledningsöversikten"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(days); }, [days]);

  return <div className="space-y-8">
    <PageHeader eyebrow="Ledningsuppföljning" title="Driftöversikt för schemaincidenter" description="Jämför perioder, följ SLA-utveckling och prioritera incidenter som kräver ledningens uppmärksamhet." action={<div className="flex flex-wrap gap-2"><Link href="/dashboard/arbetsorder/aterkommande/incidenter/sla-rapport" className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><ArrowLeft className="h-4 w-4" /> SLA-rapport</Link><button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button></div>} />
    <Panel title="Rapportperiod" description={data ? `${date.format(new Date(data.period.currentFrom))}–${date.format(new Date(data.period.currentTo))}, jämfört med föregående lika lång period` : "Välj period"}><div className="max-w-xs"><select className={premiumFieldClass} value={days} onChange={(event) => setDays(event.target.value)}><option value="7">7 dagar</option><option value="30">30 dagar</option><option value="60">60 dagar</option><option value="90">90 dagar</option><option value="180">180 dagar</option></select></div></Panel>
    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {loading && !data ? <div className="rounded-2xl border border-sand-200 bg-white p-8 text-sm text-ink-500">Hämtar ledningsdata…</div> : null}
    {data ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={AlertTriangle} label="Incidenter" value={data.current.incidents} hint={<TrendValue value={data.trend.incidents} inverse />} /><MetricCard icon={ShieldAlert} label="Aktiva SLA-brott" value={data.current.activeBreaches} hint={<TrendValue value={data.trend.activeBreaches} inverse />} /><MetricCard icon={UserRoundX} label="Utan ansvarig" value={data.current.unassigned} hint={<TrendValue value={data.trend.unassigned} inverse />} /><MetricCard icon={CheckCircle2} label="Lösta" value={data.current.resolved} hint={`${data.current.open} fortfarande öppna`} /></section>
      <section className="grid gap-4 lg:grid-cols-2"><Panel title="Svarsmåluppfyllelse" description="Andel avgjorda svarsmål som uppfylldes"><div className="flex items-end justify-between gap-4"><div><p className="text-4xl font-semibold text-ink-950">{percentage(data.current.responseCompliance)}</p><p className="mt-2 text-sm text-ink-500">Föregående: {percentage(data.previous.responseCompliance)}</p></div><TrendValue value={data.trend.responseCompliance} suffix=" procentenheter" /></div></Panel><Panel title="Lösningsmåluppfyllelse" description="Andel avgjorda lösningsmål som uppfylldes"><div className="flex items-end justify-between gap-4"><div><p className="text-4xl font-semibold text-ink-950">{percentage(data.current.resolutionCompliance)}</p><p className="mt-2 text-sm text-ink-500">Föregående: {percentage(data.previous.resolutionCompliance)}</p></div><TrendValue value={data.trend.resolutionCompliance} suffix=" procentenheter" /></div></Panel></section>
      <Panel title="Ansvarsbelastning" description="Öppna incidenter och avvikelser per ansvarig" bodyClassName="p-0">{!data.workload.length ? <EmptyState title="Ingen aktiv belastning" description="Det finns inga öppna incidenter under perioden." /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-sand-200 bg-sand-50 text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-5 py-3">Ansvarig</th><th className="px-5 py-3 text-right">Öppna</th><th className="px-5 py-3 text-right">SLA-brott</th><th className="px-5 py-3 text-right">Eskalerade</th></tr></thead><tbody className="divide-y divide-sand-100">{data.workload.map((item) => <tr key={item.assignee}><td className="px-5 py-4 font-semibold text-ink-900">{item.assignee}</td><td className="px-5 py-4 text-right">{item.open}</td><td className={`px-5 py-4 text-right font-semibold ${item.breaches ? "text-red-700" : "text-ink-600"}`}>{item.breaches}</td><td className="px-5 py-4 text-right">{item.escalated}</td></tr>)}</tbody></table></div>}</Panel>
      <Panel title="Prioriterade incidenter" description="Rangordnade efter SLA-brott, eskalering och avsaknad av ansvarig" bodyClassName="p-0">{!data.critical.length ? <EmptyState title="Inga kritiska incidenter" description="Det finns inga öppna incidenter som kräver särskild uppmärksamhet." /> : <div className="divide-y divide-sand-100">{data.critical.map((item) => { const level = risk(item.riskScore); return <article key={item.notificationKey} className="p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${level.className}`}>{level.label} risk</span>{item.activeBreach ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Aktivt SLA-brott</span> : null}{item.escalationLevel ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Eskalerad nivå {item.escalationLevel}</span> : null}</div><h2 className="mt-3 font-semibold text-ink-950">{item.source}</h2><p className="mt-1 break-all text-sm text-ink-500">{item.notificationKey}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-600"><span>Ansvarig: <strong>{item.assignee}</strong></span>{item.responseDueAt ? <span>Svar senast {dateTime.format(new Date(item.responseDueAt))}</span> : null}{item.resolutionDueAt ? <span>Lösning senast {dateTime.format(new Date(item.resolutionDueAt))}</span> : null}</div></div><Link href="/dashboard/arbetsorder/aterkommande/incidenter" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700 hover:underline">Öppna incidenthantering <ArrowRight className="h-4 w-4" /></Link></div></article>; })}</div>}</Panel>
    </> : null}
  </div>;
}
