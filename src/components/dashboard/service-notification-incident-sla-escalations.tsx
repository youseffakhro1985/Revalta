"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Siren } from "lucide-react";

type EscalationItem = {
  id: string;
  status: "open" | "resolved";
  breachType: "acknowledgement" | "resolution";
  severity: "warning" | "critical";
  openMinutes: number;
  thresholdMinutes: number;
  openedAt: string;
  resolvedAt: string | null;
  title: string;
  description: string;
};

type EscalationData = {
  escalations: EscalationItem[];
  summary: {
    total: number;
    open: number;
    critical: number;
    acknowledgement: number;
    resolution: number;
    resolved: number;
    oldestOpenMinutes: number;
  };
};

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function ServiceNotificationIncidentSlaEscalations() {
  const [data, setData] = useState<EscalationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/incident-sla-escalations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta SLA-eskaleringarna");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta SLA-eskaleringarna");
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
  if (!data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{error || "SLA-eskaleringar saknas"}</div>;

  const open = data.escalations.filter((item) => item.status === "open");
  const resolved = data.escalations.filter((item) => item.status === "resolved").slice(0, 3);
  const healthy = data.summary.open === 0;

  if (!error && healthy && resolved.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="incident-sla-escalations-title">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${data.summary.critical ? "bg-red-100 text-red-800" : healthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {healthy ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Siren className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Automatisk eskalering</p>
            <h2 id="incident-sla-escalations-title" className="mt-1 font-semibold text-ink-950">Incident-SLA-eskaleringar</h2>
            <p className="mt-1 text-sm text-ink-600">Följ vilka incidenter som kräver omedelbar operativ åtgärd.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Uppdatera
        </button>
      </div>

      {error ? <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">{error}</div> : null}

      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Öppna" value={data.summary.open} danger={data.summary.open > 0} />
        <Metric label="Kritiska" value={data.summary.critical} danger={data.summary.critical > 0} />
        <Metric label="Kvittering" value={data.summary.acknowledgement} danger={data.summary.acknowledgement > 0} />
        <Metric label="Återställning" value={data.summary.resolution} danger={data.summary.resolution > 0} />
        <Metric label="Äldsta" value={durationLabel(data.summary.oldestOpenMinutes)} danger={data.summary.oldestOpenMinutes > 0} />
      </div>

      <div className="divide-y divide-sand-100">
        {open.map((item) => (
          <article key={item.id} className={`px-5 py-5 ${item.severity === "critical" ? "bg-red-50/40" : "bg-amber-50/40"}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                {item.breachType === "resolution" ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink-950">{item.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.severity === "critical" ? "Kritisk" : "Varning"}</span>
                  <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{item.breachType === "resolution" ? "Återställning" : "Kvittering"}</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-ink-600">{item.description}</p>
                <p className="mt-2 text-xs text-ink-400">Eskalerad {dateTime.format(new Date(item.openedAt))}</p>
              </div>
            </div>
          </article>
        ))}

        {resolved.map((item) => (
          <article key={item.id} className="flex items-start gap-3 px-5 py-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></div>
            <div>
              <h3 className="font-semibold text-ink-900">SLA-eskaleringen är löst</h3>
              <p className="mt-1 text-sm text-ink-500">{item.breachType === "resolution" ? "Grundincidenten återställdes och eskaleringen stängdes automatiskt." : "Incidenten kvitterades och eskaleringen stängdes automatiskt."}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${danger ? "text-red-800" : "text-ink-950"}`}>{value}</p></div>;
}
