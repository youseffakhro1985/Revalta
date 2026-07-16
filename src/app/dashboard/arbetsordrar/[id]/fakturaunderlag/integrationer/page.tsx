"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CloudCog, RefreshCw, RotateCcw, Send, XCircle } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Provider = { id: string; name: string; configured: boolean };
type Job = { jobId: string; provider: string; status: string; attempt: number; invoiceVersionId?: string | null; error?: string | null; createdAt: string; updatedAt?: string };
type Data = { providers: Provider[]; jobs: Job[]; hasInvoiceBasis: boolean; canManage: boolean };
const dt = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const providerName: Record<string, string> = { fortnox: "Fortnox", visma: "Visma", webhook: "Generell webhook" };
const statusName: Record<string, string> = { queued: "I kö", processing: "Bearbetas", sent: "Skickad", failed: "Misslyckad", cancelled: "Avbruten", ready: "Redo" };

export default function InvoiceIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [provider, setProvider] = useState("fortnox");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/work-orders/${id}/invoice-integration`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta integrationscentret");
      setData(body);
      const firstReady = body.providers?.find((item: Provider) => item.configured);
      if (firstReady) setProvider(firstReady.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Kunde inte hämta integrationscentret"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [id]);

  async function action(payload: Record<string, unknown>) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/work-orders/${id}/invoice-integration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Åtgärden misslyckades");
      setMessage(payload.action === "queue" ? "Exportjobbet har lagts i kön." : "Exportjobbet har uppdaterats.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Åtgärden misslyckades"); }
    finally { setSaving(false); }
  }

  const jobs = data?.jobs ?? [];
  const ready = data?.providers.filter(item => item.configured).length ?? 0;
  const queued = jobs.filter(job => job.status === "queued" || job.status === "processing").length;
  const failed = jobs.filter(job => job.status === "failed").length;

  return <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
    <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
      <Link href={`/dashboard/arbetsordrar/${id}/fakturaunderlag`} className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700"><ArrowLeft className="h-4 w-4"/>Till faktureringsunderlaget</Link>
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-petroleum-600">Ekonomiintegration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Integrationscenter</h1><p className="mt-2 text-ink-600">Hantera exportkö, anslutningsstatus och återförsök utan att lagra hemliga nycklar i databasen.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>Uppdatera</button></div>
    </header>
    {error ? <InlineAlert>{error}</InlineAlert> : null}{message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{message}</div> : null}
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={CloudCog} label="Redo integrationer" value={ready}/><MetricCard icon={Send} label="I kö" value={queued}/><MetricCard icon={XCircle} label="Misslyckade" value={failed}/></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,.8fr)]">
      <Panel title="Exportjobb" description="Versionskopplad historik för arbetsorderns fakturaexporter.">
        {loading && !data ? <div className="h-52 animate-pulse rounded-xl bg-sand-100"/> : null}
        {!loading && !jobs.length ? <EmptyState title="Inga exportjobb" description="Skapa det första jobbet från panelen till höger."/> : null}
        <div className="space-y-3">{jobs.map(job => <div key={job.jobId} className="rounded-xl border border-sand-200 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink-900">{providerName[job.provider] || job.provider}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${job.status === "sent" ? "bg-emerald-50 text-emerald-800" : job.status === "failed" ? "bg-red-50 text-red-700" : job.status === "cancelled" ? "bg-sand-100 text-ink-600" : "bg-amber-50 text-amber-800"}`}>{statusName[job.status] || job.status}</span></div><p className="mt-1 text-xs text-ink-500">Försök {job.attempt} · {dt.format(new Date(job.updatedAt || job.createdAt))}</p>{job.error ? <p className="mt-2 text-sm text-red-700">{job.error}</p> : null}</div>{data?.canManage ? <div className="flex items-start gap-2">{job.status === "failed" ? <button onClick={() => void action({ action: "retry", jobId: job.jobId })} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-petroleum-800 px-3 py-2 text-xs font-semibold text-white"><RotateCcw className="h-3.5 w-3.5"/>Försök igen</button> : null}{["queued", "processing"].includes(job.status) ? <button onClick={() => void action({ action: "cancel", jobId: job.jobId })} disabled={saving} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Avbryt</button> : null}</div> : null}</div></div>)}</div>
      </Panel>
      <div className="space-y-6"><Panel title="Ny export" description="Välj en konfigurerad leverantör och lägg exporten i kön."><div className="space-y-3">{data?.providers.map(item => <label key={item.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 ${provider === item.id ? "border-petroleum-400 bg-petroleum-50" : "border-sand-200"}`}><span><span className="block font-semibold text-ink-900">{item.name}</span><span className="text-xs text-ink-500">{item.configured ? "Konfiguration hittad" : "Miljövariabler saknas"}</span></span><input type="radio" name="provider" value={item.id} checked={provider === item.id} disabled={!item.configured} onChange={() => setProvider(item.id)}/></label>)}<button onClick={() => void action({ action: "queue", provider })} disabled={saving || !data?.canManage || !data?.hasInvoiceBasis || !data?.providers.find(item => item.id === provider)?.configured} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4"/>Lägg i exportkö</button>{!data?.hasInvoiceBasis ? <p className="text-sm text-amber-700">Spara ett faktureringsunderlag innan export.</p> : null}</div></Panel><Panel title="Säker konfiguration" description="Hemligheter läses endast från Vercels miljövariabler."><div className="space-y-2 text-sm text-ink-600"><p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700"/>API-nycklar sparas inte i databasen.</p><p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700"/>Varje jobb kopplas till fakturaversion och arbetsorder.</p><p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700"/>Kö, avbrott och återförsök revisionsloggas.</p></div></Panel></div>
    </div>
  </div>;
}
