"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";

type AlertItem = {
  id: string;
  status: "open" | "resolved";
  severity: "critical" | "warning";
  createdAt: string;
  sourceEventId: string;
  sentCount: number;
  failedCount: number;
  acknowledged: boolean;
  title: string;
  description: string;
  source?: "table" | "legacy";
};

type AlertData = {
  alerts: AlertItem[];
  recoveries: Array<{ id: string; createdAt: string }>;
  summary: { total: number; open: number; unacknowledged: number; critical: number; resolved: number };
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function ServiceNotificationAlertCenter() {
  const [data, setData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/alerts", { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta driftlarmen");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta driftlarmen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function acknowledge(alertId: string) {
    setPending((current) => new Set([...current, alertId]));
    setError("");
    setData((current) => current ? {
      ...current,
      alerts: current.alerts.map((item) => item.id === alertId ? { ...item, acknowledged: true } : item),
      summary: { ...current.summary, unacknowledged: Math.max(0, current.summary.unacknowledged - 1) },
    } : current);
    try {
      const response = await fetch("/api/settings/service-notifications/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
      const body = await readResponseJson(response).catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Driftlarmet kunde inte kvitteras");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Driftlarmet kunde inte kvitteras");
      await load();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(alertId);
        return next;
      });
    }
  }

  if (loading && !data) {
    return <div className="h-36 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" aria-label="Laddar driftlarm" />;
  }

  const openAlerts = data?.alerts.filter((item) => item.status === "open") || [];
  const recentResolved = data?.alerts.filter((item) => item.status === "resolved").slice(0, 3) || [];

  if (!error && openAlerts.length === 0 && recentResolved.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="service-alert-center-title">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${data?.summary.critical ? "bg-red-100 text-red-800" : data?.summary.open ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
            {data?.summary.open ? <ShieldAlert className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Operativ uppföljning</p>
            <h2 id="service-alert-center-title" className="mt-1 font-semibold text-ink-950">Driftlarm för serviceaviseringar</h2>
            <p className="mt-1 text-sm text-ink-600">Kvittera leveransproblem och följ när systemet automatiskt har återhämtat sig.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Uppdatera
        </button>
      </div>

      {error ? <div role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

      <div className="grid gap-3 border-b border-sand-100 px-5 py-4 sm:grid-cols-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Öppna</p><p className="mt-1 text-xl font-semibold text-ink-950">{data?.summary.open || 0}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Ej kvitterade</p><p className="mt-1 text-xl font-semibold text-ink-950">{data?.summary.unacknowledged || 0}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Kritiska</p><p className="mt-1 text-xl font-semibold text-red-800">{data?.summary.critical || 0}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Lösta</p><p className="mt-1 text-xl font-semibold text-emerald-800">{data?.summary.resolved || 0}</p></div>
      </div>

      <div className="divide-y divide-sand-100">
        {openAlerts.map((item) => (
          <article key={item.id} className={`grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${item.severity === "critical" ? "bg-red-50/35" : "bg-amber-50/35"}`}>
            <div className="flex min-w-0 items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}><AlertTriangle className="h-4 w-4" aria-hidden="true" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-950">{item.title}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.severity === "critical" ? "Kritisk" : "Varning"}</span>{item.acknowledged ? <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">Kvitterad</span> : null}</div>
                <p className="mt-1 text-sm leading-6 text-ink-600">{item.description}</p>
                <p className="mt-2 text-xs text-ink-400">Upptäckt {dateTime.format(new Date(item.createdAt))}</p>
                {item.source === "legacy" ? (
                  <p className="mt-2 text-xs font-medium text-amber-800">Äldre larm – kör backfill innan det kan kvitteras.</p>
                ) : null}
              </div>
            </div>
            {item.source === "legacy" ? null : (
              <button type="button" onClick={() => void acknowledge(item.id)} disabled={item.acknowledged || pending.has(item.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:cursor-not-allowed disabled:opacity-45"><Check className="h-4 w-4" aria-hidden="true" />{pending.has(item.id) ? "Kvitterar…" : item.acknowledged ? "Kvitterad" : "Kvittera larm"}</button>
            )}
          </article>
        ))}

        {recentResolved.map((item) => (
          <article key={item.id} className="flex items-start gap-3 px-5 py-4">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></div>
            <div><h3 className="font-semibold text-ink-900">Leveransproblemet är löst</h3><p className="mt-1 text-sm text-ink-500">Systemet registrerade en senare lyckad körning och stängde driftlarmet automatiskt.</p><p className="mt-2 text-xs text-ink-400">Larm skapat {dateTime.format(new Date(item.createdAt))}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
