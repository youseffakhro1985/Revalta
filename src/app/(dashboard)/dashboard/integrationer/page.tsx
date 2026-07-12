"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Integration = {
  type: string;
  configured: boolean;
  requiredEnv: string[];
};

type IntegrationEvent = {
  id: string;
  type: string;
  status: string;
  recipient: string | null;
  created_at: string;
};

const labels: Record<string, string> = {
  email: "E-post",
  sms: "SMS",
  stripe: "Stripe/betalning",
  storage: "Filuppladdning",
  ai: "AI-klassificering",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const data = await response.json();
        if (!isMounted) return;
        if (!response.ok) {
          setError(data.error || "Kunde inte hämta integrationer");
          return;
        }
        setIntegrations(data.integrations || []);
        setEvents(data.events || []);
      } catch {
        if (isMounted) setError("Kunde inte kontakta servern");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadIntegrations();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <header className="overflow-hidden rounded-2xl border border-sand-200 bg-white text-ink-950 shadow-card-lg">
        <div className="p-8 sm:p-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-700">Integrationer</p>
          <h1 className="text-4xl font-semibold tracking-tight">Extern drift redo</h1>
          <p className="mt-3 max-w-2xl text-ink-500">
            E-post, SMS, betalning, filstorage och AI körs som säkra dev-mockar tills rätt leverantörsnycklar är satta.
          </p>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-danger-500 bg-danger-50 p-4 text-sm font-medium text-danger-600">{error}</div>}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {integrations.map((integration) => (
          <article key={integration.type} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-400">{labels[integration.type] || integration.type}</p>
            <div className={`mt-4 w-fit rounded-full px-3 py-1 text-xs font-bold ${integration.configured ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
              {integration.configured ? "Konfigurerad" : "Mockläge"}
            </div>
            <p className="mt-4 text-xs leading-5 text-ink-500">
              Kräver: {integration.requiredEnv.join(", ")}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-card">
        <div className="border-b border-sand-100 bg-sand-50/70 p-6">
          <h2 className="text-lg font-bold text-ink-950">Senaste integrationshändelser</h2>
        </div>
        {loading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-sand-100" />)}
          </div>
        ) : events.length > 0 ? (
          <div className="divide-y divide-sand-100">
            {events.map((event) => (
              <article key={event.id} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-bold text-ink-950">{labels[event.type] || event.type}</h3>
                  <p className="mt-1 text-sm text-ink-500">{event.recipient || "Ingen mottagare"} · {dateFormatter.format(new Date(event.created_at))}</p>
                </div>
                <span className="w-fit rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-bold text-ink-600">{event.status}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-sm text-ink-500">Inga integrationshändelser ännu.</div>
        )}
      </section>
    </div>
  );
}
