"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Gauge, RadioTower } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
} from "@/components/dashboard/premium-ui";

type Property = { id: string; name: string; address?: string; city?: string };
type Reading = { id: string; property_name?: string; unit?: string; meter_id?: string; meter_type?: string; period?: string; consumption?: number; unit_price?: number; charge?: number };

const labels: Record<string, string> = { electricity: "El", hot_water: "Varmvatten", cold_water: "Kallvatten", heating: "Värme" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

export default function ImdPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/imd-readings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta mätvärden");
      setProperties(data.properties || []);
      setReadings(data.readings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta mätvärden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/imd-readings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara avläsningen");
      setSuccess("Avläsningen har sparats och debiteringsunderlaget är uppdaterat.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara avläsningen");
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(() => ({
    charge: readings.reduce((sum, item) => sum + Number(item.charge || 0), 0),
    consumption: readings.reduce((sum, item) => sum + Number(item.consumption || 0), 0),
    meters: new Set(readings.map((item) => item.meter_id).filter(Boolean)).size,
  }), [readings]);

  return <div className="space-y-8">
    <PageHeader eyebrow="Förbrukning och debitering" title="Mätare och IMD" description="Individuell mätning och debitering för el, varmvatten, kallvatten och värme per lägenhet eller lokal." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard icon={RadioTower} label="Registrerade mätare" value={totals.meters.toLocaleString("sv-SE")} />
      <MetricCard icon={Gauge} label="Samlad förbrukning" value={number.format(totals.consumption)} />
      <MetricCard icon={CreditCard} label="Debiteringsunderlag" value={money.format(totals.charge)} />
    </section>

    <Panel title="Registrera avläsning" description="Förbrukning och debiteringsbelopp beräknas automatiskt.">
      <form action={submit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <select name="propertyId" required className={premiumFieldClass}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <input name="unit" required placeholder="Lägenhet eller lokal" className={premiumFieldClass} />
          <input name="meterId" required placeholder="Mätar-ID" className={premiumFieldClass} />
          <select name="type" className={premiumFieldClass}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="period" required type="month" className={premiumFieldClass} />
          <input name="previousReading" required type="number" min="0" step="0.001" placeholder="Föregående avläsning" className={premiumFieldClass} />
          <input name="currentReading" required type="number" min="0" step="0.001" placeholder="Aktuell avläsning" className={premiumFieldClass} />
          <input name="unitPrice" required type="number" min="0" step="0.01" placeholder="Pris per enhet" className={premiumFieldClass} />
          <input name="note" placeholder="Anteckning" className={`${premiumFieldClass} md:col-span-2 xl:col-span-3`} />
          <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Spara avläsning"}</button>
        </div>
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      </form>
    </Panel>

    <Panel title="Avläsningar och debitering" description="Samlad historik med förbrukning, pris och debiteringsbelopp." bodyClassName="p-0">
      {loading ? <div className="p-6 text-sm text-ink-500">Hämtar mätvärden…</div> : readings.length === 0 ? <EmptyState title="Inga avläsningar registrerade" description="När en mätaravläsning sparas visas den här tillsammans med debiteringsunderlaget." /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-sand-50 text-xs uppercase tracking-[0.08em] text-ink-400"><tr>{["Fastighet", "Objekt", "Mätare", "Typ", "Period", "Förbrukning", "Pris", "Belopp"].map((head) => <th key={head} className="px-5 py-3 font-semibold">{head}</th>)}</tr></thead><tbody className="divide-y divide-sand-100">{readings.map((item) => <tr key={item.id} className="text-ink-700 transition-colors hover:bg-sand-50/60"><td className="px-5 py-4 font-medium text-ink-900">{item.property_name}</td><td className="px-5 py-4">{item.unit}</td><td className="px-5 py-4">{item.meter_id}</td><td className="px-5 py-4">{labels[item.meter_type || ""] || item.meter_type}</td><td className="px-5 py-4">{item.period}</td><td className="px-5 py-4">{number.format(Number(item.consumption || 0))}</td><td className="px-5 py-4">{number.format(Number(item.unit_price || 0))} kr</td><td className="px-5 py-4 font-semibold text-ink-900">{money.format(Number(item.charge || 0))}</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}
