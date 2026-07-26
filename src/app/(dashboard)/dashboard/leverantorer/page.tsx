"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CalendarClock, CircleDollarSign } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

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
  status?: string;
  source?: "table" | "legacy";
};
const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const statusLabels: Record<string, string> = { active: "Aktiv", ended: "Avslutad", cancelled: "Makulerad" };

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", category: "Teknisk service", contactName: "", email: "", phone: "", contractTitle: "", contractValue: "", endDate: "", noticeMonths: "3" });

  async function load() {
    setLoading(true);
    const response = await fetch("/api/vendors", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setVendors(data.vendors || []);
    else setError(data.error || "Kunde inte hämta leverantörer");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const response = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte spara leverantören");
    else { setForm({ name: "", category: "Teknisk service", contactName: "", email: "", phone: "", contractTitle: "", contractValue: "", endDate: "", noticeMonths: "3" }); setSuccess("Leverantören har registrerats."); await load(); }
    setSaving(false);
  }

  async function updateStatus(vendor: Vendor, status: string) {
    if (vendor.source === "legacy") {
      setError("Leverantören finns i äldre lagring. Kör backfill till VendorContract innan status ändras.");
      return;
    }
    if (status === vendor.status) return;
    setUpdatingId(vendor.id);
    setError("");
    setSuccess("");
    const response = await fetch("/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: vendor.id, status }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte uppdatera status");
    else {
      setSuccess("Leverantörens status har uppdaterats.");
      await load();
    }
    setUpdatingId("");
  }

  const visible = useMemo(() => vendors.filter((vendor) => `${vendor.name} ${vendor.category} ${vendor.contactName || ""}`.toLowerCase().includes(query.toLowerCase())), [vendors, query]);
  const activeCount = vendors.filter((vendor) => (vendor.status || "active") === "active").length;
  const expiring = vendors.filter((vendor) => vendor.endDate && new Date(vendor.endDate).getTime() < Date.now() + 120 * 86400000).length;
  const totalValue = vendors.reduce((sum, vendor) => sum + Number(vendor.contractValue || 0), 0);

  return <div className="space-y-8">
    <PageHeader eyebrow="Leverantörsstyrning" title="Leverantörer och avtal" description="Samla kontaktuppgifter, avtalsvärden, uppsägningstider och kommande avtalsbevakning i en gemensam vy." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard icon={BriefcaseBusiness} label="Aktiva leverantörer" value={activeCount} />
      <MetricCard icon={CalendarClock} label="Avtal inom 120 dagar" value={expiring} />
      <MetricCard icon={CircleDollarSign} label="Samlat avtalsvärde" value={currency.format(totalValue)} />
    </section>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Lägg till leverantör" description="Registrera leverantör, kontakt och avtalsbevakning.">
        <form onSubmit={submit} className="space-y-4">
          <input required placeholder="Företagsnamn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={premiumFieldClass} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={premiumFieldClass}>{["Teknisk service","Bygg","El","VVS","Mark och utemiljö","Ekonomisk förvaltning","Övrigt"].map((item) => <option key={item}>{item}</option>)}</select>
          <input placeholder="Kontaktperson" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={premiumFieldClass} />
          <div className="grid gap-3 sm:grid-cols-2"><input type="email" placeholder="E-post" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={premiumFieldClass} /><input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={premiumFieldClass} /></div>
          <input placeholder="Avtalsnamn" value={form.contractTitle} onChange={(e) => setForm({ ...form, contractTitle: e.target.value })} className={premiumFieldClass} />
          <div className="grid gap-3 sm:grid-cols-2"><input type="number" min="0" placeholder="Årsvärde exkl. moms" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} className={premiumFieldClass} /><input type="number" min="0" placeholder="Uppsägning månader" value={form.noticeMonths} onChange={(e) => setForm({ ...form, noticeMonths: e.target.value })} className={premiumFieldClass} /></div>
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={premiumFieldClass} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara leverantör"}</button>
        </form>
      </Panel>

      <Panel title="Leverantörsregister" description="Sök avtal, kategorier och kontaktpersoner." bodyClassName="p-0">
        <div className="border-b border-sand-200 p-5"><input placeholder="Sök leverantör, kategori eller kontaktperson" value={query} onChange={(e) => setQuery(e.target.value)} className={premiumFieldClass} /></div>
        {loading ? <div className="space-y-3 p-6">{[1,2,3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div> : visible.length === 0 ? <EmptyState title="Inga leverantörer" description="När en leverantör registreras visas den här." /> : (
          <div className="divide-y divide-sand-100">
            {visible.map((vendor) => (
              <article key={vendor.id} className="grid gap-4 p-6 transition hover:bg-sand-50/70 md:grid-cols-[1.35fr_1fr_auto] md:items-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">{vendor.category}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink-900">{vendor.name}</h3>
                    <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                      {statusLabels[vendor.status || "active"]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{vendor.contactName || "Ingen kontaktperson"}{vendor.email ? ` · ${vendor.email}` : ""}</p>
                  {vendor.source === "legacy" ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan status kan ändras.</p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-800">{vendor.contractTitle || "Inget avtal angivet"}</p>
                  <p className="mt-1 text-xs text-ink-400">Uppsägning {vendor.noticeMonths || 0} mån · {vendor.endDate ? `slut ${new Date(vendor.endDate).toLocaleDateString("sv-SE")}` : "inget slutdatum"}</p>
                  {vendor.source !== "legacy" ? (
                    <select
                      disabled={updatingId === vendor.id}
                      value={vendor.status || "active"}
                      onChange={(event) => void updateStatus(vendor, event.target.value)}
                      className="mt-3 h-9 rounded-lg border border-sand-200 bg-white px-2 text-xs text-ink-700 outline-none focus:border-petroleum-500"
                      aria-label={`Ändra status för ${vendor.name}`}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <p className="font-semibold text-ink-900">{currency.format(Number(vendor.contractValue || 0))}</p>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </section>
  </div>;
}
