"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, Clock3, MailWarning, RefreshCw, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { EscalationAdminActions } from "@/components/dashboard/escalation-admin-actions";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Assignment = {
  notificationKey: string;
  componentName: string;
  propertyName: string;
  href: string;
  assigneeName: string | null;
  status: string;
  deadline: string | null;
  note: string | null;
  reason: "blocked" | "overdue_deadline";
  updatedAt: string;
};

type EventRow = {
  id: string;
  status: string;
  recipient: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type Recipient = { id: string; name: string | null; email: string; role: string };
type Rules = {
  enabled: boolean;
  escalateBlocked: boolean;
  escalateOverdue: boolean;
  graceDays: number;
  repeatDays: number;
  recipientRoles: string[];
  includeAssignee: boolean;
};
type Data = {
  canManage: boolean;
  configuration: { cronSecret: boolean; emailApiKey: boolean; emailFrom: boolean };
  rules: Rules;
  rulesUpdatedAt: string | null;
  summary: { active: number; blocked: number; overdue: number; failed: number; sent: number };
  assignments: Assignment[];
  recipients: Recipient[];
  events: EventRow[];
  statusCounts: Record<string, number>;
};

type RulesSnapshot = Rules & { updatedAt: string | null };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const statusLabels: Record<string, string> = { sent: "Skickat", failed: "Misslyckat", processing: "Bearbetas", skipped: "Överhoppat" };
const roleLabels: Record<string, string> = {
  owner: "Ägare",
  admin: "Administratör",
  manager: "Förvaltare",
  property_manager: "Fastighetsförvaltare",
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function rulesSnapshot(payload: Record<string, unknown> | null): RulesSnapshot | null {
  const snapshot = objectValue(payload?.rulesSnapshot);
  if (!snapshot) return null;
  return {
    enabled: snapshot.enabled === true,
    escalateBlocked: snapshot.escalateBlocked === true,
    escalateOverdue: snapshot.escalateOverdue === true,
    graceDays: typeof snapshot.graceDays === "number" ? snapshot.graceDays : 0,
    repeatDays: typeof snapshot.repeatDays === "number" ? snapshot.repeatDays : 1,
    recipientRoles: Array.isArray(snapshot.recipientRoles) ? snapshot.recipientRoles.filter((role): role is string => typeof role === "string") : [],
    includeAssignee: snapshot.includeAssignee === true,
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null,
  };
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default function EscalationAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-escalations", { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta eskaleringsstatus");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta eskaleringsstatus");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const configured = useMemo(() => {
    if (!data) return false;
    return data.configuration.cronSecret && data.configuration.emailApiKey && data.configuration.emailFrom;
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in-soft">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-sand-200/80 bg-white p-7 shadow-premium-sm sm:flex-row sm:items-end sm:p-8">
        <div>
          <Link href="/dashboard/installningar/aviseringar" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">← Serviceaviseringar</Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift och ansvar</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Serviceeskaleringar</h1>
          <p className="mt-3 max-w-3xl text-ink-600">Övervaka blockerade uppgifter, passerade deadlines, mottagare och den automatiska eskaleringsmotorns leveranshistorik.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera
        </button>
      </header>

      {error ? <InlineAlert>{error}</InlineAlert> : null}

      <Panel title="Aktiva organisationsregler" description="Driftöversikten använder exakt samma regler som den automatiska och manuella eskaleringsmotorn.">
        {data ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Motor</p><p className={`mt-2 font-semibold ${data.rules.enabled ? "text-emerald-800" : "text-amber-800"}`}>{data.rules.enabled ? "Aktiverad" : "Pausad"}</p></div>
              <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Orsaker</p><p className="mt-2 font-semibold text-ink-800">{[data.rules.escalateBlocked && "Blockerad", data.rules.escalateOverdue && "Deadline"].filter(Boolean).join(" + ") || "Inga"}</p></div>
              <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Respittid</p><p className="mt-2 font-semibold text-ink-800">{data.rules.graceDays} dagar</p></div>
              <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Upprepning</p><p className="mt-2 font-semibold text-ink-800">Var {data.rules.repeatDays}:e dag</p></div>
            </div>
            <Link href="/dashboard/installningar/eskaleringar/regler" className="inline-flex items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white hover:bg-petroleum-900"><SlidersHorizontal className="h-4 w-4" /> Hantera regler</Link>
          </div>
        ) : <div className="h-24 animate-pulse rounded-xl bg-sand-100" />}
        {data?.rulesUpdatedAt ? <p className="mt-4 text-sm text-ink-500">Senast ändrad {dateTime.format(new Date(data.rulesUpdatedAt))}.</p> : null}
      </Panel>

      <Panel title="Manuell driftkontroll" description="Verifiera e-postleveransen eller starta den tenant-säkra eskaleringsmotorn direkt. Varje åtgärd loggas med användare, status och resultat.">
        <EscalationAdminActions canManage={Boolean(data?.canManage)} configured={configured} onComplete={load} />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={AlertOctagon} label="Aktiva eskaleringar" value={data?.summary.active ?? "–"} />
        <MetricCard icon={MailWarning} label="Blockerade" value={data?.summary.blocked ?? "–"} />
        <MetricCard icon={Clock3} label="Passerad deadline" value={data?.summary.overdue ?? "–"} />
        <MetricCard icon={CheckCircle2} label="Skickade" value={data?.summary.sent ?? "–"} />
        <MetricCard icon={AlertOctagon} label="Misslyckade" value={data?.summary.failed ?? "–"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Driftstatus" description="Kontroll av att eskaleringsmotorn har nödvändig produktionskonfiguration.">
          <div className="space-y-3">
            {[["CRON_SECRET", data?.configuration.cronSecret], ["EMAIL_PROVIDER_API_KEY", data?.configuration.emailApiKey], ["EMAIL_FROM", data?.configuration.emailFrom]].map(([label, active]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-xl border border-sand-200 p-4"><span className="font-semibold text-ink-900">{String(label)}</span><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{active ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertOctagon className="h-3.5 w-3.5" />}{active ? "Aktiv" : "Saknas"}</span></div>
            ))}
            <div className={`rounded-xl p-4 text-sm font-semibold ${configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{configured ? "Eskaleringstjänsten är tekniskt redo." : "En eller flera produktionsvariabler behöver konfigureras."}</div>
          </div>
        </Panel>

        <Panel title="Regelstyrda mottagare" description={`Aktiva användare i valda roller${data?.rules.includeAssignee ? ", tillsammans med ansvarig användare för respektive uppgift" : ""}.`}>
          {data?.rules.recipientRoles.length ? <div className="mb-4 flex flex-wrap gap-2">{data.rules.recipientRoles.map((role) => <span key={role} className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{roleLabels[role] || role}</span>)}</div> : null}
          {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}
          {!loading && data?.recipients.length === 0 ? <EmptyState title="Inga mottagare" description="Inga aktiva användare matchar organisationens valda mottagarroller." /> : null}
          {data?.recipients.length ? <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">{data.recipients.map((recipient) => <div key={recipient.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-semibold text-ink-900">{recipient.name || recipient.email}</p><p className="mt-1 truncate text-sm text-ink-500">{recipient.email}</p></div><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600"><Users className="h-3.5 w-3.5" />{roleLabels[recipient.role] || recipient.role}</span></div>)}</div> : null}
        </Panel>
      </div>

      <Panel title="Uppgifter som kräver eskalering" description="Urvalet följer aktiva regler, inklusive respittid och valda eskaleringstyper. Slutförda uppgifter visas inte.">
        {loading && !data ? <div className="h-52 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data?.assignments.length === 0 ? <EmptyState title="Inga aktiva eskaleringar" description={data?.rules.enabled ? "Inga uppgifter matchar de aktiva reglerna." : "Eskaleringsmotorn är pausad i organisationens regler."} /> : null}
        {data?.assignments.length ? <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">{data.assignments.map((item) => <div key={item.notificationKey} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink-950">{item.componentName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.reason === "blocked" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{item.reason === "blocked" ? "Blockerad" : "Deadline passerad"}</span></div><p className="mt-1 text-sm text-ink-500">{item.propertyName}</p>{item.note ? <p className="mt-2 text-sm text-ink-600">{item.note}</p> : null}</div><div className="text-sm text-ink-600"><p><span className="font-semibold text-ink-800">Ansvarig:</span> {item.assigneeName || "Ej angiven"}</p><p className="mt-1"><span className="font-semibold text-ink-800">Deadline:</span> {item.deadline ? dateOnly.format(new Date(item.deadline)) : "Ingen"}</p></div><Link href={item.href} className="rounded-lg bg-petroleum-800 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-petroleum-900">Öppna komponent</Link></div>)}</div> : null}
      </Panel>

      <Panel title="Revisionssäker eskaleringshistorik" description="Varje nytt leveransförsök sparar en oföränderlig ögonblicksbild av regler, kvalificering och faktiska mottagare.">
        {!loading && data?.events.length === 0 ? <EmptyState title="Ingen historik ännu" description="När eskaleringsmotorn körs visas resultatet och regelunderlaget här." /> : null}
        {data?.events.length ? <div className="space-y-3">{data.events.map((event) => {
          const payload = event.payload;
          const reason = typeof payload?.reason === "string" ? payload.reason : "–";
          const snapshot = rulesSnapshot(payload);
          const recipients = stringList(payload?.recipients);
          const componentName = typeof payload?.componentName === "string" ? payload.componentName : null;
          const propertyName = typeof payload?.propertyName === "string" ? payload.propertyName : null;
          const graceAt = typeof payload?.graceAt === "string" ? payload.graceAt : null;
          const errorMessage = typeof payload?.error === "string" ? payload.error : null;
          return (
            <details key={event.id} className="group rounded-xl border border-sand-200 bg-white">
              <summary className="grid cursor-pointer list-none gap-3 p-4 sm:grid-cols-[170px_120px_minmax(0,1fr)_auto] sm:items-center">
                <span className="font-medium text-ink-700">{dateTime.format(new Date(event.created_at))}</span>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${event.status === "sent" ? "bg-emerald-50 text-emerald-800" : event.status === "failed" ? "bg-red-50 text-red-700" : "bg-sand-100 text-ink-600"}`}>{statusLabels[event.status] || event.status}</span>
                <span className="min-w-0"><span className="block truncate font-semibold text-ink-900">{componentName || (reason === "blocked" ? "Blockerad uppgift" : reason === "overdue_deadline" ? "Passerad deadline" : "Eskalering")}</span><span className="block truncate text-sm text-ink-500">{propertyName || event.recipient || "Äldre historikpost"}</span></span>
                <span className="text-sm font-semibold text-petroleum-700 group-open:hidden">Visa underlag</span>
              </summary>
              <div className="border-t border-sand-100 p-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Orsak</p><p className="mt-1 font-semibold text-ink-800">{reason === "blocked" ? "Blockerad" : reason === "overdue_deadline" ? "Deadline passerad" : reason}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Respittid slut</p><p className="mt-1 font-semibold text-ink-800">{graceAt ? dateTime.format(new Date(graceAt)) : "Ej tillämplig"}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Mottagare</p><p className="mt-1 font-semibold text-ink-800">{recipients.length}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Dataversion</p><p className="mt-1 font-semibold text-ink-800">{payload?.schemaVersion === 2 ? "Revisionsspår v2" : "Äldre format"}</p></div>
                </div>
                {snapshot ? <div className="mt-5 rounded-xl bg-sand-50 p-4"><p className="text-sm font-semibold text-ink-900">Regelögonblicksbild</p><div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-ink-700"><span className="rounded-full bg-white px-3 py-1">Respittid {snapshot.graceDays} dagar</span><span className="rounded-full bg-white px-3 py-1">Upprepning {snapshot.repeatDays} dagar</span><span className="rounded-full bg-white px-3 py-1">{snapshot.includeAssignee ? "Ansvarig inkluderad" : "Ansvarig ej inkluderad"}</span>{snapshot.recipientRoles.map((role) => <span key={role} className="rounded-full bg-white px-3 py-1">{roleLabels[role] || role}</span>)}</div>{snapshot.updatedAt ? <p className="mt-3 text-xs text-ink-500">Reglerna ändrades senast {dateTime.format(new Date(snapshot.updatedAt))} före detta försök.</p> : null}</div> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Den här äldre historikposten skapades innan regelögonblicksbilder infördes.</p>}
                {recipients.length ? <div className="mt-5"><p className="text-sm font-semibold text-ink-900">Faktiska mottagare</p><div className="mt-2 flex flex-wrap gap-2">{recipients.map((email) => <span key={email} className="rounded-full border border-sand-200 px-3 py-1 text-xs text-ink-600">{email}</span>)}</div></div> : null}
                {errorMessage ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{errorMessage}</p> : null}
                <p className="mt-5 break-all text-xs text-ink-400">Körningsnyckel: {event.recipient || "–"}</p>
              </div>
            </details>
          );
        })}</div> : null}
      </Panel>
    </div>
  );
}
