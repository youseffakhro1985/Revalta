"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Plug, Send, ShieldCheck } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";

type Integration = { type: string; configured: boolean; requiredEnv: string[] };
type IntegrationEvent = { id: string; type: string; status: string; recipient: string | null; created_at: string };

const labels: Record<string, string> = { email: "E-post", sms: "SMS", stripe: "Stripe/betalning", storage: "Filuppladdning", ai: "AI-klassificering" };
const descriptions: Record<string, string> = {
  email: "Utskick av inbjudningar, notiser och bekräftelser.",
  sms: "Snabba driftmeddelanden och kritiska aviseringar.",
  stripe: "Säker betalning och abonnemangshantering.",
  storage: "Dokument, bilder och bilagor i extern fillagring.",
  ai: "Diskret klassificering och prioritering bakom gränssnittet.",
};
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function loadIntegrations() {
      try {
        const response = await fetch("/api/integrations", { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!isMounted) return;
        if (!response.ok) { setError(data.error || "Kunde inte hämta integrationer"); return; }
        setIntegrations(data.integrations || []);
        setEvents(data.events || []);
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
      <PageHeader eyebrow="System och anslutningar" title="Integrationer" description="Samlad status för externa tjänster, tekniska krav och senaste integrationshändelser." action={<div className="inline-flex items-center gap-2 rounded-xl border border-petroleum-100 bg-petroleum-50 px-4 py-3 text-sm font-semibold text-petroleum-800"><ShieldCheck className="h-5 w-5" />Säkert mockläge vid saknade nycklar</div>} />

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Plug} label="Integrationer" value={integrations.length} />
        <MetricCard icon={CheckCircle2} label="Konfigurerade" value={summary.configured} />
        <MetricCard icon={CircleDashed} label="Väntar på konfiguration" value={summary.pending} />
        <MetricCard icon={Send} label="Lyckade händelser" value={summary.successfulEvents} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {integrations.map((integration) => (
          <article key={integration.type} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">{labels[integration.type] || integration.type}</p>
            <div className={`mt-4 w-fit rounded-full px-3 py-1 text-xs font-semibold ${integration.configured ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>{integration.configured ? "Konfigurerad" : "Mockläge"}</div>
            <p className="mt-4 text-sm leading-6 text-ink-500">{descriptions[integration.type] || "Extern systemanslutning."}</p>
            <div className="mt-5 rounded-xl bg-sand-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Miljövariabler</p><p className="mt-1 break-words text-xs leading-5 text-ink-600">{integration.requiredEnv.length ? integration.requiredEnv.join(", ") : "Inga externa nycklar krävs"}</p></div>
          </article>
        ))}
      </section>

      <Panel title="Senaste integrationshändelser" description="Teknisk historik för utskick, betalningar och externa anrop." bodyClassName="p-0">
        {loading ? <div className="space-y-4 p-6">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-sand-100" />)}</div> : events.length > 0 ? <div className="divide-y divide-sand-100">{events.map((event) => <article key={event.id} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-ink-950">{labels[event.type] || event.type}</h3><p className="mt-1 text-sm text-ink-500">{event.recipient || "Ingen mottagare"} · {dateFormatter.format(new Date(event.created_at))}</p></div><span className="w-fit rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">{event.status}</span></article>)}</div> : <EmptyState title="Inga integrationshändelser ännu" description="När Revalta skickar eller tar emot data via en integration visas händelsen här." />}
      </Panel>
    </div>
  );
}
