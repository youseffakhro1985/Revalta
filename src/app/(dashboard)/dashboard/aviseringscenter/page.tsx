"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, CheckCheck, Clock3, RefreshCw, RotateCcw, TimerReset } from "lucide-react";
import { NotificationAssignment } from "@/components/dashboard/notification-assignment";

type NotificationKind = "service" | "sla";
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
  kind: NotificationKind;
};

type SourceData = {
  notifications: Omit<Notification, "kind">[];
  summary: { total: number; unread: number; overdue: number; high: number; snoozed: number };
};

type Data = {
  notifications: Notification[];
  summary: { total: number; unread: number; overdue: number; high: number; snoozed: number; sla: number; service: number };
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

function endpointFor(kind: NotificationKind) {
  return kind === "sla" ? "/api/notifications/work-order-sla" : "/api/notifications/service-center";
}

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
      const [serviceResponse, slaResponse] = await Promise.all([
        fetch(`/api/notifications/service-center?filter=${filter}`, { cache: "no-store" }),
        fetch(`/api/notifications/work-order-sla?filter=${filter}`, { cache: "no-store" }),
      ]);
      const [serviceBody, slaBody] = await Promise.all([serviceResponse.json(), slaResponse.json()]);
      if (!serviceResponse.ok) throw new Error(serviceBody.error || "Kunde inte hämta serviceaviseringar");
      if (!slaResponse.ok) throw new Error(slaBody.error || "Kunde inte hämta SLA-aviseringar");
      const service = serviceBody as SourceData;
      const sla = slaBody as SourceData;
      const notifications: Notification[] = [
        ...service.notifications.map((item) => ({ ...item, kind: "service" as const })),
        ...sla.notifications.map((item) => ({ ...item, kind: "sla" as const })),
      ].sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.high !== b.high) return a.high ? -1 : 1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
      setData({
        notifications,
        summary: {
          total: service.summary.total + sla.summary.total,
          unread: service.summary.unread + sla.summary.unread,
          overdue: service.summary.overdue + sla.summary.overdue,
          high: service.summary.high + sla.summary.high,
          snoozed: service.summary.snoozed + sla.summary.snoozed,
          sla: sla.summary.total,
          service: service.summary.total,
        },
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta aviseringar");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function patch(kind: NotificationKind, body: Record<string, unknown>) {
    const response = await fetch(endpointFor(kind), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Åtgärden kunde inte genomföras");
    return result;
  }

  async function markRead(item: Notification) {
    try {
      await patch(item.kind, { key: item.key, action: "read" });
      setData((current) => current ? {
        ...current,
        notifications: current.notifications.map((candidate) => candidate.key === item.key && candidate.kind === item.kind ? { ...candidate, read: true } : candidate),
        summary: { ...current.summary, unread: Math.max(0, current.summary.unread - (item.read ? 0 : 1)) },
      } : current);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte markera aviseringen som läst");
    }
  }

  async function markAllRead() {
    try {
      await Promise.all([patch("service", { all: true, action: "read" }), patch("sla", { all: true, action: "read" })]);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte markera alla som lästa");
    }
  }

  async function snooze(item: Notification, days: number) {
    const actionKey = `${item.kind}:${item.key}`;
    setActingKey(actionKey); setError(""); setSuccess("");
    try {
      const until = new Date(Date.now() + days * 86400000);
      await patch(item.kind, { key: item.key, action: "snooze", snoozedUntil: until.toISOString() });
      setSuccess(`Aviseringen är uppskjuten till ${dateFormat.format(until)}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skjuta upp aviseringen");
    } finally { setActingKey(""); }
  }

  async function unsnooze(item: Notification) {
    const actionKey = `${item.kind}:${item.key}`;
    setActingKey(actionKey); setError(""); setSuccess("");
    try {
      await patch(item.kind, { key: item.key, action: "unsnooze" });
      setSuccess("Aviseringen är återaktiverad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte återaktivera aviseringen");
    } finally { setActingKey(""); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-sand-200/80 bg-white p-7 shadow-premium-sm sm:flex-row sm:items-end sm:p-8">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift och leveranssäkerhet</p><h1 className="mt-3 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Aviseringscenter</h1><p className="mt-3 max-w-2xl text-ink-600">Prioritera service och SLA-risker, markera läst och skjut upp aviseringar utan att förlora spårbarhet.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button><button onClick={() => void markAllRead()} disabled={!data?.summary.unread} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50"><CheckCheck className="h-4 w-4" /> Markera alla som lästa</button></div>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{success}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[{ label: "Aktiva", value: data?.summary.total ?? "–", icon: BellRing }, { label: "Olästa", value: data?.summary.unread ?? "–", icon: BellRing }, { label: "Förfallna", value: data?.summary.overdue ?? "–", icon: Clock3 }, { label: "Hög prioritet", value: data?.summary.high ?? "–", icon: AlertTriangle }, { label: "SLA", value: data?.summary.sla ?? "–", icon: TimerReset }, { label: "Uppskjutna", value: data?.summary.snoozed ?? "–", icon: TimerReset }].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-sand-200/80 bg-white p-5 shadow-premium-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-ink-500">{label}</p><Icon className="h-5 w-5 text-petroleum-700" /></div><p className="mt-4 text-3xl font-semibold text-ink-950">{value}</p></div>)}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-sand-200 bg-white p-2 shadow-premium-sm">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${filter === item.id ? "bg-petroleum-800 text-white" : "text-ink-600 hover:bg-sand-50"}`}>{item.label}</button>)}</div>

      <section className="overflow-hidden rounded-2xl border border-sand-200/80 bg-white shadow-premium-sm">
        {loading && !data ? <div className="h-64 animate-pulse bg-sand-50" /> : null}
        {!loading && data?.notifications.length === 0 ? <div className="p-12 text-center"><BellRing className="mx-auto h-10 w-10 text-sand-400" /><h2 className="mt-4 text-xl font-semibold text-ink-900">Inga aviseringar i detta filter</h2><p className="mt-2 text-sm text-ink-500">När service eller SLA kräver åtgärd visas det här.</p></div> : null}
        <div className="divide-y divide-sand-100">
          {data?.notifications.map((item) => {
            const actionKey = `${item.kind}:${item.key}`;
            return <div key={actionKey} className={`grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_260px_auto] xl:items-start ${item.read ? "bg-white" : "bg-sand-50/70"}`}>
              <div className="flex min-w-0 gap-4"><div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.overdue ? "bg-red-50 text-red-700" : item.high ? "bg-amber-50 text-amber-700" : item.kind === "sla" ? "bg-orange-50 text-orange-700" : "bg-petroleum-50 text-petroleum-700"}`}><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink-950">{item.title}</h2><span className="rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{item.kind === "sla" ? "SLA" : "Service"}</span>{!item.read && !item.snoozedUntil ? <span className="rounded-full bg-petroleum-100 px-2 py-0.5 text-[11px] font-semibold text-petroleum-800">Ny</span> : null}{item.snoozedUntil ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Uppskjuten</span> : null}</div><p className="mt-1 text-sm text-ink-500">{item.description}</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{item.kind === "sla" ? "Deadline" : "Service"} {dateTimeFormat.format(new Date(item.dueAt))}</p>{item.snoozedUntil ? <p className="mt-2 text-xs font-medium text-blue-700">Visas igen {dateTimeFormat.format(new Date(item.snoozedUntil))}</p> : null}</div></div>

              {item.kind === "service" ? <NotificationAssignment notificationKey={item.key} /> : <div className="rounded-xl border border-sand-200 bg-sand-50 p-3 text-sm text-ink-600"><p className="font-semibold text-ink-800">SLA-åtgärd</p><p className="mt-1 text-xs leading-5">Öppna arbetsordern för att tilldela ansvarig, registrera respons eller styra deadline.</p></div>}

              <div className="flex flex-wrap gap-2 xl:max-w-[440px] xl:justify-end">
                {item.snoozedUntil ? <button onClick={() => void unsnooze(item)} disabled={actingKey === actionKey} className="inline-flex items-center gap-2 rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-sand-50 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Återaktivera</button> : <>{[1, 3, 7].map((days) => <button key={days} onClick={() => void snooze(item, days)} disabled={actingKey === actionKey} className="inline-flex items-center gap-1.5 rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-sand-50 disabled:opacity-40"><TimerReset className="h-4 w-4" /> {days} {days === 1 ? "dag" : "dagar"}</button>)}<button onClick={() => void markRead(item)} disabled={item.read || actingKey === actionKey} className="rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-sand-50 disabled:opacity-40">Markera läst</button></>}
                <Link href={item.href} onClick={() => void markRead(item)} className="rounded-lg bg-petroleum-800 px-3 py-2 text-sm font-semibold text-white hover:bg-petroleum-900">Öppna {item.kind === "sla" ? "arbetsorder" : "komponent"}</Link>
              </div>
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}
