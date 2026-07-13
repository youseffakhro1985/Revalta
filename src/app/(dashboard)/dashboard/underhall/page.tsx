"use client";

import { useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string; address: string; city: string };
type Item = {
  id: string;
  property_id: string;
  property_name: string;
  component: string;
  measure: string;
  planned_year: number;
  estimated_cost: number;
  priority: string;
  interval_years: number;
  status: string;
};

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const priorityLabel: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", critical: "Kritisk" };

export default function MaintenancePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [component, setComponent] = useState("");
  const [measure, setMeasure] = useState("");
  const [plannedYear, setPlannedYear] = useState(String(new Date().getFullYear() + 1));
  const [estimatedCost, setEstimatedCost] = useState("");
  const [priority, setPriority] = useState("normal");
  const [intervalYears, setIntervalYears] = useState("0");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/maintenance", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setItems(data.items || []);
      setProperties(data.properties || []);
    } else setMessage(data.error || "Kunde inte hämta underhållsplanen");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const currentYear = new Date().getFullYear();
  const debt = useMemo(() => items.filter((item) => item.planned_year < currentYear && item.status !== "completed").reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0), [items, currentYear]);
  const tenYearCost = useMemo(() => items.filter((item) => item.planned_year >= currentYear && item.planned_year <= currentYear + 10).reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0), [items, currentYear]);
  const critical = items.filter((item) => item.priority === "critical" || item.priority === "high").length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, component, measure, plannedYear: Number(plannedYear), estimatedCost: Number(estimatedCost), priority, intervalYears: Number(intervalYears) }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Kunde inte lägga till åtgärden");
    setComponent(""); setMeasure(""); setEstimatedCost(""); setMessage("Åtgärden är tillagd i underhållsplanen.");
    await load();
  }

  const grouped = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const item of items) map.set(item.planned_year, [...(map.get(item.planned_year) || []), item]);
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Teknisk förvaltning</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[34px] font-semibold tracking-[-0.035em] text-ink-950">Underhållsplan</h1>
            <p className="mt-3 max-w-2xl text-ink-600">Planera byggnadsdelar, åtgärder och investeringar med tydlig kostnadsprognos.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="10 år" value={currency.format(tenYearCost)} />
            <Metric label="Underhållsskuld" value={currency.format(debt)} />
            <Metric label="Hög prioritet" value={String(critical)} />
          </div>
        </div>
      </section>

      {message && <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm text-ink-700">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="h-fit rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <h2 className="text-xl font-semibold text-ink-950">Ny planerad åtgärd</h2>
          <p className="mt-2 text-sm text-ink-500">Koppla åtgärden till rätt fastighet och år.</p>
          <div className="mt-6 space-y-4">
            <Field label="Fastighet"><select required value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="input"><option value="">Välj fastighet</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Byggnadsdel"><input required value={component} onChange={(e) => setComponent(e.target.value)} className="input" placeholder="Ex. Tak, fasad eller ventilation" /></Field>
            <Field label="Åtgärd"><textarea required value={measure} onChange={(e) => setMeasure(e.target.value)} className="input min-h-24" placeholder="Beskriv planerad åtgärd" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planerat år"><input required type="number" value={plannedYear} onChange={(e) => setPlannedYear(e.target.value)} className="input" /></Field>
              <Field label="Intervall, år"><input type="number" min="0" value={intervalYears} onChange={(e) => setIntervalYears(e.target.value)} className="input" /></Field>
            </div>
            <Field label="Beräknad kostnad exkl. moms"><input required type="number" min="0" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="input" placeholder="0" /></Field>
            <Field label="Prioritet"><select value={priority} onChange={(e) => setPriority(e.target.value)} className="input"><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="critical">Kritisk</option></select></Field>
          </div>
          <button className="mt-6 w-full rounded-lg bg-petroleum-700 px-4 py-3 font-semibold text-white">Lägg till i planen</button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 p-6"><h2 className="text-xl font-semibold text-ink-950">Planerade åtgärder</h2><p className="mt-1 text-sm text-ink-500">{items.length} åtgärder i hela beståndet</p></div>
          {loading ? <div className="p-8 text-sm text-ink-500">Hämtar underhållsplan...</div> : grouped.length === 0 ? <div className="p-10 text-center text-sm text-ink-500">Inga planerade åtgärder ännu.</div> : <div className="divide-y divide-sand-100">{grouped.map(([year, yearItems]) => <div key={year} className="grid md:grid-cols-[110px_1fr]"><div className="bg-sand-50 p-5 text-2xl font-semibold text-petroleum-800">{year}</div><div className="divide-y divide-sand-100">{yearItems.map((item) => <article key={item.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-600">{item.property_name}</p><h3 className="mt-1 text-lg font-semibold text-ink-950">{item.component}</h3><p className="mt-1 text-sm text-ink-600">{item.measure}</p></div><div className="text-left sm:text-right"><p className="font-semibold text-ink-950">{currency.format(item.estimated_cost)}</p><p className="mt-1 text-xs text-ink-500">{priorityLabel[item.priority] || item.priority}{item.interval_years ? ` · vart ${item.interval_years}:e år` : ""}</p></div></div></article>)}</div></div>)}</div>}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-28 rounded-xl bg-sand-50 px-4 py-3"><p className="text-lg font-semibold text-ink-950">{value}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-ink-700"><span className="mb-1.5 block">{label}</span>{children}</label>; }
