"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CircleDollarSign, DoorOpen, UsersRound } from "lucide-react";

type Property = { id: string; name: string; address: string; city: string };
type Lease = { id: string; property_name?: string; object_type?: string; unit?: string; tenant_name?: string; status?: string; start_date?: string | null; end_date?: string | null; notice_date?: string | null; monthly_rent?: number; annual_rent?: number; area?: number; created_at: string };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const statuses: Record<string, string> = { vacant: "Ledig", reserved: "Reserverad", active: "Uthyrd", notice: "Uppsagd", ended: "Avslutad" };
const types: Record<string, string> = { apartment: "Lägenhet", commercial: "Lokal", parking: "Parkering", garage: "Garage", storage: "Förråd", other: "Övrigt" };

export default function LeasingPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", objectType: "apartment", unit: "", tenantName: "", status: "vacant", startDate: "", endDate: "", noticeDate: "", monthlyRent: "", area: "", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/leases", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setLeases(data.leases || []); setProperties(data.properties || []); } else setError(data.error || "Kunde inte hämta uthyrningen");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => {
    const active = leases.filter((lease) => lease.status === "active");
    const vacant = leases.filter((lease) => lease.status === "vacant");
    return {
      objects: leases.length,
      active: active.length,
      vacant: vacant.length,
      annualRent: active.reduce((sum, lease) => sum + Number(lease.annual_rent || 0), 0),
      vacancyLoss: vacant.reduce((sum, lease) => sum + Number(lease.annual_rent || 0), 0),
    };
  }, [leases]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/leases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara objektet");
    else { setForm({ propertyId: "", objectType: "apartment", unit: "", tenantName: "", status: "vacant", startDate: "", endDate: "", noticeDate: "", monthlyRent: "", area: "", note: "" }); await load(); }
    setSaving(false);
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return <div className="space-y-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Kommersiell förvaltning</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Uthyrning och vakans</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Samla objekt, hyresgäster, kontrakt, hyror och lediga ytor i en tydlig portföljöversikt.</p></header>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {[[Building2,"Objekt",summary.objects],[UsersRound,"Uthyrda",summary.active],[DoorOpen,"Lediga",summary.vacant],[CircleDollarSign,"Årshyra",money.format(summary.annualRent)],[CircleDollarSign,"Vakansvärde",money.format(summary.vacancyLoss)]].map(([Icon,label,value]) => { const C = Icon as typeof Building2; return <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><C className="h-5 w-5 text-petroleum-700" strokeWidth={1.6}/><p className="mt-5 text-xs font-medium text-ink-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{String(value)}</p></div>; })}
    </section>

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <h2 className="font-display text-xl font-semibold text-ink-900">Registrera objekt</h2><p className="mt-1 text-sm text-ink-500">Lägg till uthyrning, vakans eller uppsägning.</p>
        <div className="mt-6 space-y-4">
          <select className={field} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <div className="grid grid-cols-2 gap-3"><select className={field} value={form.objectType} onChange={(e) => setForm({ ...form, objectType: e.target.value })}>{Object.entries(types).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(statuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <input className={field} placeholder="Objektsnummer / lägenhet / lokal" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
          <input className={field} placeholder="Hyresgäst" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} />
          <div className="grid grid-cols-2 gap-3"><input className={field} type="number" min="0" placeholder="Månadshyra" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })}/><input className={field} type="number" min="0" placeholder="Area m²" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}/></div>
          <div className="grid grid-cols-3 gap-2"><input className={field} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}/><input className={field} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}/><input className={field} type="date" value={form.noticeDate} onChange={(e) => setForm({ ...form, noticeDate: e.target.value })}/></div>
          <textarea className="min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500" placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}/>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white hover:bg-petroleum-800 disabled:opacity-60">{saving ? "Sparar…" : "Spara objekt"}</button>
        </div>
      </form>

      <div className="rounded-2xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
        <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Objekt och kontrakt</h2><p className="mt-1 text-sm text-ink-500">Aktuellt uthyrningsläge i beståndet.</p></div>
        <div className="divide-y divide-sand-200">{loading ? <p className="p-6 text-sm text-ink-500">Hämtar objekt…</p> : leases.length === 0 ? <p className="p-10 text-center text-sm text-ink-500">Inga objekt registrerade ännu.</p> : leases.map((lease) => <article key={lease.id} className="p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{lease.unit}</h3><span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{types[lease.object_type || "other"]}</span><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{statuses[lease.status || "vacant"]}</span></div><p className="mt-1 text-sm text-ink-500">{lease.property_name}{lease.tenant_name ? ` · ${lease.tenant_name}` : ""}</p></div><div className="sm:text-right"><p className="text-lg font-semibold text-ink-900">{money.format(Number(lease.monthly_rent || 0))}/mån</p><p className="text-xs text-ink-400">{Number(lease.area || 0)} m²</p></div></div></article>)}</div>
      </div>
    </section>
  </div>;
}
