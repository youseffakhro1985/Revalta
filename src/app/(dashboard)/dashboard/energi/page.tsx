"use client";

import { useEffect, useMemo, useState } from "react";
import { Droplets, Flame, Gauge, Zap } from "lucide-react";

type Property = { id: string; name: string; address: string; city: string; total_area?: number | null };
type Reading = { id: string; property_id?: string; property_name?: string; type?: string; period?: string; unit?: string; value?: number; cost?: number; value_per_sqm?: number | null; cost_per_sqm?: number | null; note?: string; created_at: string };

const labels: Record<string, string> = { electricity: "El", heating: "Värme", water: "Vatten" };
const icons = { electricity: Zap, heating: Flame, water: Droplets };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

export default function EnergyPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", type: "electricity", period: new Date().toISOString().slice(0, 7), unit: "kWh", value: "", cost: "", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/energy", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setReadings(data.readings || []); setProperties(data.properties || []); }
    else setError(data.error || "Kunde inte hämta förbrukning");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    cost: readings.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    electricity: readings.filter((row) => row.type === "electricity").reduce((sum, row) => sum + Number(row.value || 0), 0),
    heating: readings.filter((row) => row.type === "heating").reduce((sum, row) => sum + Number(row.value || 0), 0),
    water: readings.filter((row) => row.type === "water").reduce((sum, row) => sum + Number(row.value || 0), 0),
  }), [readings]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/energy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara avläsningen");
    else { setForm({ ...form, propertyId: "", value: "", cost: "", note: "" }); await load(); }
    setSaving(false);
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return <div className="space-y-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Drift och hållbarhet</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Energi och förbrukning</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Följ el, värme och vatten per fastighet, period och kvadratmeter i en samlad förvaltningsvy.</p></header>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[[Gauge, "Samlad kostnad", money.format(summary.cost)], [Zap, "El", `${number.format(summary.electricity)} kWh`], [Flame, "Värme", `${number.format(summary.heating)} kWh`], [Droplets, "Vatten", `${number.format(summary.water)} m³`]].map(([Icon, label, value]) => { const C = Icon as typeof Gauge; return <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><C className="h-5 w-5 text-petroleum-700" strokeWidth={1.6}/><p className="mt-5 text-xs font-medium text-ink-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{String(value)}</p></div>; })}
    </section>

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <h2 className="font-display text-xl font-semibold text-ink-900">Ny avläsning</h2><p className="mt-1 text-sm text-ink-500">Registrera en månadsvis förbrukning och kostnad.</p>
        <div className="mt-6 space-y-4">
          <select className={field} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <div className="grid grid-cols-2 gap-3"><select className={field} value={form.type} onChange={(event) => { const type = event.target.value; setForm({ ...form, type, unit: type === "water" ? "m³" : "kWh" }); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={field} type="month" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3"><input className={field} type="number" min="0" step="0.01" placeholder="Förbrukning" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required /><input className={field} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} required /></div>
          <input className={field} type="number" min="0" step="1" placeholder="Kostnad i SEK" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
          <textarea className="min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500" placeholder="Anteckning" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white hover:bg-petroleum-800 disabled:opacity-60">{saving ? "Sparar…" : "Spara avläsning"}</button>
        </div>
      </form>

      <div className="rounded-2xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Förbrukningshistorik</h2><p className="mt-1 text-sm text-ink-500">Senaste registrerade värden per fastighet och period.</p></div>
        <div className="divide-y divide-sand-200">{loading ? <p className="p-6 text-sm text-ink-500">Hämtar data…</p> : readings.length === 0 ? <p className="p-10 text-center text-sm text-ink-500">Inga avläsningar registrerade ännu.</p> : readings.map((row) => { const Icon = icons[row.type as keyof typeof icons] || Gauge; return <article key={row.id} className="p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-petroleum-50 text-petroleum-700"><Icon className="h-5 w-5" strokeWidth={1.6}/></div><div><h3 className="font-semibold text-ink-900">{labels[row.type || ""] || row.type}</h3><p className="mt-1 text-sm text-ink-500">{row.property_name} · {row.period}</p></div></div><div className="sm:text-right"><p className="text-xl font-semibold text-ink-900">{number.format(Number(row.value || 0))} {row.unit}</p><p className="text-xs text-ink-400">{money.format(Number(row.cost || 0))}</p></div></div><div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">{row.value_per_sqm != null ? <span>{number.format(row.value_per_sqm)} {row.unit}/m²</span> : null}{row.cost_per_sqm != null ? <span>{money.format(row.cost_per_sqm)}/m²</span> : null}</div></article>; })}</div>
      </div>
    </section>
  </div>;
}
