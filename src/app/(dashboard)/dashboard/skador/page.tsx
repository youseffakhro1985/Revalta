"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { InlineAlert } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

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
  note?: string;
  source?: "table" | "legacy";
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const statusLabel: Record<string, string> = { reported: "Anmäld", investigating: "Utreds", awaiting_insurer: "Inväntar bolag", repairing: "Åtgärdas", settled: "Reglerad", closed: "Avslutad" };
const typeLabel: Record<string, string> = { water: "Vatten", fire: "Brand", theft: "Inbrott", storm: "Storm", liability: "Ansvar", machine: "Maskin", glass: "Glas", other: "Övrigt" };
const closedStatuses = new Set(["settled", "closed"]);

export default function InsuranceClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ title: "", location: "", insurer: "", claimNumber: "", estimatedCost: "", deductible: "", compensation: "", note: "" });
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/insurance-claims", { cache: "no-store" });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte läsa skadeärenden");
    else { setClaims(data.claims || []); setProperties(data.properties || []); setCanManage(Boolean(data.permissions?.canManage)); }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const openClaims = claims.filter((claim) => !closedStatuses.has(claim.status || "")).length;
  const totalEstimated = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.estimated_cost || 0), 0), [claims]);
  const totalCompensation = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.compensation || 0), 0), [claims]);
  const totalNet = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.net_cost || 0), 0), [claims]);

  function startEdit(claim: Claim) {
    setEditingId(claim.id);
    setEditForm({
      title: claim.title || "",
      location: claim.location || "",
      insurer: claim.insurer || "",
      claimNumber: claim.claim_number || "",
      estimatedCost: String(claim.estimated_cost ?? ""),
      deductible: String(claim.deductible ?? ""),
      compensation: String(claim.compensation ?? ""),
      note: claim.note || "",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/insurance-claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte registrera skadeärendet");
    else { event.currentTarget.reset(); await load(); }
    setSaving(false);
  }

  async function updateStatus(claim: Claim, status: string) {
    if (claim.source === "legacy") {
      setError("Skadeärendet finns i äldre lagring. Kör backfill till InsuranceClaim innan det kan uppdateras.");
      return;
    }
    if (status === claim.status) return;
    setUpdatingId(claim.id);
    setError("");
    const response = await fetch("/api/insurance-claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId: claim.id, status }),
    });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera status");
    else await load();
    setUpdatingId("");
  }

  async function saveEdit(claim: Claim) {
    if (claim.source === "legacy") {
      setError("Skadeärendet finns i äldre lagring. Kör backfill till InsuranceClaim innan det kan uppdateras.");
      return;
    }
    setUpdatingId(claim.id);
    setError("");
    const response = await fetch("/api/insurance-claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimId: claim.id,
        title: editForm.title,
        location: editForm.location,
        insurer: editForm.insurer,
        claimNumber: editForm.claimNumber,
        estimatedCost: editForm.estimatedCost,
        deductible: editForm.deductible,
        compensation: editForm.compensation,
        note: editForm.note,
      }),
    });
    const data = await readResponseJson(response);
    if (!response.ok) setError(data.error || "Kunde inte uppdatera skadeärendet");
    else {
      setEditingId("");
      await load();
    }
    setUpdatingId("");
  }

  const field = "h-11 w-full rounded-lg border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition focus:border-petroleum-500";

  return <div className="space-y-8">
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">Risk och försäkring</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Skador och försäkringsärenden</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Samlad uppföljning av skador, kostnader, självrisker, ersättningar och kontakt med försäkringsbolag.</p></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Öppna ärenden", openClaims], ["Beräknad kostnad", money.format(totalEstimated)], ["Försäkringsersättning", money.format(totalCompensation)], ["Nettokostnad", money.format(totalNet)]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p><p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{value}</p></div>)}</div>

    {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra skadeärenden.</InlineAlert> : null}

    {canManage ? (
    <form onSubmit={submit} className="rounded-xl border border-sand-200 bg-white p-6 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
      <div className="mb-5"><h2 className="font-display text-xl font-semibold text-ink-900">Registrera skadeärende</h2><p className="mt-1 text-sm text-ink-500">Dokumentera händelsen och den ekonomiska bedömningen.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <select name="propertyId" required className={field} aria-label="Fastighet"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input name="title" required placeholder="Rubrik" className={field} aria-label="Rubrik" />
        <select name="damageType" className={field} aria-label="Skadetyp">{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="incidentDate" type="date" className={field} aria-label="Skadedatum" />
        <input name="location" placeholder="Skadeplats" className={field} aria-label="Skadeplats" />
        <input name="insurer" placeholder="Försäkringsbolag" className={field} aria-label="Försäkringsbolag" />
        <input name="claimNumber" placeholder="Skadenummer" className={field} aria-label="Skadenummer" />
        <input name="responsible" placeholder="Ansvarig" className={field} aria-label="Ansvarig" />
        <select name="status" className={field} aria-label="Status">{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input name="estimatedCost" type="number" min="0" placeholder="Beräknad kostnad" className={field} aria-label="Beräknad kostnad" />
        <input name="deductible" type="number" min="0" placeholder="Självrisk" className={field} aria-label="Självrisk" />
        <input name="compensation" type="number" min="0" placeholder="Ersättning" className={field} aria-label="Ersättning" />
      </div>
      <textarea name="note" placeholder="Anteckning och nästa steg" className="mt-4 min-h-24 w-full rounded-lg border border-sand-200 bg-white px-3 py-3 text-sm outline-none focus:border-petroleum-500" aria-label="Anteckning och nästa steg" />
      <div className="mt-4 flex justify-end"><button disabled={saving} className="rounded-lg bg-petroleum-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Sparar…" : "Registrera skadeärende"}</button></div>
    </form>
    ) : null}

    <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
      <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold text-ink-900">Ärendeöversikt</h2></div>
      {loading ? <p className="p-6 text-sm text-ink-500">Läser skadeärenden…</p> : claims.length === 0 ? <p className="p-6 text-sm text-ink-500">Inga skadeärenden registrerade ännu.</p> : (
        <div className="divide-y divide-sand-100">
          {claims.map((claim) => {
            const canEditFields = claim.source !== "legacy" && !closedStatuses.has(claim.status || "");
            return (
              <div key={claim.id} className="px-6 py-5">
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
                  <div>
                    <p className="font-semibold text-ink-900">{claim.title}</p>
                    <p className="mt-1 text-xs text-ink-500">{claim.property_name} · {typeLabel[claim.damage_type || "other"]} · {claim.location || "Plats saknas"}</p>
                    {claim.source === "legacy" ? (
                      <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan uppdatering.</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Försäkringsbolag</p>
                    <p className="mt-1 text-sm text-ink-700">{claim.insurer || "Ej angivet"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-500">Ekonomi</p>
                    <p className="mt-1 text-sm text-ink-700">Netto {money.format(Number(claim.net_cost || 0))}</p>
                  </div>
                  <div className="space-y-2">
                    <span className="inline-flex h-fit rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-600">
                      {statusLabel[claim.status || "reported"]}
                    </span>
                    {canManage && claim.source !== "legacy" ? (
                      <>
                        <select
                          disabled={updatingId === claim.id}
                          value={claim.status || "reported"}
                          onChange={(event) => void updateStatus(claim, event.target.value)}
                          className="block h-9 w-full min-w-[9.5rem] rounded-lg border border-sand-200 bg-white px-2 text-xs text-ink-700 outline-none focus:border-petroleum-500"
                          aria-label={`Ändra status för ${claim.title || "skadeärende"}`}
                        >
                          {Object.entries(statusLabel).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        {canEditFields ? (
                          <button
                            type="button"
                            onClick={() => (editingId === claim.id ? setEditingId("") : startEdit(claim))}
                            className="text-xs font-semibold text-petroleum-800 transition hover:text-petroleum-950"
                          >
                            {editingId === claim.id ? "Stäng" : "Ändra"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
                {canManage && editingId === claim.id && canEditFields ? (
                  <div className="mt-4 grid gap-3 border-t border-sand-100 pt-4 md:grid-cols-2 xl:grid-cols-4">
                    <input className={field} placeholder="Rubrik" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} aria-label="Rubrik" />
                    <input className={field} placeholder="Skadeplats" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} aria-label="Skadeplats" />
                    <input className={field} placeholder="Försäkringsbolag" value={editForm.insurer} onChange={(e) => setEditForm({ ...editForm, insurer: e.target.value })} aria-label="Försäkringsbolag" />
                    <input className={field} placeholder="Skadenummer" value={editForm.claimNumber} onChange={(e) => setEditForm({ ...editForm, claimNumber: e.target.value })} aria-label="Skadenummer" />
                    <input className={field} type="number" min="0" placeholder="Beräknad kostnad" value={editForm.estimatedCost} onChange={(e) => setEditForm({ ...editForm, estimatedCost: e.target.value })} aria-label="Beräknad kostnad" />
                    <input className={field} type="number" min="0" placeholder="Självrisk" value={editForm.deductible} onChange={(e) => setEditForm({ ...editForm, deductible: e.target.value })} aria-label="Självrisk" />
                    <input className={field} type="number" min="0" placeholder="Ersättning" value={editForm.compensation} onChange={(e) => setEditForm({ ...editForm, compensation: e.target.value })} aria-label="Ersättning" />
                    <textarea className="min-h-11 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm outline-none focus:border-petroleum-500 md:col-span-2 xl:col-span-1" placeholder="Anteckning" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} aria-label="Anteckning" />
                    <button
                      type="button"
                      disabled={updatingId === claim.id}
                      onClick={() => void saveEdit(claim)}
                      className="rounded-lg bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2 xl:col-span-4 xl:w-fit"
                    >
                      {updatingId === claim.id ? "Sparar…" : "Spara ändringar"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>;
}
