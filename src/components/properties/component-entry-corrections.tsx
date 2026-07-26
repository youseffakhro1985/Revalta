"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Pencil, Save, X } from "lucide-react";
import { EmptyState, InlineAlert, Panel } from "@/components/dashboard/premium-ui";

type Row = Record<string, unknown>;
type Option = { id: string; title?: string; name?: string; status?: string };
type Kind = "event" | "cost";

const eventTypes: Record<string, string> = { installation: "Installation", commissioning: "Driftsättning", service: "Service", repair: "Reparation", inspection: "Besiktning", warranty: "Garantiärende", damage: "Skada", replacement: "Komponentbyte", shutdown: "Avställning", restart: "Återstart" };
const costTypes: Record<string, string> = { service: "Service", repair: "Reparation", spare_part: "Reservdel", inspection: "Besiktning", contractor: "Entreprenör", investment: "Investering", replacement: "Komponentbyte", other: "Övrigt" };
const text = (row: Row, key: string) => row[key] == null ? "" : String(row[key]);
const dateValue = (value: unknown) => { if (!value) return ""; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); };

export function ComponentEntryCorrections({ propertyId, componentId }: { propertyId: string; componentId: string }) {
  const [events, setEvents] = useState<Row[]>([]);
  const [costs, setCosts] = useState<Row[]>([]);
  const [workOrders, setWorkOrders] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ kind: Kind; row: Row } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [detailResponse, optionsResponse] = await Promise.all([
        fetch(`/api/properties/${propertyId}/components/${componentId}`, { cache: "no-store" }),
        fetch(`/api/properties/${propertyId}/components/${componentId}/link-options`, { cache: "no-store" }),
      ]);
      const detail = await detailResponse.json();
      const options = await optionsResponse.json();
      if (!detailResponse.ok) throw new Error(detail.error || "Kunde inte hämta historiken");
      if (!optionsResponse.ok) throw new Error(options.error || "Kunde inte hämta kopplingsalternativ");
      setEvents(detail.events || []); setCosts(detail.costs || []);
      setWorkOrders(options.workOrders || []); setProjects(options.projects || []);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta historiken"); }
    finally { setLoading(false); }
  }, [propertyId, componentId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setError(""); setSaved("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/${componentId}/entries/${editing.kind}/${text(editing.row, "id")}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte spara korrigeringen");
      setEditing(null); setSaved("Korrigeringen har sparats och registrerats i revisionsloggen.");
      await load(); window.setTimeout(() => setSaved(""), 5000);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte spara korrigeringen"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="h-48 animate-pulse rounded-2xl bg-sand-100" />;

  return (
    <Panel title="Korrigera komponenthistorik" description="Rätta felregistrerade händelser och kostnader utan att förlora revisionsspåret.">
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {saved ? <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><Check className="h-4 w-4" />{saved}</div> : null}
      {editing ? <CorrectionForm editing={editing} workOrders={workOrders} projects={projects} saving={saving} onSubmit={submit} onCancel={() => { setEditing(null); setError(""); }} /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <CorrectionList title="Tekniska händelser" rows={events} kind="event" onEdit={(row) => setEditing({ kind: "event", row })} />
          <CorrectionList title="Kostnadsposter" rows={costs} kind="cost" onEdit={(row) => setEditing({ kind: "cost", row })} />
        </div>
      )}
      <p className="mt-5 border-t border-sand-100 pt-4 text-xs text-ink-400">Poster tas inte bort. Ursprungsvärden och vem som gjorde korrigeringen bevaras i revisionsloggen.</p>
    </Panel>
  );
}

function CorrectionList({ title, rows, kind, onEdit }: { title: string; rows: Row[]; kind: Kind; onEdit: (row: Row) => void }) {
  return <section><h3 className="mb-3 text-sm font-semibold text-ink-900">{title}</h3>{rows.length === 0 ? <EmptyState title="Inga poster att korrigera" /> : <div className="max-h-[430px] divide-y divide-sand-100 overflow-y-auto rounded-xl border border-sand-200">{rows.map((row) => <div key={text(row, "id")} className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{kind === "event" ? text(row, "title") : text(row, "description") || costTypes[text(row, "cost_type")]}</p><p className="mt-1 text-xs text-ink-500">{kind === "event" ? eventTypes[text(row, "event_type")] || text(row, "event_type") : `${costTypes[text(row, "cost_type")] || text(row, "cost_type")} · ${Number(row.amount_ex_vat || 0).toLocaleString("sv-SE")} kr`}</p></div><button type="button" onClick={() => onEdit(row)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:border-petroleum-200 hover:text-petroleum-800"><Pencil className="h-3.5 w-3.5" /> Korrigera</button></div>)}</div>}</section>;
}

function CorrectionForm({ editing, workOrders, projects, saving, onSubmit, onCancel }: { editing: { kind: Kind; row: Row }; workOrders: Option[]; projects: Option[]; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const row = editing.row;
  return <form onSubmit={onSubmit} className="space-y-5">
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Korrigeringsläge:</strong> Ändringen ersätter visade värden men ursprungsvärdena sparas i revisionsloggen.</div>
    {editing.kind === "event" ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Select name="event_type" label="Händelsetyp" options={eventTypes} defaultValue={text(row, "event_type")} required />
        <Field name="event_date" label="Händelsedatum" type="date" defaultValue={dateValue(row.event_date)} required />
        <Field name="next_due_at" label="Nästa planerade datum" type="date" defaultValue={dateValue(row.next_due_at)} />
        <Field name="title" label="Rubrik" defaultValue={text(row, "title")} required maxLength={180} />
        <Field name="provider" label="Leverantör eller utförare" defaultValue={text(row, "provider")} maxLength={200} />
        <Field name="meter_reading" label="Mätarställning" type="number" min="0" step="0.01" defaultValue={text(row, "meter_reading")} />
        <LinkSelect name="work_order_id" label="Arbetsorder" options={workOrders} defaultValue={text(row, "work_order_id")} kind="workOrder" />
        <LinkSelect name="project_id" label="Projekt" options={projects} defaultValue={text(row, "project_id")} kind="project" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Textarea name="description" label="Beskrivning" defaultValue={text(row, "description")} maxLength={4000} /><Textarea name="result" label="Resultat och åtgärd" defaultValue={text(row, "result")} maxLength={2000} /></div>
    </> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Select name="cost_type" label="Kostnadstyp" options={costTypes} defaultValue={text(row, "cost_type")} required />
        <Field name="cost_date" label="Kostnadsdatum" type="date" defaultValue={dateValue(row.cost_date)} required />
        <Field name="supplier" label="Leverantör" defaultValue={text(row, "supplier")} maxLength={200} />
        <Field name="amount_ex_vat" label="Belopp exklusive moms" type="number" min="0" step="0.01" defaultValue={text(row, "amount_ex_vat")} required />
        <Field name="vat_rate" label="Momssats, procent" type="number" min="0" max="100" step="0.01" defaultValue={text(row, "vat_rate") || "25"} required />
        <LinkSelect name="work_order_id" label="Arbetsorder" options={workOrders} defaultValue={text(row, "work_order_id")} kind="workOrder" />
        <LinkSelect name="project_id" label="Projekt" options={projects} defaultValue={text(row, "project_id")} kind="project" />
      </div><Textarea name="description" label="Beskrivning" defaultValue={text(row, "description")} maxLength={2000} />
    </>}
    <div className="flex justify-end gap-2 border-t border-sand-100 pt-5"><button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-semibold text-ink-700"><X className="h-4 w-4" /> Avbryt</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Sparar…" : "Spara korrigering"}</button></div>
  </form>;
}

function Field({ name, label, type = "text", required, min, max, step, defaultValue, maxLength }: { name: string; label: string; type?: string; required?: boolean; min?: string; max?: string; step?: string; defaultValue?: string; maxLength?: number }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}{required ? " *" : ""}</span><input name={name} type={type} required={required} min={min} max={max} step={step} defaultValue={defaultValue} maxLength={maxLength} className="w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-petroleum-400 focus:ring-4 focus:ring-petroleum-50" /></label>; }
function Select({ name, label, options, defaultValue, required }: { name: string; label: string; options: Record<string, string>; defaultValue: string; required?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span><select name={name} defaultValue={defaultValue} required={required} className="w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900">{Object.entries(options).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>; }
function LinkSelect({ name, label, options, defaultValue, kind }: { name: string; label: string; options: Option[]; defaultValue: string; kind: "workOrder" | "project" }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span><select name={name} defaultValue={defaultValue} className="w-full rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900"><option value="">Ingen koppling</option>{options.map((option) => <option key={option.id} value={option.id}>{kind === "workOrder" ? option.title : option.name}{option.status ? ` · ${option.status}` : ""}</option>)}</select></label>; }
function Textarea({ name, label, defaultValue, maxLength }: { name: string; label: string; defaultValue: string; maxLength: number }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span><textarea name={name} rows={4} defaultValue={defaultValue} maxLength={maxLength} className="w-full resize-y rounded-xl border border-sand-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-petroleum-400 focus:ring-4 focus:ring-petroleum-50" /></label>; }
