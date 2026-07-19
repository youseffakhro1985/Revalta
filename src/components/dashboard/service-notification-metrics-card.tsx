"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Gauge, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";

type MetricsData = {
  periodDays: number;
  generatedAt: string;
  slo: {
    target: number;
    warningThreshold: number;
    criticalThreshold: number;
    status: "no_data" | "healthy" | "warning" | "critical";
    budgetConsumedPercent: number;
    budgetRemainingPercent: number;
    recommendation: string;
  };
  summary: {
    runs: number;
    deliveries: number;
    sent: number;
    failed: number;
    successRate: number;
    retryRate: number;
    averageAttempts: number;
    retryRecovered: number;
    retryExhausted: number;
    permanentFailures: number;
  };
  trend: Array<{ date: string; sent: number; failed: number; retried: number }>;
  recentRuns: Array<{
    id: string;
    createdAt: string;
    status: string;
    total: number;
    sent: number;
    failed: number;
  }>;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function statusLabel(status: string) {
  if (status === "sent") return "Levererad";
  if (status === "partial") return "Delvis levererad";
  return "Misslyckad";
}

function sloLabel(status: MetricsData["slo"]["status"]) {
  if (status === "healthy") return "Målet uppfylls";
  if (status === "warning") return "Varningsnivå";
  if (status === "critical") return "Kritisk nivå";
  return "Inväntar data";
}

function sloTone(status: MetricsData["slo"]["status"]) {
  if (status === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  if (status === "critical") return "border-red-200 bg-red-50 text-red-950";
  return "border-sand-200 bg-sand-50 text-ink-800";
}

export function ServiceNotificationMetricsCard() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/metrics", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta leveransmåtten");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta leveransmåtten");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const maxDaily = useMemo(() => {
    if (!data?.trend.length) return 1;
    return Math.max(1, ...data.trend.map((item) => item.sent + item.failed));
  }, [data]);

  if (loading && !data) {
    return <div className="h-72 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" aria-label="Laddar leveransmått" />;
  }

  if (!data && error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900" role="alert">
        <p className="font-semibold">Leveransmåtten kunde inte hämtas</p>
        <p className="mt-1">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 font-semibold">Försök igen</button>
      </section>
    );
  }

  const summary = data?.summary;
  const slo = data?.slo;
  const healthy = slo?.status === "healthy" || slo?.status === "no_data";

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="service-metrics-title">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${healthy ? "bg-emerald-100 text-emerald-800" : slo?.status === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
            {healthy ? <ShieldCheck className="h-5 w-5" aria-hidden="true" /> : <Activity className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Leveransstabilitet · 30 dagar</p>
            <h2 id="service-metrics-title" className="mt-1 font-semibold text-ink-950">Operativa mått för serviceaviseringar</h2>
            <p className="mt-1 text-sm text-ink-600">Följ faktisk leveransgrad, SLO, felbudget och automatiska återförsök.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Uppdatera
        </button>
      </div>

      {error ? <div role="alert" className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">{error}</div> : null}

      {slo ? (
        <div className={`m-5 rounded-xl border px-4 py-4 ${sloTone(slo.status)}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <Gauge className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">SLO {slo.target}% · {sloLabel(slo.status)}</p>
                <p className="mt-1 text-sm opacity-80">{slo.recommendation}</p>
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Felbudget förbrukad</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{slo.budgetConsumedPercent}%</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Leveransgrad</p><p className="mt-1 text-2xl font-semibold text-ink-950">{summary?.successRate ?? 100}%</p><p className="mt-1 text-xs text-ink-500">{summary?.sent || 0} av {summary?.deliveries || 0}</p></div>
        <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Återhämtade retry</p><p className="mt-1 text-2xl font-semibold text-emerald-800">{summary?.retryRecovered || 0}</p><p className="mt-1 text-xs text-ink-500">{summary?.retryRate || 0}% av leveranserna</p></div>
        <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Snittförsök</p><p className="mt-1 text-2xl font-semibold text-ink-950">{summary?.averageAttempts || 0}</p><p className="mt-1 text-xs text-ink-500">per mottagare</p></div>
        <div className="bg-white px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Kvarstående fel</p><p className={`mt-1 text-2xl font-semibold ${(summary?.failed || 0) > 0 ? "text-red-800" : "text-emerald-800"}`}>{summary?.failed || 0}</p><p className="mt-1 text-xs text-ink-500">{summary?.retryExhausted || 0} tillfälliga · {summary?.permanentFailures || 0} permanenta</p></div>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-ink-950">Dagligt leveransutfall</h3><span className="text-xs text-ink-500">Senaste 14 aktiva dagar</span></div>
          {data?.trend.length ? (
            <div className="mt-4 space-y-3">
              {data.trend.map((item) => {
                const total = item.sent + item.failed;
                return (
                  <div key={item.date} className="grid grid-cols-[82px_1fr_auto] items-center gap-3 text-xs">
                    <span className="font-medium text-ink-600">{item.date}</span>
                    <div className="flex h-3 overflow-hidden rounded-full bg-sand-100" aria-label={`${item.sent} lyckade och ${item.failed} misslyckade leveranser`}>
                      <div className="bg-emerald-600" style={{ width: `${(item.sent / maxDaily) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(item.failed / maxDaily) * 100}%` }} />
                    </div>
                    <span className="tabular-nums text-ink-500">{total}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-4 rounded-xl border border-dashed border-sand-200 bg-sand-50 px-4 py-6 text-sm text-ink-500">Ingen leveranshistorik finns ännu.</p>}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink-950">Senaste körningar</h3>
          <div className="mt-3 divide-y divide-sand-100 rounded-xl border border-sand-200">
            {data?.recentRuns.length ? data.recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">{statusLabel(run.status)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{dateTime.format(new Date(run.createdAt))}</p>
                </div>
                <div className="flex items-center gap-2 text-xs tabular-nums">
                  {run.failed > 0 ? <TriangleAlert className="h-4 w-4 text-red-700" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />}
                  <span className="text-ink-600">{run.sent}/{run.total}</span>
                </div>
              </div>
            )) : <p className="px-4 py-5 text-sm text-ink-500">Inga körningar registrerade.</p>}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-500"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry återhämtar tillfälliga fel automatiskt innan larm skapas.</div>
        </div>
      </div>
    </section>
  );
}
