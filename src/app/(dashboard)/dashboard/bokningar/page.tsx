"use client";

import { useEffect, useState } from "react";

type Property = { id: string; name: string; city: string };
type Booking = { id: string; property_name?: string; resource: string; resident_name: string; unit?: string; start: string; end: string; status: string };
const resourceTypes = ["Tvättstuga", "Föreningslokal", "Gästlägenhet", "Parkering", "Bastu", "Övrigt"];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ propertyId: "", resource: "Tvättstuga", residentName: "", unit: "", start: "", end: "", note: "" });

  async function load() {
    const response = await fetch("/api/bookings", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setBookings(data.bookings || []);
    setProperties(data.properties || []);
    if (!form.propertyId && data.properties?.[0]?.id) setForm((value) => ({ ...value, propertyId: data.properties[0].id }));
  }

  useEffect(() => { load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Bokningen kunde inte sparas");
    else { setMessage("Bokningen är registrerad"); setForm((value) => ({ ...value, residentName: "", unit: "", start: "", end: "", note: "" })); await load(); }
    setSaving(false);
  }

  const upcoming = bookings.filter((booking) => new Date(booking.end).getTime() >= Date.now());
  const week = upcoming.filter((booking) => new Date(booking.start).getTime() <= Date.now() + 604800000).length;

  return <div className="space-y-8">
    <header><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Boendeservice</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Bokningar och resurser</h1><p className="mt-2 max-w-2xl text-sm text-ink-500">Hantera gemensamma resurser och undvik dubbelbokningar.</p></header>
    <section className="grid gap-4 md:grid-cols-3">{[["Kommande", upcoming.length], ["Nästa sju dagar", week], ["Resurstyper", resourceTypes.length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><p className="text-xs text-ink-400">{label}</p><p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p></div>)}</section>
    <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
        <h2 className="text-lg font-semibold text-ink-950">Ny bokning</h2>
        <select required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.city}</option>)}</select>
        <select value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm">{resourceTypes.map((resource) => <option key={resource}>{resource}</option>)}</select>
        <input required placeholder="Boendes namn" value={form.residentName} onChange={(e) => setForm({ ...form, residentName: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
        <input placeholder="Lägenhet/lokal" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
        <input required type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
        <input required type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
        <textarea placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-24 w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
        {message && <p className="text-sm text-petroleum-700">{message}</p>}
        <button disabled={saving} className="w-full rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sparar…" : "Registrera bokning"}</button>
      </form>
      <div className="rounded-2xl border border-sand-200 bg-white shadow-premium-sm"><div className="border-b border-sand-200 p-5"><h2 className="font-semibold text-ink-950">Bokningsöversikt</h2></div><div className="divide-y divide-sand-200">{bookings.length === 0 ? <p className="p-8 text-sm text-ink-400">Inga bokningar registrerade ännu.</p> : bookings.map((booking) => <article key={booking.id} className="grid gap-3 p-5 md:grid-cols-[1.2fr_1fr_auto] md:items-center"><div><p className="text-xs font-semibold uppercase tracking-wide text-petroleum-700">{booking.resource}</p><h3 className="mt-1 font-semibold text-ink-950">{booking.resident_name}</h3><p className="text-sm text-ink-500">{booking.property_name || "Fastighet"}{booking.unit ? ` · ${booking.unit}` : ""}</p></div><div><p className="text-sm font-medium text-ink-800">{new Date(booking.start).toLocaleString("sv-SE")}</p><p className="text-xs text-ink-400">Till {new Date(booking.end).toLocaleString("sv-SE")}</p></div><span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-700">Bekräftad</span></article>)}</div></div>
    </section>
  </div>;
}
