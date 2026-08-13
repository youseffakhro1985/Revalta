"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Mail, RefreshCw, Save, Send, Settings2, Users } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type EventRow = { id: string; type: string; status: string; recipient: string | null; payload: Record<string, unknown> | null; created_at: string };
type Recipient = { id: string; name: string | null; email: string; role: string };
type Preferences = { enabled: boolean; daysAhead: number; roles: string[]; additionalEmails: string[] };
type Data = {
  canManage: boolean;
  currentUserEmail: string;
  configuration: { cronSecret: boolean; emailApiKey: boolean; emailFrom: boolean; appUrl: string };
  preferences: Preferences;
  preferencesUpdatedAt: string | null;
  due: { total: number; overdue: number };
  recipients: Recipient[];
  events: EventRow[];
  statusCounts: Record<string, number>;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const roleLabels: Record<string, string> = { owner: "Ägare", admin: "Administratör", manager: "Förvaltare", property_manager: "Fastighetsförvaltare" };
const statusLabels: Record<string, string> = { sent: "Skickat", failed: "Misslyckat", processing: "Bearbetas", skipped: "Överhoppat" };
const roleOptions = Object.entries(roleLabels);
const defaultPreferences: Preferences = { enabled: true, daysAhead: 30, roles: roleOptions.map(([role]) => role), additionalEmails: [] };

function configurationStatus(data: Data | null) {
  if (!data) return { ready: false, completed: 0 };
  const values = [data.configuration.cronSecret, data.configuration.emailApiKey, data.configuration.emailFrom];
  return { ready: values.every(Boolean), completed: values.filter(Boolean).length };
}

function normalizedEmails(value: string) {
  return Array.from(new Set(value.split(/[\n,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean)));
}

function signature(preferences: Preferences, extraEmails: string) {
  return JSON.stringify({
    enabled: preferences.enabled,
    daysAhead: preferences.daysAhead,
    roles: [...preferences.roles].sort(),
    additionalEmails: normalizedEmails(extraEmails).sort(),
  });
}

export default function ServiceNotificationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [extraEmails, setExtraEmails] = useState("");
  const [savedSignature, setSavedSignature] = useState(signature(defaultPreferences, ""));
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentSignature = useMemo(() => signature(preferences, extraEmails), [preferences, extraEmails]);
  const isDirty = currentSignature !== savedSignature;
  const config = useMemo(() => configurationStatus(data), [data]);
  const emailCount = useMemo(() => normalizedEmails(extraEmails).length, [extraEmails]);
  const formValid = preferences.roles.length > 0 && preferences.daysAhead >= 1 && preferences.daysAhead <= 90 && emailCount <= 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings/service-notifications", { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta aviseringsstatus");
      const loadedPreferences = body.preferences as Preferences;
      const loadedEmails = loadedPreferences.additionalEmails.join("\n");
      setData(body);
      setPreferences(loadedPreferences);
      setExtraEmails(loadedEmails);
      setSavedSignature(signature(loadedPreferences, loadedEmails));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta aviseringsstatus");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  async function sendTest() {
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/settings/service-notifications", { method: "POST" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Testutskicket misslyckades");
      setSuccess(`Testutskicket skickades till ${body.recipient}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Testutskicket misslyckades");
    } finally {
      setSending(false);
    }
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    if (!formValid || !isDirty) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const additionalEmails = normalizedEmails(extraEmails);
    try {
      const response = await fetch("/api/settings/service-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...preferences, additionalEmails }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte spara inställningarna");
      setSuccess("Aviseringsinställningarna är sparade och används vid nästa dagliga körning.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara inställningarna");
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(role: string) {
    setPreferences((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }));
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-in-soft space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/dashboard/installningar" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">← Till inställningar</Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Drift och aviseringar</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Serviceaviseringar</h1>
          <p className="mt-3 max-w-3xl text-ink-600">Styr mottagare och aviseringsperiod, övervaka den dagliga rutinen och verifiera e-postleveransen.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || isDirty} title={isDirty ? "Spara eller återställ ändringarna innan du uppdaterar" : undefined} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
          <button type="button" onClick={() => void sendTest()} disabled={sending || !data?.canManage || !config.ready} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /> {sending ? "Skickar…" : "Skicka test"}</button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{success}</div> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Settings2} label="Konfiguration" value={config.ready ? "Klar" : `${config.completed}/3`} hint={preferences.enabled ? "Aviseringar aktiva" : "Aviseringar pausade"} />
        <MetricCard icon={AlertTriangle} label="Servicebehov" value={data?.due.total ?? "–"} hint={`Inom ${preferences.daysAhead} dagar`} />
        <MetricCard icon={Clock3} label="Förfallen service" value={data?.due.overdue ?? "–"} />
        <MetricCard icon={Users} label="Systemmottagare" value={data?.recipients.length ?? "–"} />
        <MetricCard icon={Mail} label="Skickade körningar" value={data?.statusCounts.sent ?? 0} />
      </div>

      <form onSubmit={savePreferences}>
        <Panel title="Aviseringsinställningar" description="Inställningarna gäller endast den egna organisationen och versionsloggas vid varje ändring.">
          <fieldset disabled={!data?.canManage || saving} className="grid gap-6 disabled:opacity-60 lg:grid-cols-3">
            <div className="space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-sand-200 p-4">
                <input type="checkbox" checked={preferences.enabled} onChange={(event) => setPreferences((current) => ({ ...current, enabled: event.target.checked }))} className="mt-1 h-4 w-4 accent-petroleum-700" />
                <span><span className="block font-semibold text-ink-900">Aktivera dagliga aviseringar</span><span className="mt-1 block text-sm text-ink-500">Pausa utskick utan att ta bort historik eller mottagarval.</span></span>
              </label>
              <div>
                <label htmlFor="days-ahead" className="block text-sm font-semibold text-ink-800">Avisera service inom</label>
                <div className="mt-2 flex items-center gap-3"><input id="days-ahead" type="number" min={1} max={90} required value={preferences.daysAhead} onChange={(event) => setPreferences((current) => ({ ...current, daysAhead: Number(event.target.value) }))} aria-describedby="days-ahead-help" className="w-28 rounded-xl border border-sand-200 px-3 py-2.5" /><span className="text-sm text-ink-500">dagar</span></div>
                <p id="days-ahead-help" className="mt-2 text-xs text-ink-500">Tillåtet intervall: 1–90 dagar.</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink-800">Roller som ska få utskick</p>
              <div className="mt-3 space-y-2">{roleOptions.map(([role, label]) => <label key={role} className="flex items-center gap-3 rounded-xl border border-sand-200 px-4 py-3"><input type="checkbox" checked={preferences.roles.includes(role)} onChange={() => toggleRole(role)} className="h-4 w-4 accent-petroleum-700" /><span className="text-sm font-medium text-ink-700">{label}</span></label>)}</div>
              <p className={`mt-2 text-xs ${preferences.roles.length ? "text-ink-500" : "font-semibold text-red-700"}`}>{preferences.roles.length ? "Minst en roll måste vara vald." : "Välj minst en mottagarroll för att kunna spara."}</p>
            </div>

            <div>
              <label htmlFor="extra-emails" className="block text-sm font-semibold text-ink-800">Extra e-postmottagare</label>
              <textarea id="extra-emails" rows={7} value={extraEmails} onChange={(event) => setExtraEmails(event.target.value)} placeholder="teknik@foretag.se\njour@foretag.se" aria-describedby="extra-emails-help" className="mt-3 w-full rounded-xl border border-sand-200 px-3 py-3 text-sm" />
              <p id="extra-emails-help" className={`mt-2 text-xs ${emailCount > 20 ? "font-semibold text-red-700" : "text-ink-500"}`}>{emailCount}/20 adresser. Dubbletter tas bort automatiskt.</p>
            </div>
          </fieldset>
          <div className="mt-6 flex flex-col justify-between gap-3 border-t border-sand-100 pt-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs text-ink-500">Senast ändrad: {data?.preferencesUpdatedAt ? dateTime.format(new Date(data.preferencesUpdatedAt)) : "Standardinställningar används"}</p>
              <p className={`mt-1 text-xs font-semibold ${isDirty ? "text-amber-700" : "text-emerald-700"}`}>{isDirty ? "Du har osparade ändringar" : "Alla ändringar är sparade"}</p>
            </div>
            <button type="submit" disabled={!data?.canManage || saving || !formValid || !isDirty} className="inline-flex items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Sparar…" : "Spara inställningar"}</button>
          </div>
        </Panel>
      </form>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Driftkonfiguration" description="Säker kontroll av nödvändiga produktionsvariabler.">
          <div className="space-y-3">{[["CRON_SECRET", data?.configuration.cronSecret, "Skyddar den schemalagda endpointen"], ["EMAIL_PROVIDER_API_KEY", data?.configuration.emailApiKey, "Ansluter Revalta till e-postleverantören"], ["EMAIL_FROM", data?.configuration.emailFrom, "Verifierad avsändaradress"]].map(([label, enabled, description]) => <div key={String(label)} className="flex items-start justify-between gap-4 rounded-xl border border-sand-200 p-4"><div><p className="font-semibold text-ink-900">{String(label)}</p><p className="mt-1 text-sm text-ink-500">{String(description)}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{enabled ? "Aktiv" : "Saknas"}</span></div>)}</div>
        </Panel>
        <Panel title="Aktiva systemmottagare" description="Användare som matchar valda roller.">
          {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}
          {!loading && data?.recipients.length === 0 ? <EmptyState title="Inga systemmottagare" description="Välj roller med aktiva användare eller lägg till extra e-postmottagare." /> : null}
          {data?.recipients.length ? <div className="overflow-hidden rounded-xl border border-sand-200"><div className="divide-y divide-sand-100">{data.recipients.map((recipient) => <div key={recipient.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-semibold text-ink-900">{recipient.name || recipient.email}</p><p className="mt-1 truncate text-sm text-ink-500">{recipient.email}</p></div><span className="shrink-0 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600">{roleLabels[recipient.role] || recipient.role}</span></div>)}</div></div> : null}
        </Panel>
      </div>

      <Panel title="Körningshistorik" description="De senaste automatiska och manuella aviseringsförsöken.">
        {loading && !data ? <div className="h-48 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data?.events.length === 0 ? <EmptyState title="Ingen körningshistorik ännu" description="Automatiska utskick och testutskick loggas här." /> : null}
        {data?.events.length ? <div className="overflow-x-auto rounded-xl border border-sand-200"><table className="min-w-full divide-y divide-sand-100 text-sm"><thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-5 py-3">Tidpunkt</th><th className="px-5 py-3">Typ</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Mottagare / körning</th></tr></thead><tbody className="divide-y divide-sand-100">{data.events.map((event) => <tr key={event.id}><td className="px-5 py-4 font-medium text-ink-700">{dateTime.format(new Date(event.created_at))}</td><td className="px-5 py-4 text-ink-600">{event.type === "component_service_test" ? "Testutskick" : "Daglig sammanställning"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${event.status === "sent" ? "bg-emerald-50 text-emerald-800" : event.status === "failed" ? "bg-red-50 text-red-700" : "bg-sand-100 text-ink-600"}`}>{statusLabels[event.status] || event.status}</span></td><td className="max-w-md truncate px-5 py-4 text-ink-500">{event.recipient || "–"}</td></tr>)}</tbody></table></div> : null}
      </Panel>
    </div>
  );
}
