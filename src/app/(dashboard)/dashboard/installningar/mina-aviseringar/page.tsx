"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellOff, BellRing, CheckCircle2, Clock3, Mail } from "lucide-react";
import { InlineAlert, Panel } from "@/components/dashboard/premium-ui";

type Preferences = { enabled: boolean; overdueOnly: boolean };

type Data = {
  preferences: Preferences;
  updatedAt: string | null;
  email: string;
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default function MyServiceNotificationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({ enabled: true, overdueOnly: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/settings/my-service-notifications", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta dina aviseringsval");
        setData(body);
        setPreferences(body.preferences);
      } catch (value) {
        setError(value instanceof Error ? value.message : "Kunde inte hämta dina aviseringsval");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/settings/my-service-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte spara dina aviseringsval");
      setSuccess(body.message || "Dina aviseringsval är sparade.");
      setData((current) => current ? { ...current, preferences: body.preferences, updatedAt: new Date().toISOString() } : current);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara dina aviseringsval");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-soft space-y-6">
      <header>
        <Link href="/dashboard/installningar" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">← Till inställningar</Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Personliga inställningar</p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Mina serviceaviseringar</h1>
        <p className="mt-3 max-w-3xl text-ink-600">Välj hur du själv vill ta emot organisationens serviceöversikt. Dina val påverkar endast ditt konto.</p>
      </header>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{success}</div> : null}

      <Panel title="E-postaviseringar" description="Personliga val för den dagliga serviceöversikten.">
        {loading ? <div className="h-52 animate-pulse rounded-xl bg-sand-100" /> : (
          <div className="space-y-4">
            <button type="button" onClick={() => setPreferences((current) => ({ ...current, enabled: !current.enabled }))} className={`flex w-full items-start justify-between gap-5 rounded-2xl border p-5 text-left transition ${preferences.enabled ? "border-petroleum-200 bg-petroleum-50/40" : "border-sand-200 bg-sand-50"}`}>
              <div className="flex gap-4">
                <div className={`rounded-xl p-3 ${preferences.enabled ? "bg-petroleum-800 text-white" : "bg-white text-ink-500"}`}>{preferences.enabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</div>
                <div><p className="font-semibold text-ink-950">Ta emot serviceaviseringar</p><p className="mt-1 text-sm leading-6 text-ink-500">Skickas till {data?.email}. Du kan pausa utskicken utan att ändra organisationens inställningar.</p></div>
              </div>
              <span className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ${preferences.enabled ? "bg-emerald-100 text-emerald-800" : "bg-sand-200 text-ink-600"}`}>{preferences.enabled ? "Aktiv" : "Pausad"}</span>
            </button>

            <div className={`rounded-2xl border border-sand-200 p-5 ${!preferences.enabled ? "opacity-50" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-sand-100 p-3 text-petroleum-800"><Clock3 className="h-5 w-5" /></div>
                <div className="flex-1"><p className="font-semibold text-ink-950">Vilka servicepunkter vill du se?</p><p className="mt-1 text-sm text-ink-500">Välj mellan hela organisationens period eller endast sådant som redan är förfallet.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button type="button" disabled={!preferences.enabled} onClick={() => setPreferences((current) => ({ ...current, overdueOnly: false }))} className={`rounded-xl border p-4 text-left transition ${!preferences.overdueOnly ? "border-petroleum-400 bg-petroleum-50" : "border-sand-200 bg-white"}`}><Mail className="h-4 w-4 text-petroleum-700" /><p className="mt-3 font-semibold text-ink-900">Alla kommande</p><p className="mt-1 text-xs leading-5 text-ink-500">Förfallna och kommande servicepunkter inom organisationens valda period.</p></button>
                    <button type="button" disabled={!preferences.enabled} onClick={() => setPreferences((current) => ({ ...current, overdueOnly: true }))} className={`rounded-xl border p-4 text-left transition ${preferences.overdueOnly ? "border-petroleum-400 bg-petroleum-50" : "border-sand-200 bg-white"}`}><Clock3 className="h-4 w-4 text-petroleum-700" /><p className="mt-3 font-semibold text-ink-900">Endast förfallna</p><p className="mt-1 text-xs leading-5 text-ink-500">Du får bara e-post när minst en servicepunkt har passerat sitt datum.</p></button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-xl bg-sand-50 p-4 text-sm text-ink-600 sm:flex-row sm:items-center"><span>{data?.updatedAt ? `Senast ändrad ${dateTime.format(new Date(data.updatedAt))}` : "Standardinställningar används tills du sparar."}</span><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-petroleum-800 px-5 py-3 font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50">{saving ? "Sparar…" : "Spara mina val"}</button></div>
          </div>
        )}
      </Panel>
    </div>
  );
}
