"use client";

import { readResponseJson } from "@/lib/fetch-json";
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
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications/work-order-locks", { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta säkerhetsaviseringar");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta säkerhetsaviseringar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const applyReadOptimistically = useCallback((keys?: string[]) => {
    setData((current) => {
      if (!current) return current;
      const selected = keys ? new Set(keys) : null;
      const notifications = current.notifications.map((item) =>
        !item.read && (!selected || selected.has(item.key)) ? { ...item, read: true } : item,
      );
      return {
        ...current,
        notifications,
        summary: { ...current.summary, unread: notifications.filter((item) => !item.read).length },
      };
    });
  }, []);

  async function markRead(key?: string, options?: { navigate?: boolean }) {
    const keys = key ? [key] : data?.notifications.filter((item) => !item.read).map((item) => item.key) || [];
    if (!keys.length) return;

    applyReadOptimistically(key ? [key] : undefined);
    setPendingKeys((current) => new Set([...current, ...keys]));

    try {
      const response = await fetch("/api/notifications/work-order-locks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key ? { key } : { all: true }),
        keepalive: options?.navigate === true,
      });
      if (!response.ok) {
        const body = await readResponseJson(response).catch(() => ({}));
        throw new Error(body.error || "Aviseringen kunde inte markeras som läst");
      }
      if (!options?.navigate) await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Aviseringen kunde inte markeras som läst");
      if (!options?.navigate) await load();
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        keys.forEach((item) => next.delete(item));
        return next;
      });
    }
  }

  if (!loading && !error && !data?.notifications.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-premium-sm" aria-labelledby="work-order-lock-alerts-title">
      <div className="flex flex-col gap-4 border-b border-red-100 bg-red-50/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></div>
          <div><h2 id="work-order-lock-alerts-title" className="font-semibold text-ink-950">Säkerhetsaviseringar för redigeringslås</h2><p className="mt-1 text-sm text-ink-600">Visar när en administratör har frigjort ett arbetsorderlås som tillhörde dig.</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Uppdatera</button>
          <button type="button" onClick={() => void markRead()} disabled={!data?.summary.unread || pendingKeys.size > 0} className="inline-flex items-center gap-2 rounded-xl bg-red-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCheck className="h-4 w-4" aria-hidden="true" />Markera alla lästa</button>
        </div>
      </div>

      {error ? <div role="alert" className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">{error}</div> : null}
      {loading && !data ? <div className="h-28 animate-pulse bg-sand-50" aria-label="Laddar säkerhetsaviseringar" /> : null}
      <div className="divide-y divide-sand-100">
        {data?.notifications.map((item) => (
          <article key={item.key} className={`grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${item.read ? "bg-white" : "bg-red-50/30"}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-950">{item.title}</h3>{!item.read ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Ny</span> : null}</div>
              <p className="mt-1 text-sm leading-6 text-ink-600">{item.description}</p>
              <time dateTime={item.dueAt} className="mt-2 block text-xs font-semibold uppercase tracking-wide text-ink-500">{dateTime.format(new Date(item.dueAt))}</time>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button type="button" onClick={() => void markRead(item.key)} disabled={item.read || pendingKeys.has(item.key)} className="rounded-xl border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 disabled:opacity-40">Markera läst</button>
              <Link href={item.href} onClick={() => { if (!item.read) void markRead(item.key, { navigate: true }); }} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-3 py-2 text-sm font-semibold text-white"><ExternalLink className="h-4 w-4" aria-hidden="true" />Öppna arbetsorder</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
