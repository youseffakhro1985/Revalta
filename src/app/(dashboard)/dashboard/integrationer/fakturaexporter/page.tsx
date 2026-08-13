"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, RefreshCw, RotateCcw, Search, Send, XCircle } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Provider = { id: string; name: string; configured: boolean };
type WorkOrder = { id: string; title: string; status: string; property: { name: string; address: string; city: string } };
type Job = {
  jobId: string;
  workOrderId: string;
  provider: string;
  status: string;
  attempt: number;
  createdAt: string;
  updatedAt?: string;
  error?: string | null;
  externalId?: string | null;
  invoiceVersionId?: string | null;
  source?: "table" | "legacy";
  workOrder: WorkOrder | null;
};
type Data = { jobs: Job[]; counts: Record<string, number>; total: number; providers: Provider[]; canManage: boolean };

const statusLabels: Record<string, string> = { queued: "I kö", processing: "Bearbetas", sent: "Skickad", failed: "Misslyckad", cancelled: "Avbruten" };
const providerLabels: Record<string, string> = { fortnox: "Fortnox", visma: "Visma", webhook: "Webhook" };
const dt = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function badge(status: string) {
  if (status === "sent") return "bg-emerald-50 text-emerald-800";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "cancelled") return "bg-sand-100 text-ink-600";
  if (status === "processing") return "bg-blue-50 text-blue-800";
  return "bg-amber-50 text-amber-800";
}

export default function InvoiceExportOperationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (provider) params.set("provider", provider);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/integrations/invoice-exports?${params.toString()}`, { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta exportdriften");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta exportdriften");
    } finally {
      setLoading(false);
    }
  }, [provider, query, status]);

  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);

  async function act(job: Job, action: "retry" | "cancel") {
    setSaving(job.jobId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/invoice-exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId: job.jobId }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Åtgärden misslyckades");
      setMessage(action === "retry" ? "Exportjobbet har lagts tillbaka i kön." : "Exportjobbet har avbrutits.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Åtgärden misslyckades");
    } finally {
      setSaving(null);
    }
  }

  const configured = useMemo(() => data?.providers.filter(item => item.configured).length ?? 0, [data]);
  const active = (data?.counts.queued ?? 0) + (data?.counts.processing ?? 0);
  const sent = data?.counts.sent ?? 0;
  const failed = data?.counts.failed ?? 0;

  return <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
    <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Link href="/dashboard/integrationer" className="text-sm font-semibold text-petroleum-700">Integrationer</Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[.16em] text-petroleum-600">Ekonomi · integrationer</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Driftcenter för fakturaexporter</h1>
          <p className="mt-2 max-w-3xl text-ink-600">Samlad kontroll över Fortnox-, Visma- och webhookexporter för hela organisationen. Följ köer, fel, kvittenser och återförsök från en plats.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Uppdatera
        </button>
      </div>
    </header>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{message}</div> : null}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={CheckCircle2} label="Redo integrationer" value={configured} />
      <MetricCard icon={Clock3} label="Aktiva jobb" value={active} />
      <MetricCard icon={Send} label="Skickade" value={sent} />
      <MetricCard icon={AlertTriangle} label="Misslyckade" value={failed} />
    </div>

    <Panel title="Filter och sökning" description="Filtrera på leverantör, status, arbetsorder, fastighet eller externt faktura-ID.">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Sök arbetsorder, fastighet, jobb-ID eller fel..." aria-label="Sök arbetsorder, fastighet, jobb-ID eller fel" className="w-full rounded-xl border border-sand-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-petroleum-500" /></label>
        <select value={provider} onChange={event => setProvider(event.target.value)} aria-label="Filtrera efter leverantör" className="rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm"><option value="">Alla leverantörer</option>{data?.providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filtrera efter status" className="rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm"><option value="">Alla statusar</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
    </Panel>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Exportjobb" description={`${data?.jobs.length ?? 0} visade av ${data?.total ?? 0} jobb`}>
        {loading && !data ? <div className="h-64 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data && data.jobs.length === 0 ? <EmptyState title="Inga exportjobb matchar" description="Ändra filtren eller skapa ett exportjobb från ett faktureringsunderlag." /> : null}
        <div className="space-y-3">
          {data?.jobs.map(job => <article key={job.jobId} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 lg:flex-row">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink-950">{providerLabels[job.provider] || job.provider}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge(job.status)}`}>{statusLabels[job.status] || job.status}</span><span className="text-xs text-ink-500">Försök {job.attempt || 1}</span></div>
                <h2 className="mt-3 truncate text-base font-semibold text-ink-900">{job.workOrder?.title || "Arbetsorder saknas"}</h2>
                <p className="mt-1 text-sm text-ink-600">{job.workOrder?.property ? `${job.workOrder.property.name} · ${job.workOrder.property.address}, ${job.workOrder.property.city}` : job.workOrderId}</p>
                <p className="mt-2 text-xs text-ink-500">Senast uppdaterad {dt.format(new Date(job.updatedAt || job.createdAt))}{job.externalId ? ` · Externt ID ${job.externalId}` : ""}</p>
                {job.source === "legacy" ? <p className="mt-3 text-xs font-medium text-amber-800">Äldre jobb – kör backfill till WorkOrderInvoiceExportJob innan omkörning eller avbryt.</p> : null}
                {job.error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{job.error}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-2">
                <Link href={`/dashboard/arbetsorder/${job.workOrderId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 px-3 py-2 text-xs font-semibold text-ink-700"><ExternalLink className="h-3.5 w-3.5" />Öppna</Link>
                {data.canManage && job.source !== "legacy" && job.status === "failed" ? <button onClick={() => void act(job, "retry")} disabled={saving === job.jobId} className="inline-flex items-center gap-1.5 rounded-lg bg-petroleum-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Försök igen</button> : null}
                {data.canManage && job.source !== "legacy" && ["queued", "processing"].includes(job.status) ? <button onClick={() => void act(job, "cancel")} disabled={saving === job.jobId} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Avbryt</button> : null}
              </div>
            </div>
          </article>)}
        </div>
      </Panel>

      <Panel title="Integrationsstatus" description="Konfiguration läses säkert från miljövariabler.">
        <div className="space-y-3">{data?.providers.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl border border-sand-200 p-4"><div><p className="font-semibold text-ink-900">{item.name}</p><p className="mt-1 text-xs text-ink-500">{item.configured ? "Redo för export" : "Konfiguration saknas"}</p></div>{item.configured ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}</div>)}</div>
        <div className="mt-5 rounded-xl bg-sand-50 p-4 text-sm leading-6 text-ink-600">Jobb och historik är tenant-säkra. Hemliga nycklar visas aldrig i gränssnittet eller sparas i integrationshistoriken.</div>
      </Panel>
    </div>
  </div>;
}
