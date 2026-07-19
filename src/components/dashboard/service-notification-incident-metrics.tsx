"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, ShieldCheck, TimerReset } from "lucide-react";

type IncidentData = {
  summary: {
    open: number;
    unacknowledged: number;
    critical: number;
    resolved: number;
    mttaMinutes: number | null;
    mttrMinutes: number | null;
    oldestOpenMinutes: number;
    acknowledgedIncidents: number;
    resolvedIncidents: number;
  };
};

function durationLabel(minutes: number | null) {
  if (minutes === null) return "Saknas";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

export function ServiceNotificationIncidentMetrics() {
  const [data, setData] = useState<IncidentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/alerts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta incidentmåtten");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta incidentmåtten");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !data) return <div className="h-44 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" />;
  if (!data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{error || "Incidentmått saknas"}</div>;

  const summary = data.summary;
  const healthy = summary.open === 0 && summary.critical === 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="incident-metrics-title">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${healthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {healthy ? <ShieldCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Incidentrespons</p>
            <h2 id="incident-metrics-title" className="mt-1 font-semibold text-ink-950">MTTA, MTTR och öppettider</h2>
            <p className="mt-1 text-sm text-ink-600">Följ hur snabbt driftlarm kvitteras och återställs.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
        </button>
      </div>

      {error ? <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">{error}</div> : null}

      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="MTTA" value={durationLabel(summary.mttaMinutes)} hint={`${summary.acknowledgedIncidents} kvitterade incidenter`} />
        <Metric label="MTTR" value={durationLabel(summary.mttrMinutes)} hint={`${summary.resolvedIncidents} återställda incidenter`} />
        <Metric label="Äldsta öppna" value={durationLabel(summary.oldestOpenMinutes)} danger={summary.oldestOpenMinutes >= 1440} />
        <Metric label="Aktiva incidenter" value={String(summary.open)} hint={`${summary.unacknowledged} ej kvitterade · ${summary.critical} kritiska`} danger={summary.critical > 0} />
      </div>

      <div className="flex items-start gap-3 border-t border-sand-100 px-5 py-4 text-sm text-ink-600">
        <TimerReset className="mt-0.5 h-4 w-4 shrink-0 text-petroleum-700" />
        <p>MTTA mäter tiden till första kvittering. MTTR mäter tiden från upptäckt tills systemet registrerar full återställning.</p>
      </div>
    </section>
  );
}

function Metric({ label, value, hint, danger = false }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${danger ? "text-red-800" : "text-ink-950"}`}>{value}</p>{hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}</div>;
}
