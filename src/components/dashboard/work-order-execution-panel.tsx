"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Clock3, Info, Package, Route, Square, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type ChecklistItem = {
  id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  completed_at: string | null;
};

type ExecutionEntry = {
  id: string;
  entry_type: "time" | "material" | "travel" | "external";
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  total_amount: number;
  minutes: number | null;
  distance_km: number | null;
  supplier: string | null;
  occurred_at: string;
};

type Summary = {
  total_minutes: number;
  material_cost: number;
  travel_cost: number;
  external_cost: number;
  total_cost: number;
};

type Completion = {
  status: string;
  before_photo_count: number;
  after_photo_count: number;
};

type Props = { workOrderId: string };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const typeLabels: Record<string, string> = { time: "Arbetstid", material: "Material", travel: "Resa", external: "Extern kostnad" };

export function WorkOrderExecutionPanel({ workOrderId }: Props) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [entries, setEntries] = useState<ExecutionEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_minutes: 0, material_cost: 0, travel_cost: 0, external_cost: 0, total_cost: 0 });
  const [completion, setCompletion] = useState<Completion>({ status: "planned", before_photo_count: 0, after_photo_count: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const endpoint = `/api/work-orders/${workOrderId}/execution`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsorderregistreringar");
      setChecklist(data.checklist || []);
      setEntries(data.entries || []);
      setSummary(data.summary || { total_minutes: 0, material_cost: 0, travel_cost: 0, external_cost: 0, total_cost: 0 });
      setCompletion(data.completion || { status: data.workOrder?.status || "planned", before_photo_count: 0, after_photo_count: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsorderregistreringar");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function post(payload: Record<string, unknown>, message: string, reset?: () => void) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara registreringen");
      reset?.();
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara registreringen");
    } finally {
      setSaving(false);
    }
  }

  const completed = checklist.filter((item) => item.completed_at).length;
  const requiredIncomplete = checklist.filter((item) => item.is_required && !item.completed_at).length;
  const hours = Math.floor(summary.total_minutes / 60);
  const minutes = summary.total_minutes % 60;
  const isCompleted = completion.status === "completed";
  const canFinalize = requiredIncomplete === 0 && completion.after_photo_count > 0 && !isCompleted;

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar arbetsorderutförande" />;

  return <div className="space-y-6" aria-busy={saving}>
    <div aria-live="polite" aria-atomic="true">
      {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    </div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sammanfattning av arbetsorderutförande">
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Checklista</p><p className="mt-2 text-2xl font-semibold text-ink-950">{completed}/{checklist.length}</p><p className="mt-1 text-xs text-ink-400">{requiredIncomplete} obligatoriska återstår</p></div><CheckCircle2 className="h-5 w-5 text-petroleum-700" aria-hidden="true" /></div></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Rapporterad tid</p><p className="mt-2 text-2xl font-semibold text-ink-950">{hours} h {minutes} min</p></div><Clock3 className="h-5 w-5 text-petroleum-700" aria-hidden="true" /></div></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Registrerat utfall</p><p className="mt-2 text-2xl font-semibold text-ink-950">{money.format(summary.total_cost)}</p></div><Banknote className="h-5 w-5 text-petroleum-700" aria-hidden="true" /></div></article>
      <article className="rounded-2xl border border-sand-200 bg-sand-50 p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-ink-500">Bilddokumentation</p><p className="mt-2 text-2xl font-semibold text-ink-950">{completion.before_photo_count} / {completion.after_photo_count}</p><p className="mt-1 text-xs text-ink-400">Före / efter</p></div><Info className="h-5 w-5 text-petroleum-700" aria-hidden="true" /></div></article>
    </section>

    <Panel title="Slutkontroll" description="Arbetsordern kan avslutas först när kvalitetskraven är uppfyllda.">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`rounded-2xl border p-4 ${requiredIncomplete === 0 ? "border-petroleum-200 bg-petroleum-50 text-petroleum-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><p className="text-xs font-semibold uppercase tracking-wide">Kontrollpunkter</p><p className="mt-2 text-sm font-semibold">{requiredIncomplete === 0 ? "Alla obligatoriska klara" : `${requiredIncomplete} återstår`}</p></div>
        <div className={`rounded-2xl border p-4 ${completion.after_photo_count > 0 ? "border-petroleum-200 bg-petroleum-50 text-petroleum-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><p className="text-xs font-semibold uppercase tracking-wide">Bilddokumentation</p><p className="mt-2 text-sm font-semibold">{completion.before_photo_count} före · {completion.after_photo_count} efter</p></div>
        <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4 text-ink-700"><p className="text-xs font-semibold uppercase tracking-wide">Faktiskt utfall</p><p className="mt-2 text-sm font-semibold">{money.format(summary.total_cost)}</p></div>
      </div>
      <button type="button" disabled={!canFinalize || saving} onClick={() => void post({ action: "completion.finalize" }, "Arbetsordern har slutförts och kostnadsutfallet har uppdaterats.")} className={`${premiumPrimaryButtonClass} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50`} aria-describedby="completion-help">{isCompleted ? "Arbetsordern är slutförd" : saving ? "Slutför…" : "Godkänn och slutför arbetsorder"}</button>
      <p id="completion-help" className="mt-2 text-xs text-ink-500">{isCompleted ? "Registreringarna är låsta eftersom arbetsordern är avslutad." : canFinalize ? "Alla krav är uppfyllda." : "Slutför checklistan och ladda upp minst en efterbild i dokumentpanelen."}</p>
    </Panel>

    <Panel title="Checklista" description="Kontrollpunkter som ska vara klara innan arbetsordern avslutas.">
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void post({ action: "checklist.create", title: data.get("title"), description: data.get("description"), isRequired: data.get("isRequired") === "on" }, "Kontrollpunkten har lagts till.", () => form.reset()); }} className="grid gap-3 rounded-2xl border border-sand-200 bg-sand-50/70 p-4 sm:grid-cols-2">
        <input name="title" required placeholder="Ny kontrollpunkt" aria-label="Rubrik för ny kontrollpunkt" disabled={isCompleted} className={premiumFieldClass} />
        <input name="description" placeholder="Beskrivning eller krav" aria-label="Beskrivning av kontrollpunkt" disabled={isCompleted} className={premiumFieldClass} />
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-600"><input name="isRequired" type="checkbox" defaultChecked disabled={isCompleted} className="h-4 w-4 rounded border-sand-300" />Obligatorisk</label>
        <button disabled={saving || isCompleted} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Lägg till"}</button>
      </form>
      <div className="mt-4 space-y-3">
        {checklist.length === 0 ? <EmptyState title="Ingen checklista ännu" description="Lägg till kontrollpunkter för kvalitetssäkring och avslut." /> : checklist.map((item) => <button key={item.id} type="button" disabled={saving || isCompleted} onClick={() => void post({ action: "checklist.complete", itemId: item.id, completed: !item.completed_at }, item.completed_at ? "Kontrollpunkten har återöppnats." : "Kontrollpunkten är klar.")} aria-pressed={Boolean(item.completed_at)} className="flex min-h-14 w-full items-start gap-3 rounded-2xl border border-sand-200 bg-white p-4 text-left transition hover:border-petroleum-200 hover:bg-petroleum-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-500 disabled:opacity-60">
          {item.completed_at ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-petroleum-700" aria-hidden="true" /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-ink-300" aria-hidden="true" />}
          <span className="min-w-0"><span className={`block text-sm font-semibold ${item.completed_at ? "text-ink-400 line-through" : "text-ink-900"}`}>{item.title}</span>{item.description ? <span className="mt-1 block text-xs leading-5 text-ink-500">{item.description}</span> : null}{item.is_required ? <span className="mt-2 inline-block rounded-full bg-sand-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Obligatorisk</span> : null}</span>
        </button>)}
      </div>
    </Panel>

    <Panel title="Registrera arbete och kostnader" description="Tid, material, resor och externa kostnader summeras automatiskt till arbetsorderns faktiska utfall.">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {([
          { type: "time", title: "Arbetstid", icon: Clock3, fields: "time" },
          { type: "material", title: "Material", icon: Package, fields: "cost" },
          { type: "travel", title: "Resa", icon: Route, fields: "travel" },
          { type: "external", title: "Extern kostnad", icon: Wrench, fields: "external" },
        ] as const).map((card) => { const Icon = card.icon; return <form key={card.type} onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void post({ action: "entry.create", entryType: card.type, description: data.get("description"), minutes: data.get("minutes"), quantity: data.get("quantity"), unit: data.get("unit"), unitCost: data.get("unitCost"), totalAmount: data.get("totalAmount"), distanceKm: data.get("distanceKm"), supplier: data.get("supplier") }, `${card.title} har registrerats.`, () => form.reset()); }} className="rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm">
          <div className="mb-4 flex items-center gap-2"><span className="rounded-xl bg-petroleum-50 p-2 text-petroleum-700"><Icon className="h-4 w-4" aria-hidden="true" /></span><h3 className="font-semibold text-ink-900">{card.title}</h3></div>
          <div className="space-y-3"><input name="description" required placeholder="Beskrivning" aria-label={`${card.title}: beskrivning`} disabled={isCompleted} className={premiumFieldClass} />
            {card.fields === "time" ? <input name="minutes" type="number" min="1" required placeholder="Minuter" aria-label="Arbetstid i minuter" disabled={isCompleted} className={premiumFieldClass} /> : null}
            {card.fields === "cost" ? <><div className="grid grid-cols-2 gap-2"><input name="quantity" type="number" min="0" step="0.01" defaultValue="1" placeholder="Antal" aria-label="Materialantal" disabled={isCompleted} className={premiumFieldClass} /><input name="unit" placeholder="Enhet" aria-label="Materialenhet" disabled={isCompleted} className={premiumFieldClass} /></div><input name="unitCost" type="number" min="0" step="0.01" placeholder="Pris per enhet" aria-label="Pris per materialenhet" disabled={isCompleted} className={premiumFieldClass} /></> : null}
            {card.fields === "travel" ? <><input name="distanceKm" type="number" min="0" step="0.1" placeholder="Kilometer" aria-label="Ressträcka i kilometer" disabled={isCompleted} className={premiumFieldClass} /><input name="totalAmount" type="number" min="0" step="0.01" placeholder="Resekostnad" aria-label="Resekostnad" disabled={isCompleted} className={premiumFieldClass} /></> : null}
            {card.fields === "external" ? <><input name="supplier" placeholder="Leverantör" aria-label="Extern leverantör" disabled={isCompleted} className={premiumFieldClass} /><input name="totalAmount" type="number" min="0" step="0.01" required placeholder="Belopp exkl. moms" aria-label="Extern kostnad exklusive moms" disabled={isCompleted} className={premiumFieldClass} /></> : null}
            <button disabled={saving || isCompleted} className="h-11 w-full rounded-xl border border-petroleum-700 bg-petroleum-700 px-4 text-sm font-semibold text-white transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-500 focus-visible:ring-offset-2 disabled:opacity-60">Registrera</button>
          </div>
        </form>; })}
      </div>
    </Panel>

    <Panel title="Registreringshistorik" description="Senaste tid-, material-, rese- och kostnadsposterna." bodyClassName="p-0">
      {entries.length === 0 ? <EmptyState title="Inga registreringar ännu" description="Registrera arbetstid eller kostnader för att bygga arbetsorderns utfall." /> : <div className="divide-y divide-sand-100">{entries.map((entry) => <article key={entry.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{typeLabels[entry.entry_type]}</span><h3 className="text-sm font-semibold text-ink-900">{entry.description}</h3></div><p className="mt-2 text-xs text-ink-400">{dateTime.format(new Date(entry.occurred_at))}{entry.supplier ? ` · ${entry.supplier}` : ""}</p></div>
        <div className="text-left sm:text-right">{entry.minutes ? <p className="text-sm font-semibold text-ink-800">{entry.minutes} min</p> : null}{entry.distance_km ? <p className="text-sm font-semibold text-ink-800">{entry.distance_km} km</p> : null}{entry.total_amount > 0 ? <p className="text-sm font-semibold text-petroleum-800">{money.format(entry.total_amount)}</p> : null}</div>
      </article>)}</div>}
    </Panel>
  </div>;
}
