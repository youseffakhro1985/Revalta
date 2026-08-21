"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { CreditCard, Download, Gauge, Plus, RadioTower, Search } from "lucide-react";
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

type Property = { id: string; name: string; address?: string; city?: string };
type Lease = { id: string; property_id: string; lease_number: string; unit: string; tenant_name: string };
type Debit = { id: string; status: string; rent_notice_id: string | null; lease_id: string | null; charge: number };
type Reading = {
  id: string;
  property_id?: string;
  property_name?: string;
  unit?: string;
  meter_id?: string;
  meter_type?: string;
  period?: string;
  previous_reading?: number;
  current_reading?: number;
  consumption?: number;
  unit_price?: number;
  charge?: number;
  note?: string;
  debit?: Debit | null;
  source?: string;
};

const labels: Record<string, string> = { electricity: "El", hot_water: "Varmvatten", cold_water: "Kallvatten", heating: "Värme" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

export default function ImdPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkingId, setLinkingId] = useState("");
  const [voidingId, setVoidingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [debitFilter, setDebitFilter] = useState("all");
  const [editForm, setEditForm] = useState({ unit: "", meterId: "", period: "", previousReading: "", currentReading: "", unitPrice: "", note: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/imd-readings", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta mätvärden");
      setProperties(data.properties || []);
      setLeases(data.leases || []);
      setReadings(data.readings || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta mätvärden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const availableLeases = useMemo(() => leases.filter((lease) => !propertyId || lease.property_id === propertyId), [leases, propertyId]);
  const propertyNames = useMemo(() => [...new Set(readings.map((item) => item.property_name || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")), [readings]);

  const visibleReadings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return readings.filter((item) => {
      if (propertyFilter !== "all" && item.property_name !== propertyFilter) return false;
      if (typeFilter !== "all" && item.meter_type !== typeFilter) return false;
      const debitState = item.debit?.rent_notice_id || item.debit?.status === "linked" ? "linked" : item.debit?.status === "open" ? "open" : "none";
      if (debitFilter !== "all" && debitState !== debitFilter) return false;
      if (!needle) return true;
      return `${item.property_name || ""} ${item.unit || ""} ${item.meter_id || ""} ${labels[item.meter_type || ""] || ""} ${item.period || ""} ${item.note || ""}`.toLowerCase().includes(needle);
    });
  }, [readings, query, propertyFilter, typeFilter, debitFilter]);

  const totals = useMemo(() => ({
    charge: visibleReadings.reduce((sum, item) => sum + Number(item.charge || 0), 0),
    meters: new Set(visibleReadings.map((item) => item.meter_id).filter(Boolean)).size,
    openDebits: visibleReadings.filter((item) => item.debit?.status === "open" && !item.debit?.rent_notice_id).length,
    linked: visibleReadings.filter((item) => Boolean(item.debit?.rent_notice_id) || item.debit?.status === "linked").length,
  }), [visibleReadings]);

  const typeSummary = useMemo(() => Object.keys(labels).map((type) => {
    const rows = visibleReadings.filter((item) => item.meter_type === type);
    return {
      type,
      readings: rows.length,
      consumption: rows.reduce((sum, item) => sum + Number(item.consumption || 0), 0),
      charge: rows.reduce((sum, item) => sum + Number(item.charge || 0), 0),
    };
  }).filter((row) => row.readings > 0), [visibleReadings]);

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/imd-readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, propertyId, leaseId }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara avläsningen");
      setSuccess("Avläsningen har sparats och en öppen debiteringsrad skapades.");
      setLeaseId("");
      setFormKey((value) => value + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara avläsningen");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(reading: Reading) {
    if (reading.source === "legacy") {
      setError("Avläsningen finns i äldre lagring. Kör backfill till ImdReading innan den kan ändras.");
      return;
    }
    if (reading.debit?.rent_notice_id) {
      setError("Avläsningen är kopplad till en hyresavi och kan inte ändras.");
      return;
    }
    setEditingId(reading.id);
    setEditForm({
      unit: reading.unit || "",
      meterId: reading.meter_id || "",
      period: reading.period || "",
      previousReading: String(reading.previous_reading ?? ""),
      currentReading: String(reading.current_reading ?? ""),
      unitPrice: String(reading.unit_price ?? ""),
      note: reading.note || "",
    });
    setError("");
  }

  async function saveEdit(reading: Reading) {
    setUpdatingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/imd-readings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, unit: editForm.unit, meterId: editForm.meterId, period: editForm.period, previousReading: Number(editForm.previousReading), currentReading: Number(editForm.currentReading), unitPrice: Number(editForm.unitPrice), note: editForm.note }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera avläsningen");
      setEditingId("");
      setSuccess("Avläsningen har uppdaterats.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera avläsningen");
    } finally {
      setUpdatingId("");
    }
  }

  async function attachNotice(reading: Reading) {
    if (!reading.debit || reading.debit.status === "linked") return;
    if (!window.confirm("Skapa en utkast-hyresavi och koppla IMD-debiteringen?")) return;
    setLinkingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/imd-readings/${reading.id}/attach-notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createNotice: true, leaseId: reading.debit.lease_id || leaseId || undefined }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte koppla debitering");
      setSuccess("Debiteringen är kopplad till hyresavi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte koppla debitering");
    } finally {
      setLinkingId("");
    }
  }

  async function voidReading(reading: Reading) {
    if (reading.source === "legacy") {
      setError("Avläsningen finns i äldre lagring. Kör backfill till ImdReading innan den kan makuleras.");
      return;
    }
    if (reading.debit?.rent_notice_id) {
      setError("Avläsningen är kopplad till en hyresavi och kan inte makuleras.");
      return;
    }
    if (!window.confirm("Makulera den här avläsningen? Den döljs från listan men behålls i historiken.")) return;
    setVoidingId(reading.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/imd-readings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, action: "void" }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte makulera avläsningen");
      setSuccess("Avläsningen har makulerats.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte makulera avläsningen");
    } finally {
      setVoidingId("");
    }
  }

  function exportCsv() {
    const rows = [
      ["Fastighet", "Objekt", "Mätare", "Typ", "Period", "Föregående", "Aktuell", "Förbrukning", "Pris/enhet", "Belopp", "Debitering"],
      ...visibleReadings.map((item) => [
        item.property_name || "", item.unit || "", item.meter_id || "", labels[item.meter_type || ""] || item.meter_type || "", item.period || "",
        String(item.previous_reading ?? ""), String(item.current_reading ?? ""), String(item.consumption ?? ""), String(item.unit_price ?? ""), String(item.charge ?? ""),
        item.debit?.rent_notice_id || item.debit?.status === "linked" ? "Kopplad" : item.debit?.status === "open" ? "Öppen" : "Ingen",
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-imd-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = Boolean(query || propertyFilter !== "all" || typeFilter !== "all" || debitFilter !== "all");

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Förbrukning och debitering"
      title="Mätare och IMD"
      description="Individuell mätning och debitering med tydlig kedja från avläsning till debiteringsunderlag och hyresavi."
      action={<div className="flex flex-wrap gap-2">{visibleReadings.length ? <button type="button" onClick={exportCsv} className={premiumSecondaryButtonClass}><Download className="mr-2 h-4 w-4" aria-hidden="true" />CSV</button> : null}{canManage ? <button type="button" onClick={() => setShowCreate((value) => !value)} className={showCreate ? premiumSecondaryButtonClass : premiumPrimaryButtonClass}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{showCreate ? "Stäng" : "Ny avläsning"}</button> : null}</div>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={RadioTower} label="Registrerade mätare" value={totals.meters.toLocaleString("sv-SE")} hint={`${visibleReadings.length} avläsningar i vald vy`} />
      <MetricCard icon={Gauge} label="Avläsningar" value={visibleReadings.length.toLocaleString("sv-SE")} />
      <MetricCard icon={CreditCard} label="Debiteringsunderlag" value={money.format(totals.charge)} />
      <MetricCard icon={CreditCard} label="Öppna debiteringar" value={totals.openDebits.toLocaleString("sv-SE")} hint={`${totals.linked} kopplade till hyresavi`} />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra mätvärden.</InlineAlert> : null}

    {showCreate && canManage ? <Panel title="Registrera avläsning" description="Förbrukning, debiteringsbelopp och öppen debiteringsrad skapas automatiskt från registrerade mätvärden.">
      <form key={formKey} action={submit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <select required value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setLeaseId(""); }} className={premiumFieldClass} aria-label="Välj fastighet"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select value={leaseId} onChange={(event) => setLeaseId(event.target.value)} className={premiumFieldClass} aria-label="Valfritt hyresavtal"><option value="">Valfritt hyresavtal</option>{availableLeases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.unit} · {lease.tenant_name}</option>)}</select>
          <input name="unit" required placeholder="Lägenhet eller lokal" className={premiumFieldClass} aria-label="Lägenhet eller lokal" />
          <input name="meterId" required placeholder="Mätar-ID" className={premiumFieldClass} aria-label="Mätar-ID" />
          <select name="type" className={premiumFieldClass} aria-label="Mätartyp">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="period" required type="month" className={premiumFieldClass} aria-label="Period" />
          <input name="previousReading" required type="number" min="0" step="0.001" placeholder="Föregående avläsning" className={premiumFieldClass} aria-label="Föregående avläsning" />
          <input name="currentReading" required type="number" min="0" step="0.001" placeholder="Aktuell avläsning" className={premiumFieldClass} aria-label="Aktuell avläsning" />
          <input name="unitPrice" required type="number" min="0" step="0.01" placeholder="Pris per enhet" className={premiumFieldClass} aria-label="Pris per enhet" />
          <input name="note" placeholder="Anteckning" className={`${premiumFieldClass} md:col-span-2`} aria-label="Anteckning" />
          <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Spara avläsning"}</button>
        </div>
      </form>
    </Panel> : null}

    <section className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
      <Panel title="Mätarfilter" description="Sök och avgränsa mätvärden utan att påverka debiteringen.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-400" aria-hidden="true" /><input className={`${premiumFieldClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök objekt, mätare eller period" aria-label="Sök IMD" /></label>
          <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filtrera fastighet"><option value="all">Alla fastigheter</option>{propertyNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
          <select className={premiumFieldClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrera mätartyp"><option value="all">Alla typer</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className={premiumFieldClass} value={debitFilter} onChange={(event) => setDebitFilter(event.target.value)} aria-label="Filtrera debitering"><option value="all">Alla debiteringar</option><option value="open">Öppna</option><option value="linked">Kopplade</option><option value="none">Utan debitering</option></select>
          <button type="button" disabled={!hasFilters} onClick={() => { setQuery(""); setPropertyFilter("all"); setTypeFilter("all"); setDebitFilter("all"); }} className={premiumSecondaryButtonClass}>Rensa</button>
        </div>
      </Panel>

      <Panel title="Fördelning" description="Förbrukning och debitering per mätartyp." bodyClassName="p-0">
        {typeSummary.length === 0 ? <EmptyState title="Ingen data i urvalet" /> : <div className="divide-y divide-sand-100">{typeSummary.map((row) => <div key={row.type} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-sm font-semibold text-ink-800">{labels[row.type]}</p><p className="mt-1 text-xs text-ink-500">{row.readings} avläsningar · {number.format(row.consumption)} enheter</p></div><p className="text-sm font-semibold text-petroleum-800">{money.format(row.charge)}</p></div>)}</div>}
      </Panel>
    </section>

    <Panel title="Avläsningar och debitering" description={`${visibleReadings.length} av ${readings.length} mätvärden i vald vy`} bodyClassName="p-0">
      {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-sand-100" />)}</div> : visibleReadings.length === 0 ? <EmptyState title="Inga avläsningar matchar urvalet" description="Justera filtren eller registrera ett nytt mätvärde." /> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-sand-50 text-[10px] uppercase tracking-[0.1em] text-ink-500"><tr>{["Fastighet", "Objekt", "Mätare", "Typ / period", "Förbrukning", "Belopp", "Debitering", "Åtgärder"].map((head) => <th key={head} className="px-5 py-3 font-semibold">{head}</th>)}</tr></thead>
          <tbody className="divide-y divide-sand-100">{visibleReadings.map((item) => {
            const linked = Boolean(item.debit?.rent_notice_id) || item.debit?.status === "linked";
            const open = item.debit?.status === "open" && !linked;
            const canEdit = canManage && item.source !== "legacy" && !linked;
            return <Fragment key={item.id}>
              <tr className="text-ink-700 transition-colors hover:bg-sand-50/60">
                <td className="px-5 py-4 font-semibold text-ink-900">{item.property_name || "—"}</td>
                <td className="px-5 py-4">{item.unit || "—"}</td>
                <td className="px-5 py-4 font-mono text-xs">{item.meter_id || "—"}</td>
                <td className="px-5 py-4"><span className="font-medium text-ink-800">{labels[item.meter_type || ""] || item.meter_type}</span><span className="mt-1 block text-xs text-ink-500">{item.period || "—"}</span></td>
                <td className="px-5 py-4"><span className="font-semibold text-ink-900">{number.format(Number(item.consumption || 0))}</span><span className="mt-1 block text-xs text-ink-500">{number.format(Number(item.previous_reading || 0))} → {number.format(Number(item.current_reading || 0))}</span></td>
                <td className="px-5 py-4"><span className="font-semibold text-ink-900">{money.format(Number(item.charge || 0))}</span><span className="mt-1 block text-xs text-ink-500">{money.format(Number(item.unit_price || 0))}/enhet</span></td>
                <td className="px-5 py-4">{linked ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Kopplad till avi</span> : open ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Öppen</span> : <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-600">Ingen</span>}</td>
                <td className="px-5 py-4"><div className="flex flex-wrap gap-x-3 gap-y-2">{canEdit ? <button type="button" onClick={() => editingId === item.id ? setEditingId("") : startEdit(item)} className="text-xs font-semibold text-petroleum-800 hover:text-petroleum-950">{editingId === item.id ? "Stäng" : "Ändra"}</button> : null}{canManage && open ? <button type="button" disabled={linkingId === item.id} onClick={() => void attachNotice(item)} className="text-xs font-semibold text-petroleum-800 hover:text-petroleum-950 disabled:opacity-50">{linkingId === item.id ? "Kopplar…" : "Skapa hyresavi"}</button> : null}{canEdit ? <button type="button" disabled={voidingId === item.id} onClick={() => void voidReading(item)} className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50">{voidingId === item.id ? "Makulerar…" : "Makulera"}</button> : null}</div></td>
              </tr>
              {editingId === item.id && canEdit ? <tr><td colSpan={8} className="bg-sand-50/60 px-5 py-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><input className={premiumFieldClass} value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value })} placeholder="Objekt" aria-label="Objekt" /><input className={premiumFieldClass} value={editForm.meterId} onChange={(event) => setEditForm({ ...editForm, meterId: event.target.value })} placeholder="Mätar-ID" aria-label="Mätar-ID" /><input className={premiumFieldClass} type="month" value={editForm.period} onChange={(event) => setEditForm({ ...editForm, period: event.target.value })} aria-label="Period" /><input className={premiumFieldClass} type="number" min="0" step="0.001" value={editForm.previousReading} onChange={(event) => setEditForm({ ...editForm, previousReading: event.target.value })} placeholder="Föregående" aria-label="Föregående avläsning" /><input className={premiumFieldClass} type="number" min="0" step="0.001" value={editForm.currentReading} onChange={(event) => setEditForm({ ...editForm, currentReading: event.target.value })} placeholder="Aktuell" aria-label="Aktuell avläsning" /><input className={premiumFieldClass} type="number" min="0" step="0.01" value={editForm.unitPrice} onChange={(event) => setEditForm({ ...editForm, unitPrice: event.target.value })} placeholder="Pris/enhet" aria-label="Pris per enhet" /><input className={`${premiumFieldClass} md:col-span-2 xl:col-span-5`} value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} placeholder="Anteckning" aria-label="Anteckning" /><button type="button" disabled={updatingId === item.id} onClick={() => void saveEdit(item)} className={premiumPrimaryButtonClass}>{updatingId === item.id ? "Sparar…" : "Spara"}</button></div></td></tr> : null}
            </Fragment>;
          })}</tbody>
        </table>
      </div>}
      {totals.linked > 0 ? <div className="flex flex-col gap-3 border-t border-sand-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-ink-500">Kopplade debiteringar hanteras vidare i hyresaviseringen.</p><Link href="/dashboard/hyresavisering" className="font-semibold text-petroleum-800 hover:text-petroleum-950">Öppna hyresavisering</Link></div> : null}
    </Panel>
  </div>;
}
