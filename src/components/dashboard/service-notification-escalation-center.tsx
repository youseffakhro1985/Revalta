"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, Check, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

type Item = {
  id: string;
  deadLetterId: string;
  sourceEventId: string;
  email: string;
  mode: "all" | "overdue_only";
  autoRetryCount: number;
  reason: string;
  error: string;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
  severity: "critical" | "warning";
  title: string;
};

type Data = {
  items: Item[];
  summary: { total: number; open: number; acknowledged: number; resolved: number; critical: number };
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function ServiceNotificationEscalationCenter() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/escalations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta eskaleringarna");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta eskaleringarna");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function act(id: string, action: "acknowledge" | "resolve") {
    setPending((current) => new Set([...current, id]));
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Eskaleringen kunde inte uppdateras");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Eskaleringen kunde inte uppdateras");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  if (loading && !data) {
    return <div className="h-40 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" aria-label="Laddar eskaleringscenter" />;
  }

  const active = data?.items.filter((item) => item.status !== "resolved") || [];
  if (!error && active.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="service-escalation-title">
      <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${data?.summary.critical ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
            <AlertOctagon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Kräver mänsklig åtgärd</p>
            <h2 id="service-escalation-title" className="mt-1 font-semibold text-ink-950">Eskaleringscenter</h2>
            <p className="mt-1 text-sm text-ink-600">Prioritera permanenta leveransfel och ärenden där systemets automatiska återställning är uttömd.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Uppdatera
        </button>
      </div>

      {error ? <div role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

      <div className="grid gap-3 border-b border-sand-100 px-5 py-4 sm:grid-cols-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Öppna</p><p className="mt-1 text-xl font-semibold text-ink-950">{data?.summary.open || 0}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Kritiska</p><p className="mt-1 text-xl font-semibold text-red-800">{data?.summary.critical || 0}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Kvitterade</p><p className="mt-1 text-xl font-semibold text-amber-800">{data?.summary.acknowledged || 0}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Lösta</p><p className="mt-1 text-xl font-semibold text-emerald-800">{data?.summary.resolved || 0}</p></div>
      </div>

      <div className="divide-y divide-sand-100">
        {active.map((item) => {
          const busy = pending.has(item.id);
          return (
            <article key={item.id} className="px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-950">{item.title}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.severity === "critical" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                      {item.severity === "critical" ? "Kritisk" : "Varning"}
                    </span>
                    {item.status === "acknowledged" ? <span className="rounded-full bg-petroleum-50 px-2 py-1 text-xs font-semibold text-petroleum-800">Kvitterad</span> : null}
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink-700">{item.email || "Mottagare saknas"}</p>
                  <p className="mt-1 break-words text-sm text-ink-600">{item.error || "Leveransfelet saknar teknisk feltext."}</p>
                  <p className="mt-2 text-xs text-ink-400">Skapad {dateTime.format(new Date(item.createdAt))} · {item.autoRetryCount} automatiska köförsök</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.status === "open" ? (
                    <button type="button" onClick={() => void act(item.id, "acknowledge")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50">
                      <Check className="h-4 w-4" aria-hidden="true" /> Kvittera
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void act(item.id, "resolve")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />} Markera löst
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!active.length ? <div className="flex items-center gap-2 px-5 py-5 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Inga aktiva eskaleringar.</div> : null}
      </div>
    </section>
  );
}
