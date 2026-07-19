"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, ShieldCheck, TimerReset, TriangleAlert } from "lucide-react";

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
    acknowledgementSlaMinutes: number;
    resolutionSlaMinutes: number;
    acknowledgementBreaches: number;
    resolutionBreaches: number;
    criticalSlaBreaches: number;
    slaStatus: "healthy" | "warning" | "critical";
    slaRecommendation: string;
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

function slaLabel(status: IncidentData["summary"]["slaStatus"]) {
  if (status === "critical") return "Kritisk överträdelse";
  if (status === "warning") return "SLA-risk";
  return "Inom SLA";
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

  if (loading && !data) return <div className="h-56 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" />;
  if (!data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{error || "Incidentmått saknas"}</div>;

  const summary = data.summary;
  const healthy = summary.slaStatus === "healthy";
  const critical = summary.slaStatus === "critical";

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="incident-metrics-title">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${critical ? "bg-red-100 text-red-800" : healthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {critical ? <TriangleAlert className="h-5 w-5" /> : healthy ? <ShieldCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Incidentrespons</p>
            <h2 id="incident-metrics-title" className="mt-1 font-semibold text-ink-950">MTTA, MTTR och incident-SLA</h2>
            <p className="mt-1 text-sm text-ink-600">Följ hur snabbt driftlarm kvitteras, återställs och hålls inom fastställda mål.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
        </button>
      </div>

      {error ? <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">{error}</div> : null}

      <div className={`border-b px-5 py-4 ${critical ? "border-red-100 bg-red-50" : healthy ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={`text-sm font-semibold ${critical ? "text-red-900" : healthy ? "text-emerald-900" : "text-amber-900"}`}>{slaLabel(summary.slaStatus)}</p>
            <p className={`mt-1 text-sm ${critical ? "text-red-800" : healthy ? "text-emerald-800" : "text-amber-800"}`}>{summary.slaRecommendation}</p>
          </div>
          <div className="shrink-0 text-xs font-semibold text-ink-600">
            Kvittering ≤ {durationLabel(summary.acknowledgementSlaMinutes)} · Återställning ≤ {durationLabel(summary.resolutionSlaMinutes)}
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="MTTA" value={durationLabel(summary.mttaMinutes)} hint={`${summary.acknowledgedIncidents} kvitterade incidenter`} danger={summary.mttaMinutes !== null && summary.mttaMinutes > summary.acknowledgementSlaMinutes} />
        <Metric label="MTTR" value={durationLabel(summary.mttrMinutes)} hint={`${summary.resolvedIncidents} återställda incidenter`} danger={summary.mttrMinutes !== null && summary.mttrMinutes > summary.resolutionSlaMinutes} />
        <Metric label="Kvitteringsbrott" value={String(summary.acknowledgementBreaches)} hint={`Mål ${durationLabel(summary.acknowledgementSlaMinutes)}`} danger={summary.acknowledgementBreaches > 0} />
        <Metric label="Återställningsbrott" value={String(summary.resolutionBreaches)} hint={`${summary.criticalSlaBreaches} kritiska SLA-brott`} danger={summary.resolutionBreaches > 0} />
      </div>

      <div className="grid gap-px border-t border-sand-100 bg-sand-100 sm:grid-cols-2">
        <Metric label="Äldsta öppna" value={durationLabel(summary.oldestOpenMinutes)} danger={summary.oldestOpenMinutes > summary.resolutionSlaMinutes} />
        <Metric label="Aktiva incidenter" value={String(summary.open)} hint={`${summary.unacknowledged} ej kvitterade · ${summary.critical} kritiska`} danger={summary.critical > 0 || summary.criticalSlaBreaches > 0} />
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
