"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Mail, RefreshCw, Send, Settings2, Users } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type EventRow = {
  id: string;
  type: string;
  status: string;
  recipient: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type Recipient = { id: string; name: string | null; email: string; role: string };
type Data = {
  canManage: boolean;
  currentUserEmail: string;
  configuration: { cronSecret: boolean; emailApiKey: boolean; emailFrom: boolean; appUrl: string };
  due: { total: number; overdue: number };
  recipients: Recipient[];
  events: EventRow[];
  statusCounts: Record<string, number>;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const roleLabels: Record<string, string> = { owner: "Ägare", admin: "Administratör", manager: "Förvaltare", property_manager: "Fastighetsförvaltare" };
const statusLabels: Record<string, string> = { sent: "Skickat", failed: "Misslyckat", processing: "Bearbetas", skipped: "Överhoppat" };

function configurationStatus(data: Data | null) {
  if (!data) return { ready: false, completed: 0 };
  const values = [data.configuration.cronSecret, data.configuration.emailApiKey, data.configuration.emailFrom];
  return { ready: values.every(Boolean), completed: values.filter(Boolean).length };
}

export default function ServiceNotificationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta aviseringsstatus");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta aviseringsstatus");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const config = useMemo(() => configurationStatus(data), [data]);

  async function sendTest() {
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/settings/service-notifications", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Testutskicket misslyckades");
      setSuccess(`Testutskicket skickades till ${body.recipient}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Testutskicket misslyckades");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-in-soft space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/dashboard/installningar" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">← Till inställningar</Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift och aviseringar</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Serviceaviseringar</h1>
          <p className="mt-3 max-w-3xl text-ink-600">Övervaka den dagliga servicerutinen, kontrollera mottagare och verifiera e-postleveransen.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
          <button type="button" onClick={() => void sendTest()} disabled={sending || !data?.canManage || !config.ready} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /> {sending ? "Skickar…" : "Skicka test"}</button>
        </div>
      </div>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{success}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Settings2} label="Konfiguration" value={config.ready ? "Klar" : `${config.completed}/3`} hint={config.ready ? "Redo för utskick" : "Åtgärd krävs"} />
        <MetricCard icon={AlertTriangle} label="Servicebehov" value={data?.due.total ?? "–"} hint="Inom 30 dagar" />
        <MetricCard icon={Clock3} label="Förfallen service" value={data?.due.overdue ?? "–"} />
        <MetricCard icon={Users} label="Mottagare" value={data?.recipients.length ?? "–"} />
        <MetricCard icon={Mail} label="Skickade körningar" value={data?.statusCounts.sent ?? 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Driftkonfiguration" description="Säker kontroll av att nödvändiga produktionsvariabler är aktiverade.">
          <div className="space-y-3">
            {[
              ["CRON_SECRET", data?.configuration.cronSecret, "Skyddar den schemalagda endpointen"],
              ["EMAIL_PROVIDER_API_KEY", data?.configuration.emailApiKey, "Ansluter Revalta till e-postleverantören"],
              ["EMAIL_FROM", data?.configuration.emailFrom, "Verifierad avsändaradress"],
            ].map(([label, enabled, description]) => (
              <div key={String(label)} className="flex items-start justify-between gap-4 rounded-xl border border-sand-200 p-4">
                <div><p className="font-semibold text-ink-900">{String(label)}</p><p className="mt-1 text-sm text-ink-500">{String(description)}</p></div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{enabled ? "Aktiv" : "Saknas"}</span>
              </div>
            ))}
            <div className="rounded-xl bg-sand-50 p-4 text-sm text-ink-600"><span className="font-semibold text-ink-800">Applikationsadress:</span> {data?.configuration.appUrl || "–"}</div>
            {!data?.canManage ? <p className="text-sm text-ink-500">Endast ägare och administratörer kan skicka testutskick.</p> : null}
          </div>
        </Panel>

        <Panel title="Aktiva mottagare" description="Användare som får den dagliga serviceöversikten.">
          {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}
          {!loading && data?.recipients.length === 0 ? <EmptyState title="Inga mottagare" description="Aktiva ägare, administratörer och förvaltare visas här." /> : null}
          {data?.recipients.length ? <div className="overflow-hidden rounded-xl border border-sand-200"><div className="divide-y divide-sand-100">{data.recipients.map((recipient) => <div key={recipient.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-semibold text-ink-900">{recipient.name || recipient.email}</p><p className="mt-1 truncate text-sm text-ink-500">{recipient.email}</p></div><span className="shrink-0 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600">{roleLabels[recipient.role] || recipient.role}</span></div>)}</div></div> : null}
        </Panel>
      </div>

      <Panel title="Körningshistorik" description="De senaste automatiska och manuella aviseringsförsöken.">
        {loading && !data ? <div className="h-48 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data?.events.length === 0 ? <EmptyState title="Ingen körningshistorik ännu" description="Automatiska utskick och testutskick loggas här." /> : null}
        {data?.events.length ? <div className="overflow-x-auto rounded-xl border border-sand-200"><table className="min-w-full divide-y divide-sand-100 text-sm"><thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-400"><tr><th className="px-5 py-3">Tidpunkt</th><th className="px-5 py-3">Typ</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Mottagare / körning</th></tr></thead><tbody className="divide-y divide-sand-100">{data.events.map((event) => <tr key={event.id}><td className="px-5 py-4 font-medium text-ink-700">{dateTime.format(new Date(event.created_at))}</td><td className="px-5 py-4 text-ink-600">{event.type === "component_service_test" ? "Testutskick" : "Daglig sammanställning"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${event.status === "sent" ? "bg-emerald-50 text-emerald-800" : event.status === "failed" ? "bg-red-50 text-red-700" : "bg-sand-100 text-ink-600"}`}>{statusLabels[event.status] || event.status}</span></td><td className="max-w-md truncate px-5 py-4 text-ink-500">{event.recipient || "–"}</td></tr>)}</tbody></table></div> : null}
      </Panel>
    </div>
  );
}
