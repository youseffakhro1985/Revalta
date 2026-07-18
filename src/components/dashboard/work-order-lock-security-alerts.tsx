"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCheck, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";

type SecurityNotification = {
  key: string;
  title: string;
  description: string;
  dueAt: string;
  read: boolean;
  href: string;
};

type ResponseData = {
  notifications: SecurityNotification[];
  summary: { total: number; unread: number; high: number };
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function WorkOrderLockSecurityAlerts() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications/work-order-locks", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta säkerhetsaviseringar");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta säkerhetsaviseringar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markRead(key?: string) {
    const response = await fetch("/api/notifications/work-order-locks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(key ? { key } : { all: true }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Aviseringen kunde inte markeras som läst");
      return;
    }
    await load();
  }

  if (!loading && !error && !data?.notifications.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-premium-sm">
      <div className="flex flex-col gap-4 border-b border-red-100 bg-red-50/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800"><ShieldAlert className="h-5 w-5" /></div>
          <div><h2 className="font-semibold text-ink-950">Säkerhetsaviseringar för redigeringslås</h2><p className="mt-1 text-sm text-ink-600">Visar när en administratör har frigjort ett arbetsorderlås som tillhörde dig.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Uppdatera</button>
          <button type="button" onClick={() => void markRead()} disabled={!data?.summary.unread} className="inline-flex items-center gap-2 rounded-xl bg-red-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCheck className="h-4 w-4" />Markera alla lästa</button>
        </div>
      </div>

      {error ? <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">{error}</div> : null}
      {loading && !data ? <div className="h-28 animate-pulse bg-sand-50" /> : null}
      <div className="divide-y divide-sand-100">
        {data?.notifications.map((item) => (
          <article key={item.key} className={`grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${item.read ? "bg-white" : "bg-red-50/30"}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-950">{item.title}</h3>{!item.read ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Ny</span> : null}</div>
              <p className="mt-1 text-sm leading-6 text-ink-600">{item.description}</p>
              <time className="mt-2 block text-xs font-semibold uppercase tracking-wide text-ink-400">{dateTime.format(new Date(item.dueAt))}</time>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button type="button" onClick={() => void markRead(item.key)} disabled={item.read} className="rounded-xl border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 disabled:opacity-40">Markera läst</button>
              <Link href={item.href} onClick={() => void markRead(item.key)} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-3 py-2 text-sm font-semibold text-white"><ExternalLink className="h-4 w-4" />Öppna arbetsorder</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
