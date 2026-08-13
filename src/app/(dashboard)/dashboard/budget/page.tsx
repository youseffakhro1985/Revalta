"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, TrendingUp } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
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
const categories: Record<string, string> = { income: "Intäkter", operations: "Drift", maintenance: "Underhåll", energy: "Energi", administration: "Administration", finance: "Finans", investment: "Investering", other: "Övrigt" };

export default function BudgetPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ year: "", category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ propertyId: "", year: String(new Date().getFullYear()), category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/budget", { cache: "no-store" });
    const data = await readResponseJson(response);
    if (response.ok) {
      setEntries(data.entries || []);
      setProperties(data.properties || []);
      setCanManage(Boolean(data.permissions?.canManage));
    }
    else setError(data.error || "Kunde inte hämta budget");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => ({
    budget: entries.reduce((sum, item) => sum + Number(item.budget || 0), 0),
    forecast: entries.reduce((sum, item) => sum + Number(item.forecast || 0), 0),
    actual: entries.reduce((sum, item) => sum + Number(item.actual || 0), 0),
  }), [entries]);
  const variance = totals.actual - totals.budget;

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
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const response = await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte spara budgetraden");
    else { setForm({ propertyId: "", year: String(new Date().getFullYear()), category: "operations", account: "", budget: "", forecast: "", actual: "", note: "" }); setSuccess("Budgetraden har sparats."); await load(); }
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
    else { setSuccess("Budgetraden har tagits bort."); await load(); }
    setRemovingId("");
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Ekonomisk styrning" title="Budget, prognos och utfall" description="Följ ekonomin per fastighet, år och kostnadsslag med tydliga avvikelser och en samlad styrningsbild." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={CircleDollarSign} label="Budget" value={money.format(totals.budget)} />
      <MetricCard icon={BarChart3} label="Prognos" value={money.format(totals.forecast)} />
      <MetricCard icon={TrendingUp} label="Utfall" value={money.format(totals.actual)} />
      <MetricCard label="Avvikelse mot budget" value={money.format(variance)} hint={variance > 0 ? "Över budget" : variance < 0 ? "Under budget" : "I linje med budget"} />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra budgetrader.</InlineAlert> : null}

    <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[390px_1fr]" : "grid-cols-1"}`}>
      {canManage ? (
        <Panel title="Ny budgetrad" description="Registrera budget, prognos och verkligt utfall per kostnadsslag.">
          <form onSubmit={submit} className="space-y-4">
            <select className={premiumFieldClass} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required aria-label="Välj fastighet"><option value="">Välj fastighet</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} aria-label="År" /><select className={premiumFieldClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Kategori">{Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <input className={premiumFieldClass} placeholder="Konto eller kostnadsslag" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} required aria-label="Konto eller kostnadsslag" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><input className={premiumFieldClass} type="number" placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} aria-label="Budget" /><input className={premiumFieldClass} type="number" placeholder="Prognos" value={form.forecast} onChange={(e) => setForm({ ...form, forecast: e.target.value })} aria-label="Prognos" /><input className={premiumFieldClass} type="number" placeholder="Utfall" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} aria-label="Utfall" /></div>
            <textarea className={premiumTextareaClass} placeholder="Kommentar" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Kommentar" />
            <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara budgetrad"}</button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Ekonomiskt utfall" description="Budget, prognos och utfall per fastighet och kostnadsslag." bodyClassName="p-0">
        {loading ? <p className="p-6 text-sm text-ink-500">Hämtar ekonomi…</p> : entries.length === 0 ? <EmptyState title="Inga budgetrader registrerade" description="Lägg till den första budgetraden för att börja följa ekonomiskt utfall." /> : <div className="divide-y divide-sand-100">{entries.map((item) => {
          const itemVariance = Number(item.variance_budget || 0);
          return <article key={item.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h3 className="font-semibold text-ink-900">{item.account}</h3>
                <p className="mt-1 text-sm text-ink-500">{item.property_name} · {categories[item.category || "other"]} · {item.year}</p>
                {item.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan uppdatering eller borttagning.</p> : null}
                <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-ink-500">
                  <span>Budget<strong className="mt-1 block text-ink-800">{money.format(Number(item.budget || 0))}</strong></span>
                  <span>Prognos<strong className="mt-1 block text-ink-800">{money.format(Number(item.forecast || 0))}</strong></span>
                  <span>Utfall<strong className="mt-1 block text-ink-800">{money.format(Number(item.actual || 0))}</strong></span>
                </div>
              </div>
              <div className="space-y-2 sm:text-right">
                <p className={`text-lg font-semibold ${itemVariance > 0 ? "text-red-700" : "text-petroleum-800"}`}>{money.format(itemVariance)}</p>
                <p className="text-xs text-ink-500">Avvikelse mot budget</p>
                {canManage && item.source !== "legacy" ? (
                  <>
                    <button type="button" onClick={() => (editingId === item.id ? setEditingId("") : startEdit(item))} className="block text-xs font-semibold text-petroleum-800 transition hover:text-petroleum-950 sm:ml-auto">
                      {editingId === item.id ? "Stäng" : "Ändra"}
                    </button>
                    <button type="button" disabled={removingId === item.id} onClick={() => void removeEntry(item)} className="block text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60 sm:ml-auto">
                      {removingId === item.id ? "Tar bort…" : "Ta bort"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {canManage && editingId === item.id && item.source !== "legacy" ? (
              <div className="mt-4 space-y-3 border-t border-sand-100 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className={premiumFieldClass} type="number" value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} aria-label="År" />
                  <select className={premiumFieldClass} value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} aria-label="Kategori">
                    {Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <input className={premiumFieldClass} placeholder="Konto" value={editForm.account} onChange={(e) => setEditForm({ ...editForm, account: e.target.value })} aria-label="Konto" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <input className={premiumFieldClass} type="number" placeholder="Budget" value={editForm.budget} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} aria-label="Budget" />
                  <input className={premiumFieldClass} type="number" placeholder="Prognos" value={editForm.forecast} onChange={(e) => setEditForm({ ...editForm, forecast: e.target.value })} aria-label="Prognos" />
                  <input className={premiumFieldClass} type="number" placeholder="Utfall" value={editForm.actual} onChange={(e) => setEditForm({ ...editForm, actual: e.target.value })} aria-label="Utfall" />
                </div>
                <textarea className={premiumTextareaClass} placeholder="Kommentar" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} aria-label="Kommentar" />
                <button type="button" disabled={updatingId === item.id} onClick={() => void saveEdit(item)} className={`${premiumPrimaryButtonClass} sm:w-auto`}>
                  {updatingId === item.id ? "Sparar…" : "Spara ändringar"}
                </button>
              </div>
            ) : null}
          </article>;
        })}</div>}
      </Panel>
    </section>
  </div>;
}
