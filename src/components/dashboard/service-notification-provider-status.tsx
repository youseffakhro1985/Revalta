"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleOff, RefreshCw, Route, ShieldAlert } from "lucide-react";

type Provider = {
  provider: "resend" | "postmark";
  priority: number;
  configured: boolean;
  role: "primary" | "fallback";
  sent: number;
  failed: number;
  lastUsedAt: string | null;
  lastStatus: string | null;
};

type Data = {
  fromConfigured: boolean;
  failoverEnabled: boolean;
  providers: Provider[];
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function ServiceNotificationProviderStatus() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/providers", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta providerstatus");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta providerstatus");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !data) return <div className="h-52 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" />;
  if (!data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{error || "Providerstatus saknas"}</div>;

  const healthy = data.fromConfigured && data.providers.some((item) => item.configured);

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${healthy ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
            {healthy ? <Route className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Leveransinfrastruktur</p>
            <h2 className="mt-1 font-semibold text-ink-950">E-postleverantörer och failover</h2>
            <p className="mt-1 text-sm text-ink-600">Aktiv ordning, reservkapacitet och senaste faktiska leveransutfall.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
        </button>
      </div>

      {error ? <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">{error}</div> : null}

      <div className="grid gap-px bg-sand-100 sm:grid-cols-3">
        <Status label="Avsändaradress" value={data.fromConfigured ? "Konfigurerad" : "Saknas"} good={data.fromConfigured} />
        <Status label="Failover" value={data.failoverEnabled ? "Aktiv" : "Enkel provider"} good={data.failoverEnabled} />
        <Status label="Driftstatus" value={healthy ? "Redo för leverans" : "Åtgärd krävs"} good={healthy} />
      </div>

      <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
        {data.providers.map((provider) => (
          <article key={provider.provider} className="rounded-xl border border-sand-200 bg-sand-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${provider.configured ? "bg-emerald-100 text-emerald-800" : "bg-sand-200 text-ink-500"}`}>
                  {provider.configured ? <CheckCircle2 className="h-5 w-5" /> : <CircleOff className="h-5 w-5" />}
                </div>
                <div><h3 className="font-semibold text-ink-950">{provider.provider === "resend" ? "Resend" : "Postmark"}</h3><p className="text-xs text-ink-500">Prioritet {provider.priority} · {provider.role === "primary" ? "Primär" : "Reserv"}</p></div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${provider.configured ? "bg-emerald-100 text-emerald-800" : "bg-sand-200 text-ink-600"}`}>{provider.configured ? "Konfigurerad" : "Ej konfigurerad"}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Metric label="Levererade" value={provider.sent} /><Metric label="Misslyckade" value={provider.failed} danger={provider.failed > 0} /></div>
            <p className="mt-3 text-xs text-ink-500">{provider.lastUsedAt ? `Senast använd ${dateTime.format(new Date(provider.lastUsedAt))}` : "Ingen registrerad användning ännu."}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Status({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p><p className={`mt-1 text-lg font-semibold ${good ? "text-emerald-800" : "text-amber-800"}`}>{value}</p></div>;
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="rounded-lg bg-white px-3 py-2"><p className="text-xs text-ink-500">{label}</p><p className={`mt-1 font-semibold ${danger ? "text-red-800" : "text-ink-950"}`}>{value}</p></div>;
}
