"use client";

import { readResponseJson } from "@/lib/fetch-json";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDashed, Plug, ReceiptText, Send, ShieldCheck } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";

type Integration = { type: string; configured: boolean; requiredEnv: string[] };
type IntegrationEvent = { id: string; type: string; status: string; recipient: string | null; created_at: string };
type InvoiceExportSummary = { total: number; active: number; failed: number; sent: number };

const labels: Record<string, string> = {
  email: "E-post",
  demo_leads: "Demo-leads",
  sms: "SMS",
  stripe: "Stripe/betalning",
  storage: "Filuppladdning",
  ai: "AI-klassificering",
  fortnox: "Fortnox",
  visma: "Visma",
  invoice_webhook: "Fakturawebhook",
  "work_order.invoice_integration_job": "Fakturaexport",
};
const statusLabels: Record<string, string> = {
  queued: "Köad",
  processing: "Bearbetas",
  sent: "Skickad",
  success: "Lyckad",
  completed: "Slutförd",
  failed: "Misslyckad",
  mocked: "Mockad",
  cancelled: "Avbruten",
};
const descriptions: Record<string, string> = {
  email: "Utskick av inbjudningar, notiser och bekräftelser.",
  demo_leads: "Mottagning och e-postleverans av sparade demoförfrågningar från den publika webbplatsen.",
  sms: "Snabba driftmeddelanden och kritiska aviseringar.",
  stripe: "Checkout, abonnemang och webhookar med pris-ID för samtliga köpbara planer.",
  storage: "Dokument, bilder och bilagor i extern fillagring. BLOB_READ_WRITE_TOKEN föredras; STORAGE_PROVIDER_KEY stöds som legacy-reserv.",
  ai: "Diskret klassificering och prioritering bakom gränssnittet.",
  fortnox: "Automatisk export av godkända faktureringsunderlag till Fortnox.",
  visma: "Automatisk export av godkända faktureringsunderlag till Visma.",
  invoice_webhook: "Säker generell webhook för externa ekonomi- och fakturasystem.",
};
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [invoiceExportSummary, setInvoiceExportSummary] = useState<InvoiceExportSummary>({ total: 0, active: 0, failed: 0, sent: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function loadIntegrations() {
      try {
        const response = await fetch("/api/integrations", { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await readResponseJson(response);
        if (!isMounted) return;
        if (!response.ok) { setError(data.error || "Kunde inte hämta integrationer"); return; }
        setIntegrations(data.integrations || []);
        setEvents(data.events || []);
        setInvoiceExportSummary(data.invoiceExportSummary || { total: 0, active: 0, failed: 0, sent: 0 });
      } catch {
        if (isMounted) setError("Kunde inte kontakta servern");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void loadIntegrations();
    return () => { isMounted = false; };
  }, [router]);

  const summary = useMemo(() => ({
    configured: integrations.filter((integration) => integration.configured).length,
    pending: integrations.filter((integration) => !integration.configured).length,
    successfulEvents: events.filter((event) => event.status === "sent" || event.status === "success" || event.status === "completed").length,
  }), [events, integrations]);

  return (
    <div className="space-y-8 animate-fade-in-soft">
      <PageHeader eyebrow="System och anslutningar" title="Integrationer" description="Samlad status för externa tjänster, ekonomisystem, tekniska krav och senaste integrationshändelser." action={<div className="inline-flex items-center gap-2 rounded-xl border border-petroleum-100 bg-petroleum-50 px-4 py-3 text-sm font-semibold text-petroleum-800"><ShieldCheck className="h-5 w-5" />Hemligheter skyddas i miljövariabler</div>} />

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Plug} label="Integrationer" value={loading ? "—" : integrations.length} />
        <MetricCard icon={CheckCircle2} label="Konfigurerade" value={loading ? "—" : summary.configured} />
        <MetricCard icon={CircleDashed} label="Väntar på konfiguration" value={loading ? "—" : summary.pending} />
        <MetricCard icon={Send} label="Slutförda händelser" value={loading ? "—" : summary.successfulEvents} />
      </section>

      <Link href="/dashboard/integrationer/fakturaexporter" className="group block rounded-2xl border border-petroleum-100 bg-gradient-to-br from-white to-petroleum-50/50 p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)] transition hover:-translate-y-0.5 hover:border-petroleum-200 hover:shadow-lg">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-petroleum-800 text-white"><ReceiptText className="h-6 w-6" /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Ekonomidrift</p><h2 className="mt-1 text-xl font-semibold text-ink-950">Driftcenter för fakturaexporter</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">Övervaka Fortnox-, Visma- och webhookjobb, se fel och externa kvittenser samt hantera säkra återförsök och avbrytningar.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[380px]">
            <div className="rounded-xl border border-sand-200 bg-white px-3 py-3"><p className="text-xs text-ink-500">Totalt</p><p className="mt-1 text-lg font-semibold text-ink-950">{loading ? "—" : invoiceExportSummary.total}</p></div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3"><p className="text-xs text-amber-700">Aktiva</p><p className="mt-1 text-lg font-semibold text-amber-900">{loading ? "—" : invoiceExportSummary.active}</p></div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3"><p className="text-xs text-emerald-700">Skickade</p><p className="mt-1 text-lg font-semibold text-emerald-900">{loading ? "—" : invoiceExportSummary.sent}</p></div>
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3"><p className="text-xs text-red-700">Fel</p><p className="mt-1 text-lg font-semibold text-red-900">{loading ? "—" : invoiceExportSummary.failed}</p></div>
          </div>
          <ArrowRight className="hidden h-5 w-5 shrink-0 text-petroleum-700 transition group-hover:translate-x-1 lg:block" />
        </div>
      </Link>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => (
          <article key={integration.type} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">{labels[integration.type] || integration.type}</p>
            <div className={`mt-4 w-fit rounded-full px-3 py-1 text-xs font-semibold ${integration.configured ? "bg-success-50 text-success-700" : "bg-warning-50 text-warning-700"}`}>{integration.configured ? "Konfigurerad" : "Konfiguration saknas"}</div>
            <p className="mt-4 text-sm leading-6 text-ink-500">{descriptions[integration.type] || "Extern systemanslutning."}</p>
            <div className="mt-5 rounded-xl bg-sand-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Miljövariabler</p><p className="mt-1 break-words text-xs leading-5 text-ink-600">{integration.requiredEnv.length ? integration.requiredEnv.join(", ") : "Inga externa nycklar krävs"}</p></div>
          </article>
        ))}
      </section>

      <Panel title="Senaste integrationshändelser" description="Teknisk historik för utskick, betalningar, fakturaexporter och externa anrop." bodyClassName="p-0">
        {loading ? <div className="space-y-4 p-6">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-sand-100" />)}</div> : events.length > 0 ? <div className="divide-y divide-sand-100">{events.map((event) => <article key={event.id} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-ink-950">{labels[event.type] || event.type}</h3><p className="mt-1 text-sm text-ink-500">{event.recipient || "Ingen mottagare"} · {dateFormatter.format(new Date(event.created_at))}</p></div><span className="w-fit rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{statusLabels[event.status] || event.status}</span></article>)}</div> : <EmptyState title="Inga integrationshändelser ännu" description="När Revalta skickar eller tar emot data via en integration visas händelsen här." />}
      </Panel>
    </div>
  );
}
