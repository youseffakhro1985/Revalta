"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, TrendingUp } from "lucide-react";

type Property = { id: string; name: string };
type Entry = { id: string; property_name?: string; year?: number; category?: string; account?: string; budget?: number; forecast?: number; actual?: number; variance_budget?: number; created_at: string };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const categories: Record<string, string> = { income: "Intäkter", operations: "Drift", maintenance: "Underhåll", energy: "Energi", administration: "Administration", finance: "Finans", investment: "Investering", other: "Övrigt" };

export default function BudgetPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", year: String(new Date().getFullYear()), category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/budget", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setEntries(data.entries || []); setProperties(data.properties || []); }
    else setError(data.error || "Kunde inte hämta budget");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => ({
    budget: entries.reduce((sum, item) => sum + Number(item.budget || 0), 0),
    forecast: entries.reduce((sum, item) => sum + Number(item.forecast || 0), 0),
    actual: entries.reduce((sum, item) => sum + Number(item.actual || 0), 0),
  }), [entries]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara budgetraden");
    else { setForm({ propertyId: "", year: String(new Date().getFullYear()), category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" }); await load(); }
    setSaving(false);
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-petroleum-500";
  return <div className="space-y-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Ekonomisk styrning</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Budget, prognos och utfall</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Följ ekonomin per fastighet, år och kostnadsslag med tydliga avvikelser.</p></header>
    <section className="grid gap-4 md:grid-cols-3">{[[CircleDollarSign,"Budget",totals.budget],[BarChart3,"Prognos",totals.forecast],[TrendingUp,"Utfall",totals.actual]].map(([Icon,label,value]) => { const C = Icon as typeof CircleDollarSign; return <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5"><C className="h-5 w-5 text-petroleum-700"/><p className="mt-5 text-xs text-ink-500">{String(label)}</p><p className="mt-1 text-xl font-semibold text-ink-900">{money.format(Number(value))}</p></div>; })}</section>
    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6"><h2 className="font-display text-xl font-semibold text-ink-900">Ny budgetrad</h2><div className="mt-6 space-y-4">
        <select className={field} value={form.propertyId} onChange={(e)=>setForm({...form,propertyId:e.target.value})} required><option value="">Välj fastighet</option>{properties.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-3"><input className={field} type="number" value={form.year} onChange={(e)=>setForm({...form,year:e.target.value})}/><select className={field} value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}>{Object.entries(categories).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <input className={field} placeholder="Konto eller kostnadsslag" value={form.account} onChange={(e)=>setForm({...form,account:e.target.value})} required/>
        <div className="grid grid-cols-3 gap-3"><input className={field} type="number" placeholder="Budget" value={form.budget} onChange={(e)=>setForm({...form,budget:e.target.value})}/><input className={field} type="number" placeholder="Prognos" value={form.forecast} onChange={(e)=>setForm({...form,forecast:e.target.value})}/><input className={field} type="number" placeholder="Utfall" value={form.actual} onChange={(e)=>setForm({...form,actual:e.target.value})}/></div>
        <textarea className="min-h-24 w-full rounded-lg border border-sand-200 px-3 py-3 text-sm" placeholder="Kommentar" value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})}/>{error ? <p className="text-sm text-red-700">{error}</p> : null}<button disabled={saving} className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Sparar…" : "Spara budgetrad"}</button>
      </div></form>
      <div className="rounded-2xl border border-sand-200 bg-white"><div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Ekonomiskt utfall</h2></div><div className="divide-y divide-sand-200">{loading ? <p className="p-6 text-sm text-ink-500">Hämtar ekonomi…</p> : entries.length === 0 ? <p className="p-10 text-center text-sm text-ink-500">Inga budgetrader registrerade ännu.</p> : entries.map((item)=><article key={item.id} className="p-6"><div className="flex justify-between gap-4"><div><h3 className="font-semibold text-ink-900">{item.account}</h3><p className="mt-1 text-sm text-ink-500">{item.property_name} · {categories[item.category || "other"]} · {item.year}</p></div><div className="text-right"><p className="text-lg font-semibold text-ink-900">{money.format(Number(item.actual || 0))}</p><p className="text-xs text-ink-400">Avvikelse {money.format(Number(item.variance_budget || 0))}</p></div></div></article>)}</div></div>
    </section>
  </div>;
}
