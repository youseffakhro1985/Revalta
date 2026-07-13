"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, MessageSquareText, UsersRound } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";

type ResidentItem = { id: string; residentName: string; email?: string; phone?: string; propertyName?: string; unit?: string; subject: string; message: string; status: string; createdAt?: string };

export default function ResidentPortalPage() {
  const [items, setItems] = useState<ResidentItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ residentName: "", email: "", phone: "", propertyName: "", unit: "", subject: "", message: "" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/resident-portal", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setItems(data.items || []);
    else setError(data.error || "Kunde inte hämta boendekontakter");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const response = await fetch("/api/resident-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara boendekontakten");
    else { setForm({ residentName: "", email: "", phone: "", propertyName: "", unit: "", subject: "", message: "" }); setSuccess("Boendekontakten har registrerats."); await load(); }
    setSaving(false);
  }

  const visible = useMemo(() => items.filter((item) => `${item.residentName} ${item.propertyName || ""} ${item.unit || ""} ${item.subject}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const open = items.filter((item) => item.status !== "closed").length;
  const unread = items.filter((item) => item.status === "new").length;

  return <div className="space-y-8">
    <PageHeader eyebrow="Boendekontakt" title="Boendeportal" description="Samla boendes felanmälningar, frågor och kontaktuppgifter i en tydlig arbetsyta för både mobil och dator." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard icon={MessageSquareText} label="Aktiva kontakter" value={open} />
      <MetricCard icon={Inbox} label="Nya meddelanden" value={unread} />
      <MetricCard icon={UsersRound} label="Totalt registrerat" value={items.length} />
    </section>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Registrera boendekontakt" description="Används för felanmälan, frågor och andra meddelanden.">
        <form onSubmit={submit} className="space-y-4">
          <input required placeholder="Namn" value={form.residentName} onChange={(e) => setForm({ ...form, residentName: e.target.value })} className={premiumFieldClass} />
          <div className="grid gap-3 sm:grid-cols-2"><input type="email" placeholder="E-post" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={premiumFieldClass} /><input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={premiumFieldClass} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><input placeholder="Fastighet" value={form.propertyName} onChange={(e) => setForm({ ...form, propertyName: e.target.value })} className={premiumFieldClass} /><input placeholder="Lägenhet eller lokal" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={premiumFieldClass} /></div>
          <input required placeholder="Ämne" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={premiumFieldClass} />
          <textarea required placeholder="Beskriv ärendet" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={premiumTextareaClass} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara kontakt"}</button>
        </form>
      </Panel>

      <Panel title="Boendekontakter" description="Sök och följ inkomna kontakter från hela beståndet." bodyClassName="p-0">
        <div className="border-b border-sand-200 p-5"><input placeholder="Sök boende, fastighet, objekt eller ämne" value={query} onChange={(e) => setQuery(e.target.value)} className={premiumFieldClass} /></div>
        {loading ? <div className="space-y-3 p-6">{[1,2,3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div> : visible.length === 0 ? <EmptyState title="Inga boendekontakter" description="När ett meddelande registreras visas det här." /> : <div className="divide-y divide-sand-100">{visible.map((item) => <article key={item.id} className="grid gap-4 p-6 transition hover:bg-sand-50/70 md:grid-cols-[1.1fr_1.5fr_auto] md:items-center"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">{item.propertyName || "Ingen fastighet"}{item.unit ? ` · ${item.unit}` : ""}</p><h3 className="mt-1 font-semibold text-ink-900">{item.residentName}</h3><p className="mt-1 text-xs text-ink-400">{item.email || item.phone || "Kontaktuppgift saknas"}</p></div><div><p className="text-sm font-medium text-ink-800">{item.subject}</p><p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-500">{item.message}</p></div><span className="w-fit rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">{item.status === "new" ? "Ny" : item.status}</span></article>)}</div>}
      </Panel>
    </section>
  </div>;
}
