"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Settings = {
  name: string;
  next_service_at: string | null;
  service_interval_months: number;
  service_lead_days: number;
  auto_create_service_work_orders: boolean;
  last_service_work_order_id?: string | null;
  last_service_work_order_number?: string | null;
  last_service_completed_at?: string | null;
  maintenance_cycle_advanced_at?: string | null;
  last_service_cycle_key?: string | null;
};

const displayDate = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

function dateInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "–" : displayDate.format(parsed);
}

export function ComponentMaintenanceSettings({ propertyId, componentId }: { propertyId: string; componentId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ nextServiceAt: "", serviceIntervalMonths: "12", serviceLeadDays: "30", autoCreateServiceWorkOrders: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/${componentId}/maintenance-settings`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta underhållsinställningar");
      const value = payload.settings as Settings;
      setSettings(value);
      setForm({ nextServiceAt: dateInput(value.next_service_at), serviceIntervalMonths: String(value.service_interval_months), serviceLeadDays: String(value.service_lead_days), autoCreateServiceWorkOrders: value.auto_create_service_work_orders });
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta underhållsinställningar"); }
    finally { setLoading(false); }
  }, [componentId, propertyId]);

  useEffect(() => { void load(); }, [load]);
  const dirty = useMemo(() => settings ? JSON.stringify(form) !== JSON.stringify({ nextServiceAt: dateInput(settings.next_service_at), serviceIntervalMonths: String(settings.service_interval_months), serviceLeadDays: String(settings.service_lead_days), autoCreateServiceWorkOrders: settings.auto_create_service_work_orders }) : false, [form, settings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/${componentId}/maintenance-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte spara underhållsinställningar");
      await load();
      setSaved(true); window.setTimeout(() => setSaved(false), 4000);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte spara underhållsinställningar"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="h-56 animate-pulse rounded-2xl bg-sand-100" />;
  if (!settings) return <InlineAlert>{error || "Underhållsinställningarna kunde inte laddas."}</InlineAlert>;

  return (
    <Panel title="Förebyggande underhåll" description="Styr servicecykel, framförhållning och automatisk skapning av planerade arbetsorder.">
      <form onSubmit={submit} className="space-y-5">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {saved ? <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Inställningarna är sparade</div> : null}

        <div className="grid gap-4 rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:grid-cols-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Senast genomförd service</p><p className="mt-2 text-sm font-semibold text-ink-900">{formatDate(settings.last_service_completed_at)}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Servicecykel flyttad</p><p className="mt-2 text-sm font-semibold text-ink-900">{formatDate(settings.maintenance_cycle_advanced_at)}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Nästa service</p><p className="mt-2 text-sm font-semibold text-petroleum-800">{formatDate(settings.next_service_at)}</p></div>
          {settings.last_service_work_order_id ? <div className="sm:col-span-3 border-t border-sand-200 pt-3"><Link href={`/dashboard/arbetsorder/${settings.last_service_work_order_id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-800 hover:text-petroleum-950">{settings.last_service_work_order_number || "Öppna avslutad arbetsorder"}<ExternalLink className="h-4 w-4" /></Link></div> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Nästa service</span><input type="date" value={form.nextServiceAt} onChange={(event) => setForm((current) => ({ ...current, nextServiceAt: event.target.value }))} className={premiumFieldClass} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Intervall, månader</span><input type="number" min="1" max="120" value={form.serviceIntervalMonths} onChange={(event) => setForm((current) => ({ ...current, serviceIntervalMonths: event.target.value }))} className={premiumFieldClass} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Framförhållning, dagar</span><input type="number" min="0" max="365" value={form.serviceLeadDays} onChange={(event) => setForm((current) => ({ ...current, serviceLeadDays: event.target.value }))} className={premiumFieldClass} /></label>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-sand-200 bg-sand-50 p-4"><input type="checkbox" checked={form.autoCreateServiceWorkOrders} onChange={(event) => setForm((current) => ({ ...current, autoCreateServiceWorkOrders: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-sand-300 text-petroleum-700" /><span><span className="block text-sm font-semibold text-ink-900">Skapa arbetsorder automatiskt</span><span className="mt-1 block text-sm text-ink-500">Revalta skapar en förebyggande arbetsorder när servicedatumet når vald framförhållning. Dubbletter förhindras per servicecykel.</span></span></label>
        <div className="flex flex-col gap-3 border-t border-sand-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="inline-flex items-center gap-2 text-xs text-ink-400"><CalendarClock className="h-4 w-4" /> Ändringar registreras i revisionsloggen.</p><button type="submit" disabled={saving || !dirty} className={premiumPrimaryButtonClass}><RefreshCw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} /> {saving ? "Sparar…" : "Spara underhållsplan"}</button></div>
      </form>
    </Panel>
  );
}
