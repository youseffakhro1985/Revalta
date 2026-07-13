"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardSignature } from "lucide-react";

type Property = { id: string; name: string; address: string; city: string };
type Inspection = {
  id: string;
  property_id?: string;
  property_name?: string;
  type?: string;
  title?: string;
  due_date?: string;
  responsible?: string;
  supplier?: string;
  interval_months?: number;
  status?: string;
  note?: string;
  created_at: string;
};

const typeLabels: Record<string, string> = {
  ovk: "OVK",
  sba: "SBA",
  elevator: "Hiss",
  energy: "Energideklaration",
  radon: "Radon",
  pressure: "Trycksatta anordningar",
  playground: "Lekplats",
  electrical: "Elrevision",
  other: "Övrig kontroll",
};

const statusLabels: Record<string, string> = {
  planned: "Planerad",
  booked: "Bokad",
  completed: "Genomförd",
  action_required: "Åtgärd krävs",
};

function daysUntil(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", type: "ovk", title: "", dueDate: "", responsible: "", supplier: "", intervalMonths: "36", status: "planned", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/inspections", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setInspections(data.inspections || []);
      setProperties(data.properties || []);
    } else setError(data.error || "Kunde inte hämta besiktningar");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    overdue: inspections.filter((item) => item.status !== "completed" && daysUntil(item.due_date) < 0).length,
    upcoming: inspections.filter((item) => item.status !== "completed" && daysUntil(item.due_date) >= 0 && daysUntil(item.due_date) <= 60).length,
    action: inspections.filter((item) => item.status === "action_required").length,
    completed: inspections.filter((item) => item.status === "completed").length,
  }), [inspections]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara kontrollen");
    else {
      setForm({ propertyId: "", type: "ovk", title: "", dueDate: "", responsible: "", supplier: "", intervalMonths: "36", status: "planned", note: "" });
      await load();
    }
    setSaving(false);
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";
  const sorted = [...inspections].sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));

  return <div className="space-y-8">
    <header>
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Efterlevnad och kontroll</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Besiktningar och myndighetskrav</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Samla OVK, SBA, hisskontroller, energideklarationer, radon och övriga återkommande krav i en trygg och tydlig bevakning.</p>
    </header>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        [AlertTriangle, "Försenade", String(summary.overdue)],
        [CalendarClock, "Inom 60 dagar", String(summary.upcoming)],
        [ClipboardSignature, "Åtgärd krävs", String(summary.action)],
        [CheckCircle2, "Genomförda", String(summary.completed)],
      ].map(([Icon, label, value]) => { const C = Icon as typeof AlertTriangle; return <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><C className="h-5 w-5 text-petroleum-700" strokeWidth={1.6}/><p className="mt-5 text-xs font-medium text-ink-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{String(value)}</p></div>; })}
    </section>

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <h2 className="font-display text-xl font-semibold text-ink-900">Ny kontroll</h2>
        <p className="mt-1 text-sm text-ink-500">Lägg in nästa förfallodatum och ansvarig part.</p>
        <div className="mt-6 space-y-4">
          <select className={field} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input className={field} placeholder="Kontroll eller besiktning" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3"><input className={field} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required /><input className={field} type="number" min="0" max="240" placeholder="Intervall månader" value={form.intervalMonths} onChange={(e) => setForm({ ...form, intervalMonths: e.target.value })} /></div>
          <input className={field} placeholder="Ansvarig internt" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          <input className={field} placeholder="Besiktningsföretag eller leverantör" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <textarea className="min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500" placeholder="Anteckning eller krav" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white hover:bg-petroleum-800 disabled:opacity-60">{saving ? "Sparar…" : "Spara kontroll"}</button>
        </div>
      </form>

      <div className="rounded-2xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Kontrollplan</h2><p className="mt-1 text-sm text-ink-500">Kommande krav sorterade efter förfallodatum.</p></div>
        <div className="divide-y divide-sand-200">{loading ? <p className="p-6 text-sm text-ink-500">Hämtar kontroller…</p> : sorted.length === 0 ? <div className="p-10 text-center"><ClipboardSignature className="mx-auto h-7 w-7 text-ink-300"/><p className="mt-3 text-sm text-ink-500">Inga besiktningar registrerade ännu.</p></div> : sorted.map((item) => {
          const days = daysUntil(item.due_date);
          const urgent = item.status !== "completed" && days <= 60;
          return <article key={item.id} className="p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{item.title}</h3><span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{typeLabels[item.type || "other"]}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${urgent ? "bg-red-50 text-red-700" : "bg-petroleum-50 text-petroleum-700"}`}>{statusLabels[item.status || "planned"]}</span></div>
                <p className="mt-1 text-sm text-ink-500">{item.property_name}{item.supplier ? ` · ${item.supplier}` : ""}</p>
              </div>
              <div className="text-left sm:text-right"><p className="text-sm font-semibold text-ink-900">{item.due_date ? new Date(`${item.due_date}T00:00:00`).toLocaleDateString("sv-SE") : "—"}</p><p className={`mt-1 text-xs ${urgent ? "text-red-700" : "text-ink-400"}`}>{days < 0 ? `${Math.abs(days)} dagar försenad` : days === 0 ? "Förfaller idag" : `${days} dagar kvar`}</p></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-ink-500 md:grid-cols-3"><span>Ansvarig<strong className="mt-1 block text-ink-800">{item.responsible || "Ej utsedd"}</strong></span><span>Intervall<strong className="mt-1 block text-ink-800">{Number(item.interval_months || 0) ? `${item.interval_months} månader` : "Engångskontroll"}</strong></span><span>Anteckning<strong className="mt-1 block text-ink-800">{item.note || "Ingen anteckning"}</strong></span></div>
          </article>;
        })}</div>
      </div>
    </section>
  </div>;
}
