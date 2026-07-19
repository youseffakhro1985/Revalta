"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ServerCog } from "lucide-react";

type DeliverySummary = { total: number; sent: number; failed: number };
type Run = { id: string; status: string; createdAt: string; deliverySummary: DeliverySummary };
type HealthData = {
  health: "healthy" | "degraded" | "critical" | "idle";
  generatedAt: string;
  configurationReady: boolean;
  latestRun: Run | null;
  latestSuccessfulRun: Omit<Run, "status"> | null;
  consecutiveFailures: number;
  staleProcessing: Array<{ id: string; createdAt: string; ageMinutes: number }>;
  history: {
    runs: number;
    deliveries: number;
    sent: number;
    failed: number;
    statuses: Record<string, number>;
  };
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

const healthPresentation = {
  healthy: {
    label: "Stabil drift",
    description: "Serviceaviseringarna körs utan identifierade leveransproblem.",
    className: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    iconClassName: "bg-emerald-100 text-emerald-800",
    Icon: CheckCircle2,
  },
  degraded: {
    label: "Nedsatt drift",
    description: "Minst en nylig körning har partiella leveranser eller ett felutfall.",
    className: "border-amber-200 bg-amber-50/70 text-amber-950",
    iconClassName: "bg-amber-100 text-amber-800",
    Icon: AlertTriangle,
  },
  critical: {
    label: "Kräver åtgärd",
    description: "Konfiguration saknas, flera körningar har misslyckats eller en körning har fastnat.",
    className: "border-red-200 bg-red-50/70 text-red-950",
    iconClassName: "bg-red-100 text-red-800",
    Icon: AlertTriangle,
  },
  idle: {
    label: "Ingen körhistorik",
    description: "Systemet är konfigurerat men någon serviceavisering har ännu inte körts.",
    className: "border-sand-200 bg-sand-50 text-ink-900",
    iconClassName: "bg-white text-petroleum-800",
    Icon: Clock3,
  },
} as const;

function percentage(sent: number, total: number) {
  if (!total) return "–";
  return `${Math.round((sent / total) * 100)} %`;
}

export function ServiceNotificationHealthCard() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/health", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta leveranshälsan");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta leveranshälsan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const presentation = useMemo(() => healthPresentation[data?.health || "idle"], [data?.health]);
  const Icon = presentation.Icon;

  if (loading && !data) {
    return <div className="h-44 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" aria-label="Laddar driftstatus" />;
  }

  if (error && !data) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5" role="alert">
        <div className="flex items-start justify-between gap-4">
          <div><p className="font-semibold text-red-900">Driftstatus kunde inte hämtas</p><p className="mt-1 text-sm text-red-700">{error}</p></div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800"><RefreshCw className="h-4 w-4" />Försök igen</button>
        </div>
      </section>
    );
  }

  return (
    <section className={`rounded-2xl border p-5 shadow-premium-sm ${presentation.className}`} aria-labelledby="service-health-title">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${presentation.iconClassName}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">Leveranshälsa</p>
            <h2 id="service-health-title" className="mt-1 text-lg font-semibold">{presentation.label}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 opacity-80">{presentation.description}</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-current/20 bg-white/70 px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Uppdatera</button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-current/10 bg-white/70 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-65"><ServerCog className="h-4 w-4" />Konfiguration</div><p className="mt-2 text-lg font-semibold">{data?.configurationReady ? "Klar" : "Ofullständig"}</p></div>
        <div className="rounded-xl border border-current/10 bg-white/70 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-65"><Activity className="h-4 w-4" />Senaste körning</div><p className="mt-2 text-lg font-semibold">{data?.latestRun?.status || "Ingen"}</p><p className="mt-1 text-xs opacity-65">{data?.latestRun ? dateTime.format(new Date(data.latestRun.createdAt)) : "Ingen historik"}</p></div>
        <div className="rounded-xl border border-current/10 bg-white/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide opacity-65">Leveransgrad</p><p className="mt-2 text-lg font-semibold">{percentage(data?.history.sent || 0, data?.history.deliveries || 0)}</p><p className="mt-1 text-xs opacity-65">{data?.history.sent || 0} av {data?.history.deliveries || 0}</p></div>
        <div className="rounded-xl border border-current/10 bg-white/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide opacity-65">Sammanhängande fel</p><p className="mt-2 text-lg font-semibold">{data?.consecutiveFailures || 0}</p><p className="mt-1 text-xs opacity-65">Partiella eller misslyckade körningar</p></div>
        <div className="rounded-xl border border-current/10 bg-white/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide opacity-65">Fastnade körningar</p><p className="mt-2 text-lg font-semibold">{data?.staleProcessing.length || 0}</p><p className="mt-1 text-xs opacity-65">Bearbetning över 15 minuter</p></div>
      </div>

      {(data?.staleProcessing.length || data?.consecutiveFailures) ? (
        <div className="mt-4 rounded-xl border border-current/10 bg-white/70 px-4 py-3 text-sm font-medium">
          {data.staleProcessing.length ? `Äldsta fastnade körningen har bearbetats i ${Math.max(...data.staleProcessing.map((item) => item.ageMinutes))} minuter.` : `De ${data.consecutiveFailures} senaste körningarna behöver följas upp.`}
        </div>
      ) : null}

      <p className="mt-4 text-xs opacity-60">Senast kontrollerad {data?.generatedAt ? dateTime.format(new Date(data.generatedAt)) : "–"}. Uppdateras automatiskt varje minut.</p>
    </section>
  );
}
