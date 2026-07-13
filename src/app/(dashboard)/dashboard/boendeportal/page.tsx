"use client";

import { useEffect, useMemo, useState } from "react";

type ResidentItem = {
  id: string;
  residentName: string;
  email?: string;
  phone?: string;
  propertyName?: string;
  unit?: string;
  subject: string;
  message: string;
  status: string;
  createdAt?: string;
};

export default function ResidentPortalPage() {
  const [items, setItems] = useState<ResidentItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ residentName: "", email: "", phone: "", propertyName: "", unit: "", subject: "", message: "" });

  async function load() {
    const response = await fetch("/api/resident-portal", { cache: "no-store" });
    if (response.ok) setItems((await response.json()).items || []);
  }

  useEffect(() => { load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/resident-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      setForm({ residentName: "", email: "", phone: "", propertyName: "", unit: "", subject: "", message: "" });
      await load();
    }
    setSaving(false);
  }

  const visible = useMemo(() => items.filter((item) => `${item.residentName} ${item.propertyName || ""} ${item.unit || ""} ${item.subject}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const open = items.filter((item) => item.status !== "closed").length;
  const unread = items.filter((item) => item.status === "new").length;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Boendekontakt</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Boendeportal</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">Samla boendes felanmälningar, frågor och kontaktuppgifter i en tydlig arbetsyta som fungerar lika bra på mobil som dator.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[["Aktiva kontakter", open], ["Nya meddelanden", unread], ["Totalt registrerat", items.length]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <p className="text-xs font-medium text-ink-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">Registrera boendekontakt</h2>
            <p className="mt-1 text-sm text-ink-400">Används för felanmälan, frågor och meddelanden.</p>
          </div>
          <input required placeholder="Namn" value={form.residentName} onChange={(e) => setForm({ ...form, residentName: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="E-post" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" />
            <input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Fastighet" value={form.propertyName} onChange={(e) => setForm({ ...form, propertyName: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" />
            <input placeholder="Lägenhet/lokal" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          </div>
          <input required placeholder="Ämne" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <textarea required rows={5} placeholder="Beskriv ärendet" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <button disabled={saving} className="w-full rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50">{saving ? "Sparar…" : "Spara kontakt"}</button>
        </form>

        <div className="rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 p-5">
            <input placeholder="Sök boende, fastighet, lägenhet eller ämne" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          </div>
          <div className="divide-y divide-sand-200">
            {visible.length === 0 ? <p className="p-8 text-sm text-ink-400">Inga boendekontakter registrerade ännu.</p> : visible.map((item) => (
              <article key={item.id} className="grid gap-4 p-5 md:grid-cols-[1.2fr_1.6fr_auto] md:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-petroleum-700">{item.propertyName || "Ingen fastighet"}{item.unit ? ` · ${item.unit}` : ""}</p>
                  <h3 className="mt-1 font-semibold text-ink-950">{item.residentName}</h3>
                  <p className="mt-1 text-xs text-ink-400">{item.email || item.phone || "Kontaktuppgift saknas"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-800">{item.subject}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">{item.message}</p>
                </div>
                <span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{item.status === "new" ? "Ny" : item.status}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
