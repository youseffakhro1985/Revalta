"use client";

import { useEffect, useMemo, useState } from "react";

type Vendor = {
  id: string;
  name: string;
  category: string;
  contactName?: string;
  email?: string;
  phone?: string;
  contractTitle?: string;
  contractValue?: number;
  endDate?: string | null;
  noticeMonths?: number;
};

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Teknisk service", contactName: "", email: "", phone: "", contractTitle: "", contractValue: "", endDate: "", noticeMonths: "3" });

  async function load() {
    const response = await fetch("/api/vendors", { cache: "no-store" });
    if (response.ok) setVendors((await response.json()).vendors || []);
  }

  useEffect(() => { load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (response.ok) {
      setForm({ name: "", category: "Teknisk service", contactName: "", email: "", phone: "", contractTitle: "", contractValue: "", endDate: "", noticeMonths: "3" });
      await load();
    }
    setSaving(false);
  }

  const visible = useMemo(() => vendors.filter((vendor) => `${vendor.name} ${vendor.category} ${vendor.contactName || ""}`.toLowerCase().includes(query.toLowerCase())), [vendors, query]);
  const expiring = vendors.filter((vendor) => vendor.endDate && new Date(vendor.endDate).getTime() < Date.now() + 1000 * 60 * 60 * 24 * 120).length;
  const totalValue = vendors.reduce((sum, vendor) => sum + Number(vendor.contractValue || 0), 0);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Leverantörsstyrning</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Leverantörer och avtal</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">Samla kontaktuppgifter, avtalsvärden, uppsägningstider och kommande avtalsbevakning på ett ställe.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[['Aktiva leverantörer', vendors.length], ['Avtal inom 120 dagar', expiring], ['Samlat avtalsvärde', currency.format(totalValue)]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <p className="text-xs font-medium text-ink-400">{label}</p><p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <h2 className="text-lg font-semibold text-ink-950">Lägg till leverantör</h2>
          <input required placeholder="Företagsnamn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm"><option>Teknisk service</option><option>Bygg</option><option>El</option><option>VVS</option><option>Mark och utemiljö</option><option>Ekonomisk förvaltning</option><option>Övrigt</option></select>
          <input placeholder="Kontaktperson" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <div className="grid grid-cols-2 gap-3"><input placeholder="E-post" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" /><input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" /></div>
          <input placeholder="Avtalsnamn" value={form.contractTitle} onChange={(e) => setForm({ ...form, contractTitle: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <div className="grid grid-cols-2 gap-3"><input type="number" placeholder="Årsvärde exkl. moms" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" /><input type="number" placeholder="Uppsägning mån" value={form.noticeMonths} onChange={(e) => setForm({ ...form, noticeMonths: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" /></div>
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <button disabled={saving} className="w-full rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50">{saving ? "Sparar…" : "Spara leverantör"}</button>
        </form>

        <div className="rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 p-5"><input placeholder="Sök leverantör, kategori eller kontaktperson" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" /></div>
          <div className="divide-y divide-sand-200">
            {visible.length === 0 ? <p className="p-8 text-sm text-ink-400">Inga leverantörer registrerade ännu.</p> : visible.map((vendor) => (
              <article key={vendor.id} className="grid gap-4 p-5 md:grid-cols-[1.4fr_1fr_auto] md:items-center">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-700">{vendor.category}</p><h3 className="mt-1 font-semibold text-ink-950">{vendor.name}</h3><p className="mt-1 text-sm text-ink-500">{vendor.contactName || "Ingen kontaktperson"}{vendor.email ? ` · ${vendor.email}` : ""}</p></div>
                <div><p className="text-sm font-medium text-ink-800">{vendor.contractTitle || "Inget avtal angivet"}</p><p className="mt-1 text-xs text-ink-400">Uppsägning {vendor.noticeMonths || 0} mån · {vendor.endDate ? `slut ${new Date(vendor.endDate).toLocaleDateString("sv-SE")}` : "inget slutdatum"}</p></div>
                <p className="text-sm font-semibold text-ink-950">{currency.format(Number(vendor.contractValue || 0))}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
