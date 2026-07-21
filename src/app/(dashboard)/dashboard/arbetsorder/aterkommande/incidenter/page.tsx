"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, RefreshCw, RotateCcw, ShieldCheck, Siren, UserRoundCheck, Users } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type AlertItem = { key: string; title: string; description: string; dueAt: string; overdue: boolean; high: boolean; read: boolean; href: string };
type TimelineEntry = { id: string; kind?: "action" | "escalation" | "assignment"; status: string; level?: number; comment: string; changedBy: string; changedByName: string; changedAt: string };
type AssignedUser = { id: string | null; name: string | null; assignedAt: string | null };
type Incident = { notificationKey: string; status: string; escalationLevel: number; lastEscalatedAt: string | null; assignedUser: AssignedUser; latest: TimelineEntry; timeline: TimelineEntry[] };
type UserOption = { id: string; name: string | null; email: string; role: string };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
function statusLabel(status: string) {
  if (status === "resolved") return "Löst";
  if (status === "reopened") return "Återöppnat";
  if (status === "assigned") return "Tilldelad";
  if (status === "unassigned") return "Ansvarig borttagen";
  if (status.startsWith("level_")) return `Eskalering nivå ${status.replace("level_", "")}`;
  return "Kvitterat";
}
function statusClass(status: string) {
  if (status === "resolved") return "bg-emerald-50 text-emerald-700";
  if (status === "reopened") return "bg-amber-50 text-amber-700";
  if (status === "assigned" || status === "unassigned") return "bg-violet-50 text-violet-700";
  if (status.startsWith("level_")) return "bg-red-50 text-red-700";
  return "bg-blue-50 text-blue-700";
}

export default function RecurringIncidentsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningEscalation, setRunningEscalation] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [alertsResponse, incidentsResponse] = await Promise.all([
        fetch("/api/notifications/recurring-work-orders", { cache: "no-store" }),
        fetch("/api/work-orders/recurring/incidents", { cache: "no-store" }),
      ]);
      const [alertsBody, incidentsBody] = await Promise.all([alertsResponse.json(), incidentsResponse.json()]);
      if (!alertsResponse.ok) throw new Error(alertsBody.error || "Kunde inte hämta schemavarningar");
      if (!incidentsResponse.ok) throw new Error(incidentsBody.error || "Kunde inte hämta incidenter");
      setAlerts(alertsBody.notifications || []); setIncidents(incidentsBody.incidents || []); setUsers(incidentsBody.users || []);
      const initial: Record<string, string> = {};
      for (const item of incidentsBody.incidents || []) initial[item.notificationKey] = item.assignedUser?.id || "";
      setAssignments(initial);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta incidenter"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const incidentMap = useMemo(() => new Map(incidents.map((item) => [item.notificationKey, item])), [incidents]);
  const open = alerts.filter((item) => incidentMap.get(item.key)?.status !== "resolved").length;
  const acknowledged = alerts.filter((item) => incidentMap.get(item.key)?.status === "acknowledged").length;
  const resolved = incidents.filter((item) => item.status === "resolved").length;
  const escalated = incidents.filter((item) => item.escalationLevel > 0 && item.status !== "resolved").length;
  const unassigned = alerts.filter((item) => !incidentMap.get(item.key)?.assignedUser?.id && incidentMap.get(item.key)?.status !== "resolved").length;
  const workload = useMemo(() => users.map((user) => ({ ...user, count: incidents.filter((item) => item.assignedUser?.id === user.id && item.status !== "resolved").length })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count), [incidents, users]);

  async function act(notificationKey: string, status: "acknowledged" | "resolved" | "reopened") {
    setBusyKey(notificationKey); setError(""); setMessage("");
    try {
      const response = await fetch("/api/work-orders/recurring/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationKey, status, comment: comments[notificationKey] || "" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Incidenten kunde inte uppdateras");
      setComments((current) => ({ ...current, [notificationKey]: "" }));
      setMessage(status === "resolved" ? "Incidenten har lösts." : status === "reopened" ? "Incidenten har återöppnats." : "Incidenten har kvitterats.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Incidenten kunde inte uppdateras"); }
    finally { setBusyKey(""); }
  }

  async function assign(notificationKey: string) {
    setBusyKey(notificationKey); setError(""); setMessage("");
    try {
      const assignedTo = assignments[notificationKey] || null;
      const response = await fetch("/api/work-orders/recurring/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", notificationKey, assignedTo }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Ansvarig kunde inte uppdateras");
      setMessage(assignedTo ? `Incidenten har tilldelats ${body.assignedUser?.name || "ansvarig"}.` : "Ansvarig har tagits bort.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Ansvarig kunde inte uppdateras"); }
    finally { setBusyKey(""); }
  }

  async function runEscalation() {
    setRunningEscalation(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/cron/recurring-incident-escalations", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Eskaleringen kunde inte köras");
      setMessage(`Eskaleringen är klar. ${body.escalated || 0} incidenter eskalerades.`); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Eskaleringen kunde inte köras"); }
    finally { setRunningEscalation(false); }
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Driftincidenter" title="Incidenter för återkommande arbetsordrar" description="Tilldela ansvar, kvittera, dokumentera och följ upp misslyckade körningar och kraftigt försenade scheman." action={<div className="flex flex-wrap gap-2"><Link href="/dashboard/arbetsorder/aterkommande" className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><ChevronLeft className="h-4 w-4" /> Till scheman</Link><button type="button" onClick={() => void runEscalation()} disabled={runningEscalation} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50"><Siren className="h-4 w-4" /> {runningEscalation ? "Kontrollerar…" : "Kontrollera eskalering"}</button><button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button></div>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard icon={AlertTriangle} label="Öppna" value={open} /><MetricCard icon={UserRoundCheck} label="Utan ansvarig" value={unassigned} /><MetricCard icon={ShieldCheck} label="Kvitterade" value={acknowledged} /><MetricCard icon={Siren} label="Eskalerade" value={escalated} /><MetricCard icon={CheckCircle2} label="Lösta" value={resolved} /></section>
    {error ? <InlineAlert>{error}</InlineAlert> : null}{message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
    {workload.length ? <Panel title="Ansvarsbelastning" description="Öppna incidenter per ansvarig"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{workload.map((item) => <div key={item.id} className="rounded-xl border border-sand-200 bg-sand-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-ink-900">{item.name || item.email}</p><p className="mt-1 text-xs text-ink-500">{item.role}</p></div><span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-petroleum-100 px-2 text-sm font-bold text-petroleum-800">{item.count}</span></div></div>)}</div></Panel> : null}
    <Panel title="Aktiva schemaincidenter" description="Incidenter bygger på aktuella schemavarningar och behåller hela åtgärds-, tilldelnings- och eskaleringshistoriken." bodyClassName="p-0">
      {loading && !alerts.length ? <div className="p-8 text-sm text-ink-500">Hämtar incidenter…</div> : null}
      {!loading && alerts.length === 0 ? <EmptyState title="Inga aktiva schemaincidenter" description="Automatiken fungerar utan kända fel eller kraftigt försenade scheman." /> : null}
      <div className="divide-y divide-sand-100">{alerts.map((alert) => {
        const incident = incidentMap.get(alert.key); const status = incident?.status || "open"; const assigned = incident?.assignedUser;
        return <article key={alert.key} className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "open" ? "bg-red-50 text-red-700" : statusClass(status)}`}>{status === "open" ? "Öppen" : statusLabel(status)}</span>{alert.high ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Hög prioritet</span> : null}{incident?.escalationLevel ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">Eskalerad nivå {incident.escalationLevel}</span> : null}{assigned?.id ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Ansvarig: {assigned.name}</span> : <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600">Ej tilldelad</span>}</div><h2 className="mt-3 text-lg font-semibold text-ink-950">{alert.title}</h2><p className="mt-1 text-sm leading-6 text-ink-600">{alert.description}</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Registrerad {dateTime.format(new Date(alert.dueAt))}{assigned?.assignedAt ? ` · Tilldelad ${dateTime.format(new Date(assigned.assignedAt))}` : ""}</p></div><Link href={alert.href} className="text-sm font-semibold text-petroleum-700 hover:underline">Öppna schemavyn</Link></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,320px)_auto]"><select className={premiumFieldClass} value={assignments[alert.key] || ""} onChange={(event) => setAssignments((current) => ({ ...current, [alert.key]: event.target.value }))}><option value="">Ingen ansvarig</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email} · {user.role}</option>)}</select><button type="button" disabled={busyKey === alert.key} onClick={() => void assign(alert.key)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-800 disabled:opacity-50"><Users className="h-4 w-4" /> Uppdatera ansvarig</button></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"><textarea className={premiumTextareaClass} value={comments[alert.key] || ""} onChange={(event) => setComments((current) => ({ ...current, [alert.key]: event.target.value }))} maxLength={2000} placeholder="Dokumentera orsak, utförd kontroll eller nästa åtgärd" /><div className="flex flex-wrap items-start gap-2">{status === "open" || status === "reopened" ? <button disabled={busyKey === alert.key} onClick={() => void act(alert.key, "acknowledged")} className={premiumPrimaryButtonClass}>Kvittera</button> : null}{status !== "resolved" ? <button disabled={busyKey === alert.key} onClick={() => void act(alert.key, "resolved")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Markera löst</button> : <button disabled={busyKey === alert.key} onClick={() => void act(alert.key, "reopened")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800"><RotateCcw className="h-4 w-4" /> Återöppna</button>}</div></div>
          {incident?.timeline?.length ? <div className="mt-5 rounded-xl border border-sand-200 bg-sand-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Åtgärds-, tilldelnings- och eskaleringshistorik</p><div className="mt-3 space-y-3">{incident.timeline.map((entry) => <div key={entry.id} className={`border-l-2 pl-3 ${entry.kind === "escalation" ? "border-red-300" : entry.kind === "assignment" ? "border-violet-300" : "border-sand-300"}`}><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span><span className="text-xs text-ink-400">{entry.changedByName} · {dateTime.format(new Date(entry.changedAt))}</span></div>{entry.comment ? <p className="mt-1 text-sm leading-6 text-ink-600">{entry.comment}</p> : null}</div>)}</div></div> : null}
        </article>;
      })}</div>
    </Panel>
  </div>;
}
