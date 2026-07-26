"use client";

import { useEffect, useMemo, useState } from "react";
import { Droplets, Flame, Gauge, Zap } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";

type Property = { id: string; name: string; address: string; city: string; total_area?: number | null };
type Reading = { id: string; property_id?: string; property_name?: string; type?: string; period?: string; unit?: string; value?: number; cost?: number; value_per_sqm?: number | null; cost_per_sqm?: number | null; note?: string; created_at: string; source?: "table" | "legacy" };

const labels: Record<string, string> = { electricity: "El", heating: "Värme", water: "Vatten" };
const icons = { electricity: Zap, heating: Flame, water: Droplets };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

export default function EnergyPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", type: "electricity", period: new Date().toISOString().slice(0, 7), unit: "kWh", value: "", cost: "", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/energy", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta förbrukning");
      setReadings(data.readings || []);
      setProperties(data.properties || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta förbrukning");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    cost: readings.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    electricity: readings.filter((row) => row.type === "electricity").reduce((sum, row) => sum + Number(row.value || 0), 0),
    heating: readings.filter((row) => row.type === "heating").reduce((sum, row) => sum + Number(row.value || 0), 0),
    water: readings.filter((row) => row.type === "water").reduce((sum, row) => sum + Number(row.value || 0), 0),
  }), [readings]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/energy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara avläsningen");
      setForm({ ...form, propertyId: "", value: "", cost: "", note: "" });
      setSuccess("Avläsningen har sparats.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara avläsningen");
    } finally {
      setSaving(false);
    }
  }

  async function removeReading(reading: Reading) {
    if (reading.source === "legacy") {
      setError("Avläsningen finns i äldre lagring. Kör backfill till EnergyReading innan den kan tas bort.");
      return;
    }
    if (!window.confirm("Ta bort den här avläsningen?")) return;
    setRemovingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/energy", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: reading.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort avläsningen");
      setSuccess("Avläsningen har tagits bort.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort avläsningen");
    } finally {
      setRemovingId("");
    }
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Drift och hållbarhet" title="Energi och förbrukning" description="Följ el, värme och vatten per fastighet, period och kvadratmeter i en samlad förvaltningsvy." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Gauge} label="Samlad kostnad" value={money.format(summary.cost)} />
      <MetricCard icon={Zap} label="El" value={`${number.format(summary.electricity)} kWh`} />
      <MetricCard icon={Flame} label="Värme" value={`${number.format(summary.heating)} kWh`} />
      <MetricCard icon={Droplets} label="Vatten" value={`${number.format(summary.water)} m³`} />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Ny avläsning" description="Registrera en månadsvis förbrukning och kostnad.">
        <form onSubmit={submit} className="space-y-4">
          <select className={premiumFieldClass} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><select className={premiumFieldClass} value={form.type} onChange={(event) => { const type = event.target.value; setForm({ ...form, type, unit: type === "water" ? "m³" : "kWh" }); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={premiumFieldClass} type="month" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} required /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="number" min="0" step="0.01" placeholder="Förbrukning" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required /><input className={premiumFieldClass} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} required /></div>
          <input className={premiumFieldClass} type="number" min="0" step="1" placeholder="Kostnad i SEK" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
          <textarea className={premiumTextareaClass} placeholder="Anteckning" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara avläsning"}</button>
        </form>
      </Panel>

      <Panel title="Förbrukningshistorik" description="Senaste registrerade värden per fastighet och period." bodyClassName="p-0">
        {loading ? <div className="p-6 text-sm text-ink-500">Hämtar data…</div> : readings.length === 0 ? <EmptyState title="Inga avläsningar registrerade" description="När den första avläsningen sparas visas historiken här." /> : <div className="divide-y divide-sand-200">{readings.map((row) => { const Icon = icons[row.type as keyof typeof icons] || Gauge; return <article key={row.id} className="p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-petroleum-50 text-petroleum-700"><Icon className="h-5 w-5" strokeWidth={1.6}/></div><div><h3 className="font-semibold text-ink-900">{labels[row.type || ""] || row.type}</h3><p className="mt-1 text-sm text-ink-500">{row.property_name} · {row.period}</p>{row.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan borttagning.</p> : null}</div></div><div className="sm:text-right"><p className="text-xl font-semibold text-ink-900">{number.format(Number(row.value || 0))} {row.unit}</p><p className="text-xs text-ink-400">{money.format(Number(row.cost || 0))}</p>{row.source !== "legacy" ? <button type="button" disabled={removingId === row.id} onClick={() => void removeReading(row)} className="mt-3 text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">{removingId === row.id ? "Tar bort…" : "Ta bort"}</button> : null}</div></div><div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">{row.value_per_sqm != null ? <span>{number.format(row.value_per_sqm)} {row.unit}/m²</span> : null}{row.cost_per_sqm != null ? <span>{money.format(row.cost_per_sqm)}/m²</span> : null}</div></article>; })}</div>}
      </Panel>
    </section>
  </div>;
}
