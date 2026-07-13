"use client";

import { useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string; address?: string; city?: string };
type Reading = { id: string; property_name?: string; unit?: string; meter_id?: string; meter_type?: string; period?: string; consumption?: number; unit_price?: number; charge?: number };

const labels: Record<string, string> = { electricity: "El", hot_water: "Varmvatten", cold_water: "Kallvatten", heating: "Värme" };
const inputClass = "h-11 w-full rounded-xl border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

export default function ImdPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/imd-readings", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setProperties(data.properties || []); setReadings(data.readings || []); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(formData: FormData) {
    setSaving(true); setMessage("");
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/imd-readings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Något gick fel");
    else { setMessage("Avläsningen har sparats."); await load(); }
    setSaving(false);
  }

  const totals = useMemo(() => ({
    charge: readings.reduce((sum, item) => sum + Number(item.charge || 0), 0),
    consumption: readings.reduce((sum, item) => sum + Number(item.consumption || 0), 0),
    meters: new Set(readings.map((item) => item.meter_id).filter(Boolean)).size,
  }), [readings]);

  return <div className="space-y-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-petroleum-700">Förbrukning och debitering</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Mätare och IMD</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Individuell mätning och debitering för el, varmvatten, kallvatten och värme per lägenhet eller lokal.</p></div>

    <div className="grid gap-4 md:grid-cols-3">{[
      ["Registrerade mätare", totals.meters.toString()],
      ["Samlad förbrukning", totals.consumption.toLocaleString("sv-SE")],
      ["Debiteringsunderlag", `${totals.charge.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`],
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><p className="text-xs font-medium text-ink-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{value}</p></div>)}</div>

    <form action={submit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
      <div className="mb-5"><h2 className="text-lg font-semibold text-ink-900">Registrera avläsning</h2><p className="mt-1 text-sm text-ink-500">Skapar automatiskt förbrukning och debiteringsbelopp.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <select name="propertyId" required className={inputClass}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input name="unit" required placeholder="Lägenhet eller lokal" className={inputClass} />
        <input name="meterId" required placeholder="Mätar-ID" className={inputClass} />
        <select name="type" className={inputClass}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="period" required type="month" className={inputClass} />
        <input name="previousReading" required type="number" min="0" step="0.001" placeholder="Föregående avläsning" className={inputClass} />
        <input name="currentReading" required type="number" min="0" step="0.001" placeholder="Aktuell avläsning" className={inputClass} />
        <input name="unitPrice" required type="number" min="0" step="0.01" placeholder="Pris per enhet" className={inputClass} />
        <input name="note" placeholder="Anteckning" className={`${inputClass} md:col-span-2 xl:col-span-3`} />
        <button disabled={saving} className="h-11 rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800 disabled:opacity-60">{saving ? "Sparar..." : "Spara avläsning"}</button>
      </div>
      {message ? <p className="mt-4 text-sm text-ink-600">{message}</p> : null}
    </form>

    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-6 py-4"><h2 className="font-semibold text-ink-900">Avläsningar och debitering</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-sand-50 text-xs uppercase tracking-[0.08em] text-ink-400"><tr>{["Fastighet", "Objekt", "Mätare", "Typ", "Period", "Förbrukning", "Pris", "Belopp"].map((head) => <th key={head} className="px-5 py-3 font-semibold">{head}</th>)}</tr></thead><tbody className="divide-y divide-sand-100">{loading ? <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-400">Laddar...</td></tr> : readings.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-400">Inga avläsningar registrerade.</td></tr> : readings.map((item) => <tr key={item.id} className="text-ink-700"><td className="px-5 py-4 font-medium text-ink-900">{item.property_name}</td><td className="px-5 py-4">{item.unit}</td><td className="px-5 py-4">{item.meter_id}</td><td className="px-5 py-4">{labels[item.meter_type || ""] || item.meter_type}</td><td className="px-5 py-4">{item.period}</td><td className="px-5 py-4">{Number(item.consumption || 0).toLocaleString("sv-SE")}</td><td className="px-5 py-4">{Number(item.unit_price || 0).toLocaleString("sv-SE")} kr</td><td className="px-5 py-4 font-semibold">{Number(item.charge || 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr</td></tr>)}</tbody></table></div>
    </div>
  </div>;
}