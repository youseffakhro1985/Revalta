"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CalendarClock, CircleDollarSign, Layers3, Pencil, Plus, Search } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

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
const categories = ["Teknisk service", "Bygg", "El", "VVS", "Mark och utemiljö", "Ekonomisk förvaltning", "Övrigt"];

function statusClass(status?: string) {
  if (status === "ended") return "border-sand-200 bg-sand-100 text-ink-500";
  if (status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  return "border-petroleum-100 bg-petroleum-50 text-petroleum-800";
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    category: "Övrigt",
    contactName: "",
    email: "",
    phone: "",
    contractTitle: "",
    contractValue: "",
    endDate: "",
    noticeMonths: "0",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", category: "Teknisk service", contactName: "", email: "", phone: "", contractTitle: "", contractValue: "", endDate: "", noticeMonths: "3" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/vendors", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta leverantörer");
      setVendors(data.vendors || []);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta leverantörer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setEditForm({
      name: vendor.name || "",
      category: vendor.category || "Övrigt",
      contactName: vendor.contactName || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      contractTitle: vendor.contractTitle || "",
      contractValue: String(vendor.contractValue ?? ""),
      endDate: vendor.endDate || "",
      noticeMonths: String(vendor.noticeMonths ?? "0"),
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara leverantören");
      setForm({ name: "", category: "Teknisk service", contactName: "", email: "", phone: "", contractTitle: "", contractValue: "", endDate: "", noticeMonths: "3" });
      setSuccess("Leverantören har registrerats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara leverantören");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(vendor: Vendor, status: string) {
    if (vendor.source === "legacy") {
      setError("Leverantören finns i äldre lagring. Kör backfill till VendorContract innan den kan uppdateras.");
      return;
    }
    if (status === vendor.status) return;
    setUpdatingId(vendor.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendor.id, status }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera status");
      setSuccess("Leverantörens status har uppdaterats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera status");
    } finally {
      setUpdatingId("");
    }
  }

  async function saveEdit(vendor: Vendor) {
    if (vendor.source === "legacy") {
      setError("Leverantören finns i äldre lagring. Kör backfill till VendorContract innan den kan uppdateras.");
      return;
    }
    setUpdatingId(vendor.id);
    setError("");
    setSuccess("");
    const isActive = (vendor.status || "active") === "active";
    const payload: Record<string, unknown> = {
      vendorId: vendor.id,
      contactName: editForm.contactName,
      email: editForm.email,
      phone: editForm.phone,
    };
    if (isActive) {
      payload.name = editForm.name;
      payload.category = editForm.category;
      payload.contractTitle = editForm.contractTitle;
      payload.contractValue = editForm.contractValue;
      payload.endDate = editForm.endDate;
      payload.noticeMonths = editForm.noticeMonths;
    }
    try {
      const response = await fetch("/api/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera leverantören");
      setSuccess("Leverantören har uppdaterats.");
      setEditingId("");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera leverantören");
    } finally {
      setUpdatingId("");
    }
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return vendors
      .filter((vendor) => !normalized || `${vendor.name} ${vendor.category} ${vendor.contactName || ""} ${vendor.contractTitle || ""}`.toLowerCase().includes(normalized))
      .sort((a, b) => {
        const aActive = (a.status || "active") === "active" ? 0 : 1;
        const bActive = (b.status || "active") === "active" ? 0 : 1;
        return aActive - bActive || a.name.localeCompare(b.name, "sv");
      });
  }, [vendors, query]);

  const activeCount = vendors.filter((vendor) => (vendor.status || "active") === "active").length;
  const expiring = vendors.filter((vendor) => vendor.endDate && (vendor.status || "active") === "active" && new Date(vendor.endDate).getTime() >= Date.now() && new Date(vendor.endDate).getTime() < Date.now() + 120 * 86400000).length;
  const totalValue = vendors.filter((vendor) => (vendor.status || "active") === "active").reduce((sum, vendor) => sum + Number(vendor.contractValue || 0), 0);
  const categoryCount = new Set(vendors.filter((vendor) => (vendor.status || "active") === "active").map((vendor) => vendor.category)).size;

  return (
    <div className="space-y-8 animate-fade-in-soft">
      <PageHeader
        eyebrow="Organisation · Leverantörsstyrning"
        title="Leverantörer och avtal"
        description="Samla kontaktuppgifter, avtalsvärden, uppsägningstider och kommande avtalsbevakning i ett professionellt leverantörsregister."
        action={(
          <a href="#ny-leverantor" className={premiumPrimaryButtonClass}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Ny leverantör
          </a>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BriefcaseBusiness} label="Aktiva leverantörer" value={activeCount} hint={`${vendors.length} leverantörer totalt i registret`} />
        <MetricCard icon={CalendarClock} label="Avtal inom 120 dagar" value={expiring} hint="Aktiva avtal med närliggande slutdatum" />
        <MetricCard icon={CircleDollarSign} label="Samlat avtalsvärde" value={currency.format(totalValue)} hint="Registrerat årsvärde för aktiva avtal" />
        <MetricCard icon={Layers3} label="Leverantörskategorier" value={categoryCount} hint="Aktiva kategorier i leverantörsbasen" />
      </section>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

      <section className="grid items-start gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Panel title="Lägg till leverantör" description="Registrera kontakt, kategori och avtalsbevakning." className="xl:sticky xl:top-[118px]">
          <form id="ny-leverantor" onSubmit={submit} className="space-y-4">
            <input required placeholder="Företagsnamn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={premiumFieldClass} aria-label="Företagsnamn" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={premiumFieldClass} aria-label="Kategori">{categories.map((item) => <option key={item}>{item}</option>)}</select>
            <input placeholder="Kontaktperson" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={premiumFieldClass} aria-label="Kontaktperson" />
            <div className="grid gap-3 sm:grid-cols-2"><input type="email" placeholder="E-post" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={premiumFieldClass} aria-label="E-post" /><input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={premiumFieldClass} aria-label="Telefon" /></div>
            <input placeholder="Avtalsnamn" value={form.contractTitle} onChange={(e) => setForm({ ...form, contractTitle: e.target.value })} className={premiumFieldClass} aria-label="Avtalsnamn" />
            <div className="grid gap-3 sm:grid-cols-2"><input type="number" min="0" placeholder="Årsvärde exkl. moms" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} className={premiumFieldClass} aria-label="Årsvärde exkl. moms" /><input type="number" min="0" placeholder="Uppsägning månader" value={form.noticeMonths} onChange={(e) => setForm({ ...form, noticeMonths: e.target.value })} className={premiumFieldClass} aria-label="Uppsägning månader" /></div>
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={premiumFieldClass} aria-label="Slutdatum" />
            <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Spara leverantör"}</button>
          </form>
        </Panel>

        <Panel title="Leverantörsregister" description="Sök leverantörer, avtal, kategorier och kontaktpersoner." bodyClassName="p-0">
          <div className="border-b border-sand-200 bg-sand-50/55 p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input placeholder="Sök leverantör, kategori, avtal eller kontaktperson" value={query} onChange={(e) => setQuery(e.target.value)} className={`${premiumFieldClass} pl-10`} aria-label="Sök leverantör, kategori, avtal eller kontaktperson" />
            </div>
            <p className="mt-2 text-xs text-ink-500">{visible.length} av {vendors.length} leverantörer visas</p>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : visible.length === 0 ? (
            <EmptyState title="Inga leverantörer matchar sökningen" description="Rensa sökningen eller registrera en ny leverantör." />
          ) : (
            <div className="divide-y divide-sand-100">
              {visible.map((vendor) => {
                const isActive = (vendor.status || "active") === "active";
                const endDate = vendor.endDate ? new Date(vendor.endDate) : null;
                const daysToEnd = endDate ? Math.ceil((endDate.getTime() - Date.now()) / 86400000) : null;
                const needsAttention = isActive && daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= 120;
                return (
                  <article key={vendor.id} className={`relative p-5 transition hover:bg-sand-50/45 sm:p-6 ${needsAttention ? "before:absolute before:inset-y-5 before:left-0 before:w-1 before:rounded-r-full before:bg-amber-500" : ""}`}>
                    <div className="grid gap-5 md:grid-cols-[1.35fr_1fr_auto] md:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">{vendor.category}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass(vendor.status)}`}>{statusLabels[vendor.status || "active"]}</span>
                        </div>
                        <h3 className="mt-2 font-display text-lg font-semibold tracking-[-0.02em] text-ink-900">{vendor.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-ink-500">{vendor.contactName || "Ingen kontaktperson"}</p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
                          {vendor.email ? <a href={`mailto:${vendor.email}`} className="hover:text-petroleum-800">{vendor.email}</a> : null}
                          {vendor.phone ? <a href={`tel:${vendor.phone}`} className="hover:text-petroleum-800">{vendor.phone}</a> : null}
                        </div>
                        {vendor.source === "legacy" ? <InlineAlert tone="warning">Äldre rad – kör backfill innan uppdatering.</InlineAlert> : null}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-ink-800">{vendor.contractTitle || "Inget avtal angivet"}</p>
                        <p className="mt-1 text-xs leading-5 text-ink-500">Uppsägning {vendor.noticeMonths || 0} mån · {vendor.endDate ? `slut ${new Date(vendor.endDate).toLocaleDateString("sv-SE")}` : "inget slutdatum"}</p>
                        {needsAttention ? <p className="mt-2 text-xs font-semibold text-amber-800">{daysToEnd === 0 ? "Avtalet löper ut idag" : `${daysToEnd} dagar till avtalslut`}</p> : null}
                        {vendor.source !== "legacy" ? (
                          <select
                            disabled={updatingId === vendor.id}
                            value={vendor.status || "active"}
                            onChange={(event) => void updateStatus(vendor, event.target.value)}
                            className="mt-3 h-9 rounded-xl border border-sand-200 bg-white px-2.5 text-xs font-semibold text-ink-700 outline-none focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
                            aria-label={`Ändra status för ${vendor.name}`}
                          >
                            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        ) : null}
                      </div>

                      <div className="space-y-2 md:text-right">
                        <p className="font-semibold text-ink-900">{currency.format(Number(vendor.contractValue || 0))}</p>
                        <p className="text-[10px] uppercase tracking-[0.1em] text-ink-500">årsvärde</p>
                        {vendor.source !== "legacy" ? (
                          <button type="button" onClick={() => (editingId === vendor.id ? setEditingId("") : startEdit(vendor))} className={`${premiumSecondaryButtonClass} h-9 px-3 text-xs md:ml-auto`}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{editingId === vendor.id ? "Stäng" : "Ändra"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {editingId === vendor.id && vendor.source !== "legacy" ? (
                      <div className="mt-5 space-y-3 rounded-xl border border-sand-200 bg-[#FCFBF8] p-4">
                        {isActive ? (
                          <>
                            <input className={premiumFieldClass} placeholder="Företagsnamn" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} aria-label="Företagsnamn" />
                            <select className={premiumFieldClass} value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} aria-label="Kategori">{categories.map((item) => <option key={item}>{item}</option>)}</select>
                          </>
                        ) : null}
                        <input className={premiumFieldClass} placeholder="Kontaktperson" value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} aria-label="Kontaktperson" />
                        <div className="grid gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="email" placeholder="E-post" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} aria-label="E-post" /><input className={premiumFieldClass} placeholder="Telefon" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} aria-label="Telefon" /></div>
                        {isActive ? (
                          <>
                            <input className={premiumFieldClass} placeholder="Avtalsnamn" value={editForm.contractTitle} onChange={(e) => setEditForm({ ...editForm, contractTitle: e.target.value })} aria-label="Avtalsnamn" />
                            <div className="grid gap-3 sm:grid-cols-2"><input className={premiumFieldClass} type="number" min="0" placeholder="Årsvärde" value={editForm.contractValue} onChange={(e) => setEditForm({ ...editForm, contractValue: e.target.value })} aria-label="Årsvärde" /><input className={premiumFieldClass} type="number" min="0" placeholder="Uppsägning mån" value={editForm.noticeMonths} onChange={(e) => setEditForm({ ...editForm, noticeMonths: e.target.value })} aria-label="Uppsägning mån" /></div>
                            <input className={premiumFieldClass} type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} aria-label="Slutdatum" />
                          </>
                        ) : <p className="text-xs text-ink-500">Avslutade avtal: endast kontaktuppgifter kan ändras.</p>}
                        <button type="button" disabled={updatingId === vendor.id} onClick={() => void saveEdit(vendor)} className={premiumPrimaryButtonClass}>{updatingId === vendor.id ? "Sparar…" : "Spara ändringar"}</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
