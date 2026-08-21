"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Droplets, Flame, Gauge, Search, Zap } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string; total_area?: number | null };
type Reading = {
  id: string;
  property_id?: string;
  property_name?: string;
  type?: string;
  period?: string;
  unit?: string;
  value?: number;
  cost?: number;
  value_per_sqm?: number | null;
  cost_per_sqm?: number | null;
  note?: string;
  created_at: string;
  source?: "table" | "legacy";
};

const labels: Record<string, string> = { electricity: "El", heating: "Värme", water: "Vatten" };
const icons = { electricity: Zap, heating: Flame, water: Droplets };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

export default function EnergyPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [editForm, setEditForm] = useState({ period: "", value: "", cost: "", note: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", type: "electricity", period: new Date().toISOString().slice(0, 7), unit: "kWh", value: "", cost: "", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/energy", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta förbrukning");
      setReadings(data.readings || []);
      setProperties(data.properties || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta förbrukning");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const periods = useMemo(() => [...new Set(readings.map((row) => row.period || "").filter(Boolean))].sort().reverse(), [readings]);
  const propertyNames = useMemo(() => [...new Set(readings.map((row) => row.property_name || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")), [readings]);

  const visibleReadings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return readings.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (propertyFilter !== "all" && row.property_name !== propertyFilter) return false;
      if (periodFilter !== "all" && row.period !== periodFilter) return false;
      if (!needle) return true;
      return `${row.property_name || ""} ${row.period || ""} ${labels[row.type || ""] || row.type || ""} ${row.note || ""}`.toLowerCase().includes(needle);
    });
  }, [readings, query, typeFilter, propertyFilter, periodFilter]);

  const summary = useMemo(() => ({
    cost: visibleReadings.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    electricity: visibleReadings.filter((row) => row.type === "electricity").reduce((sum, row) => sum + Number(row.value || 0), 0),
    heating: visibleReadings.filter((row) => row.type === "heating").reduce((sum, row) => sum + Number(row.value || 0), 0),
    water: visibleReadings.filter((row) => row.type === "water").reduce((sum, row) => sum + Number(row.value || 0), 0),
  }), [visibleReadings]);

  const monthlyCost = useMemo(() => periods.slice(0, 6).reverse().map((period) => ({
    period,
    cost: visibleReadings.filter((row) => row.period === period).reduce((sum, row) => sum + Number(row.cost || 0), 0),
  })).filter((row) => row.cost > 0), [periods, visibleReadings]);

  const propertySummary = useMemo(() => propertyNames.map((name) => {
    const rows = visibleReadings.filter((row) => row.property_name === name);
    return {
      name,
      cost: rows.reduce((sum, row) => sum + Number(row.cost || 0), 0),
      count: rows.length,
      avgCostPerSqm: rows.filter((row) => row.cost_per_sqm != null).length
        ? rows.reduce((sum, row) => sum + Number(row.cost_per_sqm || 0), 0) / rows.filter((row) => row.cost_per_sqm != null).length
        : null,
    };
  }).filter((row) => row.count > 0).sort((a, b) => b.cost - a.cost).slice(0, 6), [propertyNames, visibleReadings]);

  function startEdit(reading: Reading) {
    setEditingId(reading.id);
    setEditForm({ period: reading.period || "", value: String(reading.value ?? ""), cost: String(reading.cost ?? ""), note: reading.note || "" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/energy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await readResponseJson(response);
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

  async function saveEdit(reading: Reading) {
    if (reading.source === "legacy") {
      setError("Avläsningen finns i äldre lagring. Kör backfill till EnergyReading innan den kan uppdateras.");
      return;
    }
    setUpdatingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/energy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, period: editForm.period, value: editForm.value, cost: editForm.cost, note: editForm.note }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera avläsningen");
      setSuccess("Avläsningen har uppdaterats.");
      setEditingId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera avläsningen");
    } finally {
      setUpdatingId("");
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
      const response = await fetch("/api/energy", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readingId: reading.id }) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort avläsningen");
      setSuccess("Avläsningen har tagits bort.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort avläsningen");
    } finally {
      setRemovingId("");
    }
  }

  function exportCsv() {
    const rows = [
      ["Fastighet", "Typ", "Period", "Förbrukning", "Enhet", "Kostnad", "Förbrukning/m²", "Kostnad/m²", "Anteckning"],
      ...visibleReadings.map((row) => [row.property_name || "", labels[row.type || ""] || row.type || "", row.period || "", String(row.value || 0), row.unit || "", String(row.cost || 0), String(row.value_per_sqm ?? ""), String(row.cost_per_sqm ?? ""), row.note || ""]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-energi-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = Boolean(query || typeFilter !== "all" || propertyFilter !== "all" || periodFilter !== "all");
  const maxMonthlyCost = Math.max(...monthlyCost.map((row) => row.cost), 1);

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Drift och hållbarhet"
      title="Energi och förbrukning"
      description="Följ el, värme och vatten per fastighet och period. Upptäck kostnadsdrivare, jämför beståndet och gå från mätvärde till åtgärd med en tydlig driftbild."
      action={visibleReadings.length ? <button type="button" onClick={exportCsv} className={premiumSecondaryButtonClass}><Download className="mr-2 h-4 w-4" aria-hidden="true" />Exportera CSV</button> : undefined}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Gauge} label="Samlad kostnad" value={money.format(summary.cost)} hint={`${visibleReadings.length} avläsningar i vald vy`} />
      <MetricCard icon={Zap} label="El" value={`${number.format(summary.electricity)} kWh`} />
      <MetricCard icon={Flame} label="Värme" value={`${number.format(summary.heating)} kWh`} />
      <MetricCard icon={Droplets} label="Vatten" value={`${number.format(summary.water)} m³`} />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra avläsningar.</InlineAlert> : null}

    <Panel title="Filtrera energiläget" description="Avgränsa fastighet, förbrukningstyp och period utan att ändra registrerade mätvärden.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_1fr_0.8fr_auto]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-400" aria-hidden="true" /><input className={`${premiumFieldClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök fastighet eller anteckning" aria-label="Sök energi" /></label>
        <select className={premiumFieldClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrera förbrukningstyp"><option value="all">Alla typer</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filtrera fastighet"><option value="all">Alla fastigheter</option>{propertyNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        <select className={premiumFieldClass} value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} aria-label="Filtrera period"><option value="all">Alla perioder</option>{periods.map((period) => <option key={period} value={period}>{period}</option>)}</select>
        <button type="button" disabled={!hasFilters} onClick={() => { setQuery(""); setTypeFilter("all"); setPropertyFilter("all"); setPeriodFilter("all"); }} className={premiumSecondaryButtonClass}>Rensa</button>
      </div>
    </Panel>

    <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Panel title="Kostnadsutveckling" description="Senaste registrerade perioderna i den filtrerade vyn.">
        {monthlyCost.length === 0 ? <EmptyState title="Ingen kostnadsserie att visa" /> : (
          <div className="flex h-52 items-end gap-3 pt-6">
            {monthlyCost.map((row) => <div key={row.period} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <p className="text-[10px] font-semibold text-ink-500">{money.format(row.cost)}</p>
              <div className="flex h-32 w-full items-end rounded-xl bg-sand-50 px-2 pt-2"><div className="w-full rounded-lg bg-petroleum-700" style={{ height: `${Math.max(6, (row.cost / maxMonthlyCost) * 100)}%` }} /></div>
              <p className="truncate text-[10px] text-ink-500">{row.period}</p>
            </div>)}
          </div>
        )}
      </Panel>

      <Panel title="Fastigheter med högst kostnad" description="Snabb prioritering för uppföljning." bodyClassName="p-0">
        {propertySummary.length === 0 ? <EmptyState title="Ingen fastighetsdata i urvalet" /> : <div className="divide-y divide-sand-100">{propertySummary.map((row, index) => <div key={row.name} className="flex items-center justify-between gap-4 px-6 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-50 text-xs font-semibold text-ink-500">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{row.name}</p><p className="mt-1 text-xs text-ink-500">{row.count} avläsningar{row.avgCostPerSqm != null ? ` · ${money.format(row.avgCostPerSqm)}/m²` : ""}</p></div></div><p className="shrink-0 text-sm font-semibold text-ink-900">{money.format(row.cost)}</p></div>)}</div>}
      </Panel>
    </section>

    <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[390px_1fr]" : "grid-cols-1"}`}>
      {canManage ? <div className="xl:sticky xl:top-24 xl:self-start"><Panel title="Ny avläsning" description="Registrera månadsvis förbrukning och kostnad med rätt enhet.">
        <form onSubmit={submit} className="space-y-4">
          <select className={premiumFieldClass} aria-label="Välj fastighet" value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <div className="grid gap-3 sm:grid-cols-2"><select className={premiumFieldClass} aria-label="Typ av avläsning" value={form.type} onChange={(event) => { const type = event.target.value; setForm({ ...form, type, unit: type === "water" ? "m³" : "kWh" }); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={premiumFieldClass} type="month" aria-label="Period" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} required /></div>
          <div className="grid gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="number" min="0" step="0.01" placeholder="Förbrukning" aria-label="Förbrukning" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} required /><input className={premiumFieldClass} aria-label="Enhet" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} required /></div>
          <input className={premiumFieldClass} type="number" min="0" step="1" placeholder="Kostnad i SEK" aria-label="Kostnad i SEK" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
          <textarea className={premiumTextareaClass} placeholder="Anteckning" aria-label="Anteckning" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara avläsning"}</button>
        </form>
      </Panel></div> : null}

      <Panel title="Förbrukningshistorik" description={`${visibleReadings.length} av ${readings.length} avläsningar i vald vy`} bodyClassName="p-0">
        {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div> : visibleReadings.length === 0 ? <EmptyState title="Inga avläsningar matchar urvalet" description="Justera filtren eller registrera en ny avläsning." /> : <div className="divide-y divide-sand-100">{visibleReadings.map((row) => {
          const Icon = icons[row.type as keyof typeof icons] || Gauge;
          return <article key={row.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row">
              <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-petroleum-50 text-petroleum-700"><Icon className="h-5 w-5" strokeWidth={1.6} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{labels[row.type || ""] || row.type}</h3><span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{row.period}</span></div><p className="mt-1 text-sm text-ink-500">{row.property_name}</p>{row.note ? <p className="mt-2 max-w-xl text-sm leading-6 text-ink-500">{row.note}</p> : null}{row.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan uppdatering eller borttagning.</p> : null}</div></div>
              <div className="space-y-2 sm:text-right"><p className="text-xl font-semibold text-ink-900">{number.format(Number(row.value || 0))} {row.unit}</p><p className="text-xs font-semibold text-petroleum-800">{money.format(Number(row.cost || 0))}</p>{canManage && row.source !== "legacy" ? <><button type="button" onClick={() => (editingId === row.id ? setEditingId("") : startEdit(row))} className="block text-xs font-semibold text-petroleum-800 transition hover:text-petroleum-950 sm:ml-auto">{editingId === row.id ? "Stäng" : "Ändra"}</button><button type="button" disabled={removingId === row.id} onClick={() => void removeReading(row)} className="block text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60 sm:ml-auto">{removingId === row.id ? "Tar bort…" : "Ta bort"}</button></> : null}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">{row.value_per_sqm != null ? <span>{number.format(row.value_per_sqm)} {row.unit}/m²</span> : null}{row.cost_per_sqm != null ? <span>{money.format(row.cost_per_sqm)}/m²</span> : null}</div>
            {canManage && editingId === row.id && row.source !== "legacy" ? <div className="mt-5 space-y-3 rounded-2xl border border-sand-200 bg-sand-50/60 p-4"><div className="grid gap-3 sm:grid-cols-3"><input className={premiumFieldClass} type="month" aria-label="Period" value={editForm.period} onChange={(e) => setEditForm({ ...editForm, period: e.target.value })} /><input className={premiumFieldClass} type="number" min="0" step="0.01" placeholder="Förbrukning" aria-label="Förbrukning" value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} /><input className={premiumFieldClass} type="number" min="0" placeholder="Kostnad" aria-label="Kostnad" value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })} /></div><textarea className={premiumTextareaClass} placeholder="Anteckning" aria-label="Anteckning" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} /><button type="button" disabled={updatingId === row.id} onClick={() => void saveEdit(row)} className={`${premiumPrimaryButtonClass} sm:w-auto`}>{updatingId === row.id ? "Sparar…" : "Spara ändringar"}</button></div> : null}
          </article>;
        })}</div>}
      </Panel>
    </section>
  </div>;
}
