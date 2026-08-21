"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, Download, Search, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
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

type Property = { id: string; name: string };
type Entry = {
  id: string;
  property_name?: string;
  year?: number;
  category?: string;
  account?: string;
  budget?: number;
  forecast?: number;
  actual?: number;
  variance_budget?: number;
  note?: string;
  created_at: string;
  source?: "table" | "legacy";
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });
const categories: Record<string, string> = {
  income: "Intäkter",
  operations: "Drift",
  maintenance: "Underhåll",
  energy: "Energi",
  administration: "Administration",
  finance: "Finans",
  investment: "Investering",
  other: "Övrigt",
};

export default function BudgetPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editForm, setEditForm] = useState({ year: "", category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", year: String(new Date().getFullYear()), category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/budget", { cache: "no-store" });
    const data = await readResponseJson(response);
    if (response.ok) {
      setEntries(data.entries || []);
      setProperties(data.properties || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } else {
      setError(data.error || "Kunde inte hämta budget");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const years = useMemo(
    () => [...new Set(entries.map((item) => String(item.year || "")).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    [entries],
  );
  const propertyNames = useMemo(
    () => [...new Set(entries.map((item) => item.property_name || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((item) => {
      if (yearFilter !== "all" && String(item.year) !== yearFilter) return false;
      if (propertyFilter !== "all" && item.property_name !== propertyFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!needle) return true;
      return `${item.account || ""} ${item.property_name || ""} ${categories[item.category || "other"] || ""} ${item.note || ""}`.toLowerCase().includes(needle);
    });
  }, [entries, query, yearFilter, propertyFilter, categoryFilter]);

  const totals = useMemo(() => ({
    budget: visibleEntries.reduce((sum, item) => sum + Number(item.budget || 0), 0),
    forecast: visibleEntries.reduce((sum, item) => sum + Number(item.forecast || 0), 0),
    actual: visibleEntries.reduce((sum, item) => sum + Number(item.actual || 0), 0),
  }), [visibleEntries]);
  const actualVariance = totals.actual - totals.budget;
  const forecastVariance = totals.forecast - totals.budget;

  const categorySummary = useMemo(() => Object.keys(categories).map((category) => {
    const rows = visibleEntries.filter((item) => (item.category || "other") === category);
    return {
      category,
      budget: rows.reduce((sum, item) => sum + Number(item.budget || 0), 0),
      actual: rows.reduce((sum, item) => sum + Number(item.actual || 0), 0),
      count: rows.length,
    };
  }).filter((row) => row.count > 0), [visibleEntries]);

  const largestDeviation = useMemo(() => [...visibleEntries]
    .sort((a, b) => Math.abs(Number(b.actual || 0) - Number(b.budget || 0)) - Math.abs(Number(a.actual || 0) - Number(a.budget || 0)))
    .slice(0, 4), [visibleEntries]);

  function startEdit(item: Entry) {
    setEditingId(item.id);
    setEditForm({
      year: String(item.year || new Date().getFullYear()),
      category: item.category || "other",
      account: item.account || "",
      budget: String(item.budget ?? ""),
      forecast: String(item.forecast ?? ""),
      actual: String(item.actual ?? ""),
      note: item.note || "",
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte spara budgetraden");
    else {
      setForm({ propertyId: "", year: String(new Date().getFullYear()), category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" });
      setSuccess("Budgetraden har sparats.");
      await load();
    }
    setSaving(false);
  }

  async function saveEdit(item: Entry) {
    if (item.source === "legacy") {
      setError("Budgetraden finns i äldre lagring. Kör backfill till BudgetEntry innan den kan uppdateras.");
      return;
    }
    setUpdatingId(item.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId: item.id,
        year: editForm.year,
        category: editForm.category,
        account: editForm.account,
        budget: editForm.budget,
        forecast: editForm.forecast,
        actual: editForm.actual,
        note: editForm.note,
      }),
    });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera budgetraden");
    else {
      setSuccess("Budgetraden har uppdaterats.");
      setEditingId("");
      await load();
    }
    setUpdatingId("");
  }

  async function removeEntry(entry: Entry) {
    if (entry.source === "legacy") {
      setError("Budgetraden finns i äldre lagring. Kör backfill till BudgetEntry innan den kan tas bort.");
      return;
    }
    if (!window.confirm("Ta bort den här budgetraden?")) return;
    setRemovingId(entry.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/budget", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entry.id }),
    });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte ta bort budgetraden");
    else {
      setSuccess("Budgetraden har tagits bort.");
      await load();
    }
    setRemovingId("");
  }

  function exportCsv() {
    const rows = [
      ["Fastighet", "År", "Kategori", "Konto", "Budget", "Prognos", "Utfall", "Avvikelse", "Kommentar"],
      ...visibleEntries.map((item) => [
        item.property_name || "",
        String(item.year || ""),
        categories[item.category || "other"] || item.category || "",
        item.account || "",
        String(Number(item.budget || 0)),
        String(Number(item.forecast || 0)),
        String(Number(item.actual || 0)),
        String(Number(item.actual || 0) - Number(item.budget || 0)),
        item.note || "",
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-budget-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = Boolean(query || yearFilter !== "all" || propertyFilter !== "all" || categoryFilter !== "all");

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Ekonomisk styrning"
      title="Budget, prognos och utfall"
      description="En lugn portföljvy för budgetansvar: filtrera beståndet, hitta avvikelser och följ prognosen utan att tappa underliggande konton."
      action={visibleEntries.length ? (
        <button type="button" onClick={exportCsv} className={premiumSecondaryButtonClass}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Exportera CSV
        </button>
      ) : undefined}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={WalletCards} label="Budget" value={money.format(totals.budget)} hint={`${visibleEntries.length} budgetrader i vald vy`} />
      <MetricCard icon={BarChart3} label="Prognos" value={money.format(totals.forecast)} hint={`${forecastVariance > 0 ? "+" : ""}${money.format(forecastVariance)} mot budget`} />
      <MetricCard icon={CircleDollarSign} label="Utfall" value={money.format(totals.actual)} hint={totals.budget ? `${number.format((totals.actual / totals.budget) * 100)} % av budget` : "Ingen budget i urvalet"} />
      <MetricCard icon={actualVariance > 0 ? TrendingUp : TrendingDown} label="Avvikelse" value={money.format(actualVariance)} hint={actualVariance > 0 ? "Över budget" : actualVariance < 0 ? "Under budget" : "I linje med budget"} />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra budgetrader.</InlineAlert> : null}

    <Panel title="Styrningsfilter" description="Avgränsa portföljen utan att ändra underliggande data.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_0.7fr_1fr_0.9fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-400" aria-hidden="true" />
          <input className={`${premiumFieldClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök konto, fastighet eller kommentar" aria-label="Sök budgetrader" />
        </label>
        <select className={premiumFieldClass} value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} aria-label="Filtrera år">
          <option value="all">Alla år</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filtrera fastighet">
          <option value="all">Alla fastigheter</option>
          {propertyNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select className={premiumFieldClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filtrera kategori">
          <option value="all">Alla kategorier</option>
          {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button
          type="button"
          disabled={!hasFilters}
          onClick={() => { setQuery(""); setYearFilter("all"); setPropertyFilter("all"); setCategoryFilter("all"); }}
          className={premiumSecondaryButtonClass}
        >
          Rensa
        </button>
      </div>
    </Panel>

    <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel title="Fördelning per kostnadsslag" description="Budget och utfall i den filtrerade portföljen.">
        {categorySummary.length === 0 ? <EmptyState title="Ingen ekonomidata i urvalet" /> : (
          <div className="space-y-5">
            {categorySummary.map((row) => {
              const ceiling = Math.max(row.budget, row.actual, 1);
              return <div key={row.category}>
                <div className="flex items-end justify-between gap-4">
                  <div><p className="text-sm font-semibold text-ink-800">{categories[row.category]}</p><p className="mt-1 text-xs text-ink-500">{row.count} rader</p></div>
                  <p className="text-xs text-ink-500">{money.format(row.actual)} / {money.format(row.budget)}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-100">
                  <div className="h-full rounded-full bg-petroleum-700" style={{ width: `${Math.min(100, (row.actual / ceiling) * 100)}%` }} />
                </div>
              </div>;
            })}
          </div>
        )}
      </Panel>

      <Panel title="Största avvikelser" description="Rader som förtjänar snabbast uppföljning." bodyClassName="p-0">
        {largestDeviation.length === 0 ? <EmptyState title="Inga avvikelser att visa" /> : (
          <div className="divide-y divide-sand-100">
            {largestDeviation.map((item) => {
              const variance = Number(item.actual || 0) - Number(item.budget || 0);
              return <div key={item.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{item.account}</p><p className="mt-1 truncate text-xs text-ink-500">{item.property_name} · {categories[item.category || "other"]}</p></div>
                  <p className={`shrink-0 text-sm font-semibold ${variance > 0 ? "text-red-700" : "text-petroleum-800"}`}>{variance > 0 ? "+" : ""}{money.format(variance)}</p>
                </div>
              </div>;
            })}
          </div>
        )}
      </Panel>
    </section>

    <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[390px_1fr]" : "grid-cols-1"}`}>
      {canManage ? (
        <div className="xl:sticky xl:top-24 xl:self-start">
          <Panel title="Ny budgetrad" description="Registrera budget, prognos och verkligt utfall per kostnadsslag.">
            <form onSubmit={submit} className="space-y-4">
              <select className={premiumFieldClass} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required aria-label="Välj fastighet"><option value="">Välj fastighet</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <div className="grid gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} aria-label="År" /><select className={premiumFieldClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Kategori">{Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <input className={premiumFieldClass} placeholder="Konto eller kostnadsslag" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} required aria-label="Konto eller kostnadsslag" />
              <div className="grid gap-3 sm:grid-cols-3"><input className={premiumFieldClass} type="number" placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} aria-label="Budget" /><input className={premiumFieldClass} type="number" placeholder="Prognos" value={form.forecast} onChange={(e) => setForm({ ...form, forecast: e.target.value })} aria-label="Prognos" /><input className={premiumFieldClass} type="number" placeholder="Utfall" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} aria-label="Utfall" /></div>
              <textarea className={premiumTextareaClass} placeholder="Kommentar" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Kommentar" />
              <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara budgetrad"}</button>
            </form>
          </Panel>
        </div>
      ) : null}

      <Panel title="Ekonomiskt utfall" description={`${visibleEntries.length} av ${entries.length} budgetrader i vald vy`} bodyClassName="p-0">
        {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div> : visibleEntries.length === 0 ? <EmptyState title="Inga budgetrader matchar urvalet" description="Justera filtren eller lägg till en ny budgetrad." /> : (
          <div className="divide-y divide-sand-100">{visibleEntries.map((item) => {
            const itemVariance = Number(item.actual || 0) - Number(item.budget || 0);
            return <article key={item.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{item.account}</h3><span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{categories[item.category || "other"]}</span></div>
                  <p className="mt-1 text-sm text-ink-500">{item.property_name} · {item.year}</p>
                  {item.note ? <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">{item.note}</p> : null}
                  {item.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan uppdatering eller borttagning.</p> : null}
                  <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-ink-500">
                    <span>Budget<strong className="mt-1 block text-ink-800">{money.format(Number(item.budget || 0))}</strong></span>
                    <span>Prognos<strong className="mt-1 block text-ink-800">{money.format(Number(item.forecast || 0))}</strong></span>
                    <span>Utfall<strong className="mt-1 block text-ink-800">{money.format(Number(item.actual || 0))}</strong></span>
                  </div>
                </div>
                <div className="space-y-2 sm:text-right">
                  <p className={`text-lg font-semibold ${itemVariance > 0 ? "text-red-700" : "text-petroleum-800"}`}>{itemVariance > 0 ? "+" : ""}{money.format(itemVariance)}</p>
                  <p className="text-xs text-ink-500">Avvikelse mot budget</p>
                  {canManage && item.source !== "legacy" ? <>
                    <button type="button" onClick={() => (editingId === item.id ? setEditingId("") : startEdit(item))} className="block text-xs font-semibold text-petroleum-800 transition hover:text-petroleum-950 sm:ml-auto">{editingId === item.id ? "Stäng" : "Ändra"}</button>
                    <button type="button" disabled={removingId === item.id} onClick={() => void removeEntry(item)} className="block text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60 sm:ml-auto">{removingId === item.id ? "Tar bort…" : "Ta bort"}</button>
                  </> : null}
                </div>
              </div>
              {canManage && editingId === item.id && item.source !== "legacy" ? (
                <div className="mt-5 space-y-3 rounded-2xl border border-sand-200 bg-sand-50/60 p-4">
                  <div className="grid gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="number" value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} aria-label="År" /><select className={premiumFieldClass} value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} aria-label="Kategori">{Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <input className={premiumFieldClass} placeholder="Konto" value={editForm.account} onChange={(e) => setEditForm({ ...editForm, account: e.target.value })} aria-label="Konto" />
                  <div className="grid gap-3 sm:grid-cols-3"><input className={premiumFieldClass} type="number" placeholder="Budget" value={editForm.budget} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} aria-label="Budget" /><input className={premiumFieldClass} type="number" placeholder="Prognos" value={editForm.forecast} onChange={(e) => setEditForm({ ...editForm, forecast: e.target.value })} aria-label="Prognos" /><input className={premiumFieldClass} type="number" placeholder="Utfall" value={editForm.actual} onChange={(e) => setEditForm({ ...editForm, actual: e.target.value })} aria-label="Utfall" /></div>
                  <textarea className={premiumTextareaClass} placeholder="Kommentar" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} aria-label="Kommentar" />
                  <button type="button" disabled={updatingId === item.id} onClick={() => void saveEdit(item)} className={`${premiumPrimaryButtonClass} sm:w-auto`}>{updatingId === item.id ? "Sparar…" : "Spara ändringar"}</button>
                </div>
              ) : null}
            </article>;
          })}</div>
        )}
      </Panel>
    </section>
  </div>;
}
