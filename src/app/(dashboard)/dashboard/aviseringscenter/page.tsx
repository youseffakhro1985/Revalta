"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, CheckCheck, Clock3, RefreshCw, RotateCcw, TimerReset } from "lucide-react";
import { NotificationAssignment } from "@/components/dashboard/notification-assignment";

type Notification = {
  key: string;
  title: string;
  description: string;
  dueAt: string;
  overdue: boolean;
  high: boolean;
  read: boolean;
  snoozedUntil: string | null;
  href: string;
};

type Data = {
  notifications: Notification[];
  summary: { total: number; unread: number; overdue: number; high: number; snoozed: number };
};

const dateFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const filters = [
  { id: "all", label: "Alla" },
  { id: "unread", label: "Olästa" },
  { id: "overdue", label: "Förfallna" },
  { id: "high", label: "Hög prioritet" },
  { id: "snoozed", label: "Uppskjutna" },
];

export default function NotificationCenterPage() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/notifications/service-center?filter=${filter}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta aviseringar");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta aviseringar");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function patch(body: Record<string, unknown>) {
    const response = await fetch("/api/notifications/service-center", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Åtgärden kunde inte genomföras");
    return result;
  }

  async function markRead(key: string) {
    try {
      await patch({ key, action: "read" });
      setData((current) => current ? {
        ...current,
        notifications: current.notifications.map((item) => item.key === key ? { ...item, read: true } : item),
        summary: {
          ...current.summary,
          unread: Math.max(0, current.summary.unread - (current.notifications.find((item) => item.key === key && !item.read) ? 1 : 0)),
        },
      } : current);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte markera aviseringen som läst");
    }
  }

  async function markAllRead() {
    try {
      await patch({ all: true, action: "read" });
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte markera alla som lästa");
    }
  }

  async function snooze(key: string, days: number) {
    setActingKey(key);
    setError("");
    setSuccess("");
    try {
      const until = new Date(Date.now() + days * 86400000);
      await patch({ key, action: "snooze", snoozedUntil: until.toISOString() });
      setSuccess(`Aviseringen är uppskjuten till ${dateFormat.format(until)}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skjuta upp aviseringen");
    } finally {
      setActingKey("");
    }
  }

  async function unsnooze(key: string) {
    setActingKey(key);
    setError("");
    setSuccess("");
    try {
      await patch({ key, action: "unsnooze" });
      setSuccess("Aviseringen är återaktiverad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte återaktivera aviseringen");
    } finally {
      setActingKey("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-sand-200/80 bg-white p-7 shadow-premium-sm sm:flex-row sm:items-end sm:p-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift och underhåll</p>
          <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Aviseringscenter</h1>
          <p className="mt-3 max-w-2xl text-ink-600">Prioritera, tilldela, läs och skjut upp servicevarningar utan att förlora historik eller spårbarhet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
          <button onClick={() => void markAllRead()} disabled={!data?.summary.unread} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50"><CheckCheck className="h-4 w-4" /> Markera alla som lästa</button>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{success}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Aktiva", value: data?.summary.total ?? "–", icon: BellRing },
          { label: "Olästa", value: data?.summary.unread ?? "–", icon: BellRing },
          { label: "Förfallna", value: data?.summary.overdue ?? "–", icon: Clock3 },
          { label: "Hög prioritet", value: data?.summary.high ?? "–", icon: AlertTriangle },
          { label: "Uppskjutna", value: data?.summary.snoozed ?? "–", icon: TimerReset },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-sand-200/80 bg-white p-5 shadow-premium-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-ink-500">{label}</p><Icon className="h-5 w-5 text-petroleum-700" /></div><p className="mt-4 text-3xl font-semibold text-ink-950">{value}</p></div>)}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-sand-200 bg-white p-2 shadow-premium-sm">
        {filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${filter === item.id ? "bg-petroleum-800 text-white" : "text-ink-600 hover:bg-sand-50"}`}>{item.label}</button>)}
      </div>

      <section className="overflow-hidden rounded-2xl border border-sand-200/80 bg-white shadow-premium-sm">
        {loading && !data ? <div className="h-64 animate-pulse bg-sand-50" /> : null}
        {!loading && data?.notifications.length === 0 ? <div className="p-12 text-center"><BellRing className="mx-auto h-10 w-10 text-sand-400" /><h2 className="mt-4 text-xl font-semibold text-ink-900">Inga aviseringar i detta filter</h2><p className="mt-2 text-sm text-ink-500">När en komponent behöver service visas den här.</p></div> : null}
        <div className="divide-y divide-sand-100">
          {data?.notifications.map((item) => (
            <div key={item.key} className={`grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_260px_auto] xl:items-start ${item.read ? "bg-white" : "bg-sand-50/70"}`}>
              <div className="flex min-w-0 gap-4">
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.overdue ? "bg-red-50 text-red-700" : item.high ? "bg-amber-50 text-amber-700" : "bg-petroleum-50 text-petroleum-700"}`}><AlertTriangle className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink-950">{item.title}</h2>{!item.read && !item.snoozedUntil ? <span className="rounded-full bg-petroleum-100 px-2 py-0.5 text-[11px] font-semibold text-petroleum-800">Ny</span> : null}{item.snoozedUntil ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Uppskjuten</span> : null}</div>
                  <p className="mt-1 text-sm text-ink-500">{item.description}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Service {dateFormat.format(new Date(item.dueAt))}</p>
                  {item.snoozedUntil ? <p className="mt-2 text-xs font-medium text-blue-700">Visas igen {dateTimeFormat.format(new Date(item.snoozedUntil))}</p> : null}
                </div>
              </div>

              <NotificationAssignment notificationKey={item.key} />

              <div className="flex flex-wrap gap-2 xl:max-w-[440px] xl:justify-end">
                {item.snoozedUntil ? (
                  <button onClick={() => void unsnooze(item.key)} disabled={actingKey === item.key} className="inline-flex items-center gap-2 rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-sand-50 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Återaktivera</button>
                ) : (
                  <>
                    {[1, 3, 7].map((days) => <button key={days} onClick={() => void snooze(item.key, days)} disabled={actingKey === item.key} className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-sand-50 disabled:opacity-40"><TimerReset className="h-4 w-4" /> {days} {days === 1 ? "dag" : "dagar"}</button>)}
                    <button onClick={() => void markRead(item.key)} disabled={item.read || actingKey === item.key} className="rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-sand-50 disabled:opacity-40">Markera läst</button>
                  </>
                )}
                <Link href={item.href} onClick={() => void markRead(item.key)} className="rounded-lg bg-petroleum-800 px-3 py-2 text-sm font-semibold text-white hover:bg-petroleum-900">Öppna komponent</Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
