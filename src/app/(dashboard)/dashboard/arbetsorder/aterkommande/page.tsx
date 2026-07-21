"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type Property = { id: string; name: string; address: string; city: string };
type Schedule = {
  id: string;
  property_id: string;
  property_name: string;
  title: string;
  description: string;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  priority: "low" | "normal" | "high" | "urgent";
  estimated_cost: number | null;
  next_run_at: string;
  active: boolean;
  last_generated_at: string | null;
  last_work_order_id: string | null;
  last_work_order_number: string | null;
};

const frequencyLabel = { weekly: "Varje vecka", monthly: "Varje månad", quarterly: "Varje kvartal", yearly: "Varje år" };
const priorityLabel = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default function RecurringWorkOrdersPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ propertyId: "", title: "", description: "", frequency: "monthly", priority: "normal", estimatedCost: "", nextRunAt: "" });

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/work-orders/recurring", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta scheman");
      setSchedules(body.schedules || []); setProperties(body.properties || []);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta scheman"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const active = schedules.filter((item) => item.active).length;
  const paused = schedules.length - active;
  const dueSoon = useMemo(() => {
    const limit = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return schedules.filter((item) => item.active && new Date(item.next_run_at).getTime() <= limit).length;
  }, [schedules]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/work-orders/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte skapa schemat");
      setForm({ ...form, title: "", description: "", estimatedCost: "" });
      setMessage("Det återkommande schemat har skapats."); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte skapa schemat"); }
    finally { setSaving(false); }
  }

  async function toggle(item: Schedule) {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/work-orders/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleId: item.id, active: !item.active }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte ändra schemat");
      setMessage(item.active ? "Schemat har pausats." : "Schemat har aktiverats."); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte ändra schemat"); }
    finally { setBusyId(null); }
  }

  async function generate(item: Schedule) {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/work-orders/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", scheduleId: item.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte generera arbetsordern");
      setMessage(`Arbetsorder ${body.workOrderNumber || ""} har genererats.`); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte generera arbetsordern"); }
    finally { setBusyId(null); }
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Förebyggande drift" title="Återkommande arbetsordrar" description="Skapa styrda scheman för återkommande tillsyn, service och förebyggande underhåll." action={<button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>} />
    <section className="grid gap-4 sm:grid-cols-3"><MetricCard icon={CheckCircle2} label="Aktiva scheman" value={active} /><MetricCard icon={PauseCircle} label="Pausade" value={paused} /><MetricCard icon={CalendarClock} label="Nästa 7 dagar" value={dueSoon} /></section>
    {error ? <InlineAlert>{error}</InlineAlert> : null}{message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Nytt återkommande schema" description="Definiera vad som ska skapas och när nästa arbetsorder ska planeras.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Fastighet"><select required className={premiumFieldClass} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></Field>
          <Field label="Rubrik"><input required maxLength={180} className={premiumFieldClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. Månadsvis kontroll av undercentral" /></Field>
          <Field label="Arbetsbeskrivning"><textarea required className={premiumTextareaClass} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Beskriv moment, kontrollpunkter och förväntat resultat" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Frekvens"><select className={premiumFieldClass} value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}><option value="weekly">Vecka</option><option value="monthly">Månad</option><option value="quarterly">Kvartal</option><option value="yearly">År</option></select></Field><Field label="Prioritet"><select className={premiumFieldClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="urgent">Akut</option></select></Field></div>
          <Field label="Nästa körning"><input required type="datetime-local" className={premiumFieldClass} value={form.nextRunAt} onChange={(event) => setForm({ ...form, nextRunAt: event.target.value })} /></Field>
          <Field label="Beräknad kostnad exkl. moms"><input type="number" min="0" className={premiumFieldClass} value={form.estimatedCost} onChange={(event) => setForm({ ...form, estimatedCost: event.target.value })} placeholder="0" /></Field>
          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Skapar…" : "Skapa schema"}</button>
        </form>
      </Panel>
      <Panel title="Scheman" description={`${schedules.length} återkommande arbetsflöden`} bodyClassName="p-0">
        {loading && !schedules.length ? <div className="p-8 text-sm text-ink-500">Hämtar scheman…</div> : null}
        {!loading && schedules.length === 0 ? <EmptyState title="Inga återkommande scheman" description="Skapa ett schema för att automatisera återkommande drift och underhåll." /> : null}
        <div className="divide-y divide-sand-100">{schedules.map((item) => <article key={item.id} className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.active ? "bg-petroleum-50 text-petroleum-700" : "bg-sand-100 text-ink-500"}`}>{item.active ? "Aktivt" : "Pausat"}</span><span className="text-xs font-semibold text-ink-400">{frequencyLabel[item.frequency]}</span></div><h3 className="mt-3 text-lg font-semibold text-ink-950">{item.title}</h3><p className="mt-1 text-sm text-ink-500">{item.property_name} · {priorityLabel[item.priority]} prioritet</p><p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-600">{item.description}</p></div><div className="shrink-0 lg:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Nästa körning</p><p className="mt-1 font-semibold text-ink-900">{dateTime.format(new Date(item.next_run_at))}</p><p className="mt-1 text-xs text-ink-400">{item.estimated_cost == null ? "Kostnad saknas" : currency.format(item.estimated_cost)}</p></div></div>
          <div className="mt-5 flex flex-wrap items-center gap-2"><button type="button" disabled={busyId === item.id || !item.active} onClick={() => void generate(item)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-petroleum-700 px-3.5 text-sm font-semibold text-white disabled:opacity-40"><PlayCircle className="h-4 w-4" /> Generera nu</button><button type="button" disabled={busyId === item.id} onClick={() => void toggle(item)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-sand-200 bg-white px-3.5 text-sm font-semibold text-ink-700 disabled:opacity-40">{item.active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}{item.active ? "Pausa" : "Aktivera"}</button>{item.last_work_order_id ? <Link href={`/dashboard/arbetsorder/${item.last_work_order_id}`} className="ml-auto text-sm font-semibold text-petroleum-700 hover:underline">Senaste: {item.last_work_order_number || "arbetsorder"}</Link> : null}</div>
        </article>)}</div>
      </Panel>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>; }
