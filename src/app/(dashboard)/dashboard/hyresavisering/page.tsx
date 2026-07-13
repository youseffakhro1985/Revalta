"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, CircleDollarSign, ReceiptText } from "lucide-react";

type Lease = { id: string; property_id?: string; property_name?: string; tenant_name?: string; unit?: string; monthly_rent?: number; status?: string };
type Property = { id: string; name: string };
type Notice = { id: string; property_name?: string; tenant_name?: string; unit?: string; period?: string; due_date?: string; status?: string; index_percent?: number; total?: number; created_at: string };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const labels: Record<string, string> = { draft: "Utkast", sent: "Skickad", paid: "Betald", overdue: "Förfallen", credited: "Krediterad" };

export default function RentNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", leaseId: "", tenantName: "", unit: "", period: "", dueDate: "", status: "draft", baseRent: "", additions: "", deductions: "", indexPercent: "0", note: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/rent-notices", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setNotices(data.notices || []); setLeases(data.leases || []); setProperties(data.properties || []); }
    else setError(data.error || "Kunde inte hämta hyresavier");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: notices.reduce((sum, item) => sum + Number(item.total || 0), 0),
    paid: notices.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total || 0), 0),
    overdue: notices.filter((item) => item.status === "overdue" || (item.due_date && new Date(item.due_date) < new Date() && item.status !== "paid" && item.status !== "credited")).length,
  }), [notices]);

  function selectLease(leaseId: string) {
    const lease = leases.find((item) => item.id === leaseId);
    setForm((current) => ({ ...current, leaseId, propertyId: lease?.property_id || current.propertyId, tenantName: lease?.tenant_name || "", unit: lease?.unit || "", baseRent: String(lease?.monthly_rent || "") }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch("/api/rent-notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte skapa hyresavin");
    else { setForm({ propertyId: "", leaseId: "", tenantName: "", unit: "", period: "", dueDate: "", status: "draft", baseRent: "", additions: "", deductions: "", indexPercent: "0", note: "" }); await load(); }
    setSaving(false);
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return <div className="space-y-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">Hyresadministration</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Hyresavisering och index</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">Skapa hyresavier, hantera indexuppräkning och följ betalningsstatus per objekt och period.</p></header>

    <section className="grid gap-4 md:grid-cols-3">
      {[[CircleDollarSign, "Aviserat totalt", money.format(summary.total)], [BadgeCheck, "Betalt", money.format(summary.paid)], [CalendarClock, "Förfallna", String(summary.overdue)]].map(([Icon, label, value]) => { const C = Icon as typeof CircleDollarSign; return <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5"><C className="h-5 w-5 text-petroleum-700" strokeWidth={1.6}/><p className="mt-5 text-xs font-medium text-ink-500">{String(label)}</p><p className="mt-1 text-2xl font-semibold text-ink-900">{String(value)}</p></div>; })}
    </section>

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6">
        <h2 className="font-display text-xl font-semibold text-ink-900">Ny hyresavi</h2>
        <div className="mt-6 space-y-4">
          <select className={field} value={form.leaseId} onChange={(e) => selectLease(e.target.value)}><option value="">Välj kontrakt</option>{leases.filter((lease) => lease.status === "active" || lease.status === "notice").map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit} · {lease.tenant_name || "Ingen hyresgäst"}</option>)}</select>
          <select className={field} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <div className="grid grid-cols-2 gap-3"><input className={field} placeholder="Hyresgäst" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })}/><input className={field} placeholder="Objekt" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}/></div>
          <div className="grid grid-cols-2 gap-3"><input className={field} type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required/><input className={field} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required/></div>
          <div className="grid grid-cols-2 gap-3"><input className={field} type="number" min="0" placeholder="Grundhyra" value={form.baseRent} onChange={(e) => setForm({ ...form, baseRent: e.target.value })}/><input className={field} type="number" min="0" step="0.01" placeholder="Index %" value={form.indexPercent} onChange={(e) => setForm({ ...form, indexPercent: e.target.value })}/></div>
          <div className="grid grid-cols-2 gap-3"><input className={field} type="number" min="0" placeholder="Tillägg" value={form.additions} onChange={(e) => setForm({ ...form, additions: e.target.value })}/><input className={field} type="number" min="0" placeholder="Avdrag" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })}/></div>
          <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <textarea className="min-h-24 w-full rounded-lg border border-sand-200 px-3 py-3 text-sm outline-none focus:border-petroleum-500" placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}/>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="h-11 w-full rounded-lg bg-petroleum-700 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Sparar…" : "Skapa hyresavi"}</button>
        </div>
      </form>

      <div className="rounded-2xl border border-sand-200 bg-white">
        <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Avier och betalningsläge</h2></div>
        <div className="divide-y divide-sand-200">{loading ? <p className="p-6 text-sm text-ink-500">Hämtar hyresavier…</p> : notices.length === 0 ? <div className="p-10 text-center"><ReceiptText className="mx-auto h-7 w-7 text-ink-300"/><p className="mt-3 text-sm text-ink-500">Inga hyresavier registrerade ännu.</p></div> : notices.map((notice) => <article key={notice.id} className="p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{notice.tenant_name || "Hyresavi"}</h3><span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{labels[notice.status || "draft"]}</span></div><p className="mt-1 text-sm text-ink-500">{notice.property_name}{notice.unit ? ` · ${notice.unit}` : ""}</p><p className="mt-2 text-xs text-ink-400">Period {notice.period || "–"} · Förfaller {notice.due_date || "–"}</p></div><div className="text-left sm:text-right"><p className="text-xl font-semibold text-ink-900">{money.format(Number(notice.total || 0))}</p><p className="text-xs text-ink-400">Index {Number(notice.index_percent || 0).toLocaleString("sv-SE")} %</p></div></div></article>)}</div>
      </div>
    </section>
  </div>;
}
