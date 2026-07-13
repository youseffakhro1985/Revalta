"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Property = { id: string; name: string; address?: string; city?: string };
type Claim = {
  id: string;
  property_id?: string;
  property_name?: string;
  title?: string;
  damage_type?: string;
  incident_date?: string | null;
  location?: string;
  insurer?: string;
  claim_number?: string;
  responsible?: string;
  status?: string;
  estimated_cost?: number;
  deductible?: number;
  compensation?: number;
  net_cost?: number;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const statusLabel: Record<string, string> = { reported: "Anmäld", investigating: "Utreds", awaiting_insurer: "Inväntar bolag", repairing: "Åtgärdas", settled: "Reglerad", closed: "Avslutad" };
const typeLabel: Record<string, string> = { water: "Vatten", fire: "Brand", theft: "Inbrott", storm: "Storm", liability: "Ansvar", machine: "Maskin", glass: "Glas", other: "Övrigt" };

export default function InsuranceClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/insurance-claims", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte läsa skadeärenden");
    else { setClaims(data.claims || []); setProperties(data.properties || []); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const openClaims = claims.filter((claim) => !["settled", "closed"].includes(claim.status || "")).length;
  const totalEstimated = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.estimated_cost || 0), 0), [claims]);
  const totalCompensation = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.compensation || 0), 0), [claims]);
  const totalNet = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.net_cost || 0), 0), [claims]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/insurance-claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte registrera skadeärendet");
    else { event.currentTarget.reset(); await load(); }
    setSaving(false);
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return <div className="space-y-8">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">Risk och försäkring</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Skador och försäkringsärenden</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Samlad uppföljning av skador, kostnader, självrisker, ersättningar och kontakt med försäkringsbolag.</p></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Öppna ärenden", openClaims], ["Beräknad kostnad", money.format(totalEstimated)], ["Försäkringsersättning", money.format(totalCompensation)], ["Nettokostnad", money.format(totalNet)]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p><p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{value}</p></div>)}</div>

    <form onSubmit={submit} className="rounded-xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
      <div className="mb-5"><h2 className="font-display text-xl font-semibold text-ink-900">Registrera skadeärende</h2><p className="mt-1 text-sm text-ink-500">Dokumentera händelsen och den ekonomiska bedömningen.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <select name="propertyId" required className={field}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input name="title" required placeholder="Rubrik" className={field} />
        <select name="damageType" className={field}>{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="incidentDate" type="date" className={field} />
        <input name="location" placeholder="Skadeplats" className={field} />
        <input name="insurer" placeholder="Försäkringsbolag" className={field} />
        <input name="claimNumber" placeholder="Skadenummer" className={field} />
        <input name="responsible" placeholder="Ansvarig" className={field} />
        <select name="status" className={field}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="estimatedCost" type="number" min="0" placeholder="Beräknad kostnad" className={field} />
        <input name="deductible" type="number" min="0" placeholder="Självrisk" className={field} />
        <input name="compensation" type="number" min="0" placeholder="Ersättning" className={field} />
      </div>
      <textarea name="note" placeholder="Anteckning och nästa steg" className="mt-4 min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500" />
      <div className="mt-4 flex items-center justify-between gap-4">{error ? <p className="text-sm text-red-700">{error}</p> : <span />}<button disabled={saving} className="rounded-lg bg-petroleum-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Sparar…" : "Registrera skadeärende"}</button></div>
    </form>

    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Ärendeöversikt</h2></div>{loading ? <p className="p-6 text-sm text-ink-500">Läser skadeärenden…</p> : claims.length === 0 ? <p className="p-6 text-sm text-ink-500">Inga skadeärenden registrerade ännu.</p> : <div className="divide-y divide-sand-100">{claims.map((claim) => <div key={claim.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1.5fr_1fr_1fr_auto]"><div><p className="font-semibold text-ink-900">{claim.title}</p><p className="mt-1 text-xs text-ink-500">{claim.property_name} · {typeLabel[claim.damage_type || "other"]} · {claim.location || "Plats saknas"}</p></div><div><p className="text-xs text-ink-400">Försäkringsbolag</p><p className="mt-1 text-sm text-ink-700">{claim.insurer || "Ej angivet"}</p></div><div><p className="text-xs text-ink-400">Ekonomi</p><p className="mt-1 text-sm text-ink-700">Netto {money.format(Number(claim.net_cost || 0))}</p></div><span className="h-fit rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-600">{statusLabel[claim.status || "reported"]}</span></div>)}</div>}</div>
  </div>;
}
