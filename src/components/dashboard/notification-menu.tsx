"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, Check, ChevronRight, ShieldAlert, TimerReset } from "lucide-react";

type Notification = {
  key: string;
  title: string;
  description: string;
  dueAt: string;
  overdue: boolean;
  high: boolean;
  read: boolean;
  href: string;
  kind?: "service" | "security" | "sla";
};

type ResponseData = {
  notifications: Notification[];
  summary: { total: number; unread: number; overdue?: number; high: number };
};

const dateFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [serviceResponse, securityResponse, slaResponse] = await Promise.all([
        fetch("/api/notifications/service-center?filter=unread", { cache: "no-store" }),
        fetch("/api/notifications/work-order-locks", { cache: "no-store" }),
        fetch("/api/notifications/work-order-sla?filter=unread", { cache: "no-store" }),
      ]);
      const service = serviceResponse.ok ? await serviceResponse.json() as ResponseData : null;
      const security = securityResponse.ok ? await securityResponse.json() as ResponseData : null;
      const sla = slaResponse.ok ? await slaResponse.json() as ResponseData : null;
      const securityUnread = (security?.notifications || []).filter((item) => !item.read).map((item) => ({ ...item, kind: "security" as const }));
      const serviceUnread = (service?.notifications || []).map((item) => ({ ...item, kind: "service" as const }));
      const slaUnread = (sla?.notifications || []).map((item) => ({ ...item, kind: "sla" as const }));
      const notifications = [...securityUnread, ...slaUnread, ...serviceUnread].sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.high !== b.high) return a.high ? -1 : 1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
      setData({
        notifications,
        summary: {
          total: (security?.summary.total || 0) + (service?.summary.total || 0) + (sla?.summary.total || 0),
          unread: securityUnread.length + (service?.summary.unread || 0) + (sla?.summary.unread || 0),
          overdue: (service?.summary.overdue || 0) + (sla?.summary.overdue || 0),
          high: (security?.summary.high || 0) + (service?.summary.high || 0) + (sla?.summary.high || 0),
        },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    void load();
    const close = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open, load]);

  async function markRead(item: Notification) {
    const endpoint = item.kind === "security" ? "/api/notifications/work-order-locks" : item.kind === "sla" ? "/api/notifications/work-order-sla" : "/api/notifications/service-center";
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: item.key, action: "read" }),
    });
    if (response.ok) setData((current) => current ? {
      notifications: current.notifications.filter((candidate) => candidate.key !== item.key),
      summary: { ...current.summary, unread: Math.max(0, current.summary.unread - 1) },
    } : current);
  }

  const unread = data?.summary.unread ?? 0;
  const preview = data?.notifications.slice(0, 6) ?? [];

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={`Aviseringar${unread ? `, ${unread} olästa` : ""}`} aria-expanded={open} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-600 transition hover:bg-sand-50 hover:text-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300">
        <BellRing className="h-5 w-5" />
        {unread > 0 ? <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-[#FAFAF8]">{unread > 99 ? "99+" : unread}</span> : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,410px)] overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-sand-100 px-5 py-4">
            <div><p className="font-semibold text-ink-950">Aviseringar</p><p className="mt-0.5 text-xs text-ink-500">{unread} olästa drift-, säkerhets- och SLA-varningar</p></div>
            <Link href="/dashboard/aviseringscenter" onClick={() => setOpen(false)} className="text-xs font-semibold text-petroleum-700 hover:text-petroleum-900">Visa alla</Link>
          </div>

          <div className="max-h-[460px] overflow-y-auto">
            {loading && !data ? <div className="h-32 animate-pulse bg-sand-50" /> : null}
            {!loading && preview.length === 0 ? <div className="px-6 py-10 text-center"><BellRing className="mx-auto h-8 w-8 text-sand-400" /><p className="mt-3 font-semibold text-ink-800">Inga olästa aviseringar</p><p className="mt-1 text-sm text-ink-500">Du är uppdaterad.</p></div> : null}
            <div className="divide-y divide-sand-100">
              {preview.map((item) => {
                const Icon = item.kind === "security" ? ShieldAlert : item.kind === "sla" ? TimerReset : AlertTriangle;
                return <div key={`${item.kind}-${item.key}`} className="p-4 hover:bg-sand-50/70">
                  <div className="flex gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.kind === "security" || item.overdue ? "bg-red-50 text-red-700" : item.high ? "bg-amber-50 text-amber-700" : item.kind === "sla" ? "bg-orange-50 text-orange-700" : "bg-petroleum-50 text-petroleum-700"}`}><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-ink-900">{item.title}</p><span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500">{item.kind === "sla" ? "SLA" : item.kind === "security" ? "Säkerhet" : "Service"}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">{item.description}</p><p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{dateFormat.format(new Date(item.dueAt))}</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => void markRead(item)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-500 hover:bg-white hover:text-ink-800"><Check className="h-3.5 w-3.5" /> Läst</button>
                    <Link href={item.href} onClick={() => { void markRead(item); setOpen(false); }} className="inline-flex items-center gap-1 rounded-lg bg-petroleum-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-petroleum-900">Öppna <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
