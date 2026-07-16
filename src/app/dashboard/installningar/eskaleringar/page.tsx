"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, Clock3, MailWarning, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

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
type Data = {
  canManage: boolean;
  configuration: { cronSecret: boolean; emailApiKey: boolean; emailFrom: boolean };
  summary: { active: number; blocked: number; overdue: number; failed: number; sent: number };
  assignments: Assignment[];
  recipients: Recipient[];
  events: EventRow[];
  statusCounts: Record<string, number>;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const statusLabels: Record<string, string> = { sent: "Skickat", failed: "Misslyckat", processing: "Bearbetas", skipped: "Överhoppat" };

export default function EscalationAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-escalations", { cache: "no-store" });
      const body = await response.json();
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
            {[
              ["CRON_SECRET", data?.configuration.cronSecret],
              ["EMAIL_PROVIDER_API_KEY", data?.configuration.emailApiKey],
              ["EMAIL_FROM", data?.configuration.emailFrom],
            ].map(([label, active]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-xl border border-sand-200 p-4">
                <span className="font-semibold text-ink-900">{String(label)}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                  {active ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertOctagon className="h-3.5 w-3.5" />}{active ? "Aktiv" : "Saknas"}
                </span>
              </div>
            ))}
            <div className={`rounded-xl p-4 text-sm font-semibold ${configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              {configured ? "Eskaleringstjänsten är tekniskt redo." : "En eller flera produktionsvariabler behöver konfigureras."}
            </div>
          </div>
        </Panel>

        <Panel title="Eskalationsmottagare" description="Aktiva ägare och administratörer som får eskaleringar tillsammans med ansvarig användare.">
          {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}
          {!loading && data?.recipients.length === 0 ? <EmptyState title="Inga mottagare" description="Aktiva ägare och administratörer visas här." /> : null}
          {data?.recipients.length ? <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">{data.recipients.map((recipient) => <div key={recipient.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-semibold text-ink-900">{recipient.name || recipient.email}</p><p className="mt-1 truncate text-sm text-ink-500">{recipient.email}</p></div><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600"><Users className="h-3.5 w-3.5" />{recipient.role === "owner" ? "Ägare" : "Administratör"}</span></div>)}</div> : null}
        </Panel>
      </div>

      <Panel title="Uppgifter som kräver eskalering" description="Senaste ansvarstilldelningen används. Slutförda uppgifter visas inte.">
        {loading && !data ? <div className="h-52 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data?.assignments.length === 0 ? <EmptyState title="Inga aktiva eskaleringar" description="Blockerade uppgifter och passerade deadlines visas här automatiskt." /> : null}
        {data?.assignments.length ? <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">{data.assignments.map((item) => <div key={item.notificationKey} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink-950">{item.componentName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.reason === "blocked" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{item.reason === "blocked" ? "Blockerad" : "Deadline passerad"}</span></div><p className="mt-1 text-sm text-ink-500">{item.propertyName}</p>{item.note ? <p className="mt-2 text-sm text-ink-600">{item.note}</p> : null}</div><div className="text-sm text-ink-600"><p><span className="font-semibold text-ink-800">Ansvarig:</span> {item.assigneeName || "Ej angiven"}</p><p className="mt-1"><span className="font-semibold text-ink-800">Deadline:</span> {item.deadline ? dateOnly.format(new Date(item.deadline)) : "Ingen"}</p></div><Link href={item.href} className="rounded-lg bg-petroleum-800 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-petroleum-900">Öppna komponent</Link></div>)}</div> : null}
      </Panel>

      <Panel title="Eskaleringshistorik" description="De senaste automatiska leveransförsöken för organisationen.">
        {!loading && data?.events.length === 0 ? <EmptyState title="Ingen historik ännu" description="När eskaleringsmotorn körs visas resultatet här." /> : null}
        {data?.events.length ? <div className="overflow-x-auto rounded-xl border border-sand-200"><table className="min-w-full divide-y divide-sand-100 text-sm"><thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-400"><tr><th className="px-5 py-3">Tidpunkt</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Orsak</th><th className="px-5 py-3">Körningsnyckel</th></tr></thead><tbody className="divide-y divide-sand-100">{data.events.map((event) => { const reason = typeof event.payload?.reason === "string" ? event.payload.reason : "–"; return <tr key={event.id}><td className="px-5 py-4 font-medium text-ink-700">{dateTime.format(new Date(event.created_at))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${event.status === "sent" ? "bg-emerald-50 text-emerald-800" : event.status === "failed" ? "bg-red-50 text-red-700" : "bg-sand-100 text-ink-600"}`}>{statusLabels[event.status] || event.status}</span></td><td className="px-5 py-4 text-ink-600">{reason === "blocked" ? "Blockerad" : reason === "overdue_deadline" ? "Deadline passerad" : reason}</td><td className="max-w-md truncate px-5 py-4 text-ink-500">{event.recipient || "–"}</td></tr>; })}</tbody></table></div> : null}
      </Panel>
    </div>
  );
}
