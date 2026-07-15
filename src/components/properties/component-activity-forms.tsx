"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarPlus, CircleDollarSign, Save } from "lucide-react";
import { InlineAlert, Panel } from "@/components/dashboard/premium-ui";

const eventTypes: Record<string, string> = {
  installation: "Installation", commissioning: "Driftsättning", service: "Service", repair: "Reparation",
  inspection: "Besiktning", warranty: "Garantiärende", damage: "Skada", replacement: "Komponentbyte",
  shutdown: "Avställning", restart: "Återstart",
};
const costTypes: Record<string, string> = {
  service: "Service", repair: "Reparation", spare_part: "Reservdel", inspection: "Besiktning",
  contractor: "Entreprenör", investment: "Investering", replacement: "Komponentbyte", other: "Övrigt",
};
const today = () => new Date().toISOString().slice(0, 10);

type WorkOrderOption = { id: string; title: string; status: string; priority: string };
type ProjectOption = { id: string; name: string; status: string; risk: string };

export function ComponentActivityForms({ propertyId, componentId }: { propertyId: string; componentId: string }) {
  const [tab, setTab] = useState<"event" | "cost">("event");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadLinks() {
      setLoadingLinks(true); setLinkError("");
      try {
        const response = await fetch(`/api/properties/${propertyId}/components/${componentId}/link-options`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta arbetsordrar och projekt");
        if (!cancelled) { setWorkOrders(body.workOrders || []); setProjects(body.projects || []); }
      } catch (value) {
        if (!cancelled) setLinkError(value instanceof Error ? value.message : "Kunde inte hämta kopplingar");
      } finally { if (!cancelled) setLoadingLinks(false); }
    }
    void loadLinks();
    return () => { cancelled = true; };
  }, [propertyId, componentId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.action = tab;
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/${componentId}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte registrera uppgifterna");
      setSuccess(tab === "event" ? "Händelsen har registrerats." : "Kostnaden har registrerats.");
      event.currentTarget.reset();
      window.setTimeout(() => window.location.reload(), 900);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte registrera uppgifterna"); }
    finally { setSaving(false); }
  }

  return (
    <Panel title="Registrera komponentaktivitet" description="Lägg till tekniska händelser och kostnader med full historik och revisionsspår.">
      <div className="mb-5 flex w-fit rounded-xl border border-sand-200 bg-sand-50 p-1">
        <button type="button" onClick={() => { setTab("event"); setError(""); setSuccess(""); }} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === "event" ? "bg-white text-petroleum-800 shadow-sm" : "text-ink-500"}`}>Händelse</button>
        <button type="button" onClick={() => { setTab("cost"); setError(""); setSuccess(""); }} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === "cost" ? "bg-white text-petroleum-800 shadow-sm" : "text-ink-500"}`}>Kostnad</button>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {linkError ? <InlineAlert>{linkError}</InlineAlert> : null}
        {success ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div> : null}

        {tab === "event" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Select name="event_type" label="Händelsetyp" options={eventTypes} required />
              <Field name="event_date" label="Händelsedatum" type="date" defaultValue={today()} required />
              <Field name="next_due_at" label="Nästa planerade datum" type="date" />
              <Field name="title" label="Rubrik" required maxLength={180} />
              <Field name="provider" label="Leverantör eller utförare" maxLength={200} />
              <Field name="meter_reading" label="Mätarställning" type="number" min="0" step="0.01" />
              <LinkSelect name="work_order_id" label="Koppla arbetsorder" loading={loadingLinks} options={workOrders.map((item) => ({ value: item.id, label: `${item.title} · ${item.status}` }))} />
              <LinkSelect name="project_id" label="Koppla projekt" loading={loadingLinks} options={projects.map((item) => ({ value: item.id, label: `${item.name} · ${item.status}` }))} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Textarea name="description" label="Beskrivning" maxLength={4000} />
              <Textarea name="result" label="Resultat och åtgärd" maxLength={2000} />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Select name="cost_type" label="Kostnadstyp" options={costTypes} required />
              <Field name="cost_date" label="Kostnadsdatum" type="date" defaultValue={today()} required />
              <Field name="supplier" label="Leverantör" maxLength={200} />
              <Field name="amount_ex_vat" label="Belopp exklusive moms" type="number" min="0" step="0.01" required />
              <Field name="vat_rate" label="Momssats, procent" type="number" min="0" max="100" step="0.01" defaultValue="25" required />
              <LinkSelect name="work_order_id" label="Koppla arbetsorder" loading={loadingLinks} options={workOrders.map((item) => ({ value: item.id, label: `${item.title} · ${item.status}` }))} />
              <LinkSelect name="project_id" label="Koppla projekt" loading={loadingLinks} options={projects.map((item) => ({ value: item.id, label: `${item.name} · ${item.status}` }))} />
            </div>
            <Textarea name="description" label="Beskrivning" maxLength={2000} />
          </>
        )}

        <div className="flex flex-col justify-between gap-3 border-t border-sand-100 pt-5 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-400">Registreringen kopplas till komponenten och sparas i revisionsloggen. Koppling till arbetsorder eller projekt är valfri.</p>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-petroleum-900 disabled:opacity-50">
            {tab === "event" ? <CalendarPlus className="h-4 w-4" /> : <CircleDollarSign className="h-4 w-4" />}
            <Save className="hidden h-4 w-4" /> {saving ? "Sparar…" : tab === "event" ? "Registrera händelse" : "Registrera kostnad"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Field({ name, label, type = "text", required, min, max, step, defaultValue, maxLength }: { name: string; label: string; type?: string; required?: boolean; min?: string; max?: string; step?: string; defaultValue?: string; maxLength?: number }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}{required ? " *" : ""}</span><input name={name} type={type} required={required} min={min} max={max} step={step} defaultValue={defaultValue} maxLength={maxLength} className="w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-400 focus:ring-4 focus:ring-petroleum-50" /></label>;
}
function Select({ name, label, options, required }: { name: string; label: string; options: Record<string, string>; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}{required ? " *" : ""}</span><select name={name} required={required} className="w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-400 focus:ring-4 focus:ring-petroleum-50">{Object.entries(options).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>;
}
function LinkSelect({ name, label, loading, options }: { name: string; label: string; loading: boolean; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span><select name={name} disabled={loading} className="w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-400 focus:ring-4 focus:ring-petroleum-50 disabled:bg-sand-50 disabled:text-ink-400"><option value="">{loading ? "Laddar…" : "Ingen koppling"}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
function Textarea({ name, label, maxLength }: { name: string; label: string; maxLength: number }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span><textarea name={name} rows={4} maxLength={maxLength} className="w-full resize-y rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition focus:border-petroleum-400 focus:ring-4 focus:ring-petroleum-50" /></label>;
}
