"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Download, FileWarning, Search, ShieldAlert, WalletCards } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  premiumCompactButtonClass,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
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
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const statusLabel: Record<string, string> = { reported: "Anmäld", investigating: "Utreds", awaiting_insurer: "Inväntar bolag", repairing: "Åtgärdas", settled: "Reglerad", closed: "Avslutad" };
const typeLabel: Record<string, string> = { water: "Vatten", fire: "Brand", theft: "Inbrott", storm: "Storm", liability: "Ansvar", machine: "Maskin", glass: "Glas", other: "Övrigt" };
const closedStatuses = new Set(["settled", "closed"]);

function statusTone(status?: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "settled" || status === "closed") return "success";
  if (status === "reported" || status === "investigating") return "warning";
  if (status === "repairing" || status === "awaiting_insurer") return "info";
  return "neutral";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function InsuranceClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [editForm, setEditForm] = useState({ title: "", location: "", insurer: "", claimNumber: "", estimatedCost: "", deductible: "", compensation: "", note: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/insurance-claims", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte läsa skadeärenden");
      setClaims(data.claims || []);
      setProperties(data.properties || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte läsa skadeärenden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const openClaims = claims.filter((claim) => !closedStatuses.has(claim.status || "")).length;
  const totalEstimated = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.estimated_cost || 0), 0), [claims]);
  const totalCompensation = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.compensation || 0), 0), [claims]);
  const totalNet = useMemo(() => claims.reduce((sum, claim) => sum + Number(claim.net_cost || 0), 0), [claims]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return claims.filter((claim) => {
      if (statusFilter && claim.status !== statusFilter) return false;
      if (typeFilter && claim.damage_type !== typeFilter) return false;
      if (propertyFilter && claim.property_id !== propertyFilter) return false;
      if (!needle) return true;
      return [claim.title, claim.property_name, claim.location, claim.insurer, claim.claim_number, claim.responsible, claim.note].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [claims, propertyFilter, query, statusFilter, typeFilter]);

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
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      const response = await fetch("/api/insurance-claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte registrera skadeärendet");
      event.currentTarget.reset();
      setCreateOpen(false);
      setSuccess("Skadeärendet har registrerats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte registrera skadeärendet");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(claim: Claim, status: string) {
    if (claim.source === "legacy") {
      setError("Skadeärendet finns i äldre lagring. Kör backfill till InsuranceClaim innan det kan uppdateras.");
      return;
    }
    if (status === claim.status) return;
    setUpdatingId(claim.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/insurance-claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: claim.id, status }) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera status");
      setSuccess(`Status ändrad till ${statusLabel[status] || status}.`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera status");
    } finally {
      setUpdatingId("");
    }
  }

  async function saveEdit(claim: Claim) {
    if (claim.source === "legacy") {
      setError("Skadeärendet finns i äldre lagring. Kör backfill till InsuranceClaim innan det kan uppdateras.");
      return;
    }
    setUpdatingId(claim.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/insurance-claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: claim.id, title: editForm.title, location: editForm.location, insurer: editForm.insurer, claimNumber: editForm.claimNumber, estimatedCost: editForm.estimatedCost, deductible: editForm.deductible, compensation: editForm.compensation, note: editForm.note }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera skadeärendet");
      setEditingId("");
      setSuccess("Skadeärendet har uppdaterats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera skadeärendet");
    } finally {
      setUpdatingId("");
    }
  }

  function exportCsv() {
    const rows = [
      ["Fastighet", "Rubrik", "Skadetyp", "Skadedatum", "Status", "Försäkringsbolag", "Skadenummer", "Beräknad kostnad", "Självrisk", "Ersättning", "Nettokostnad"],
      ...filtered.map((claim) => [claim.property_name, claim.title, typeLabel[claim.damage_type || "other"], claim.incident_date, statusLabel[claim.status || "reported"], claim.insurer, claim.claim_number, claim.estimated_cost, claim.deductible, claim.compensation, claim.net_cost]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-skador-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Risk och försäkring" title="Skador och försäkringsärenden" description="Följ händelser, försäkringsdialog, ekonomiska konsekvenser och nästa steg i en samlad riskvy." action={canManage ? <button type="button" onClick={() => setCreateOpen((value) => !value)} className={`${premiumPrimaryButtonClass} w-full sm:w-auto`}>{createOpen ? "Stäng registrering" : "Nytt skadeärende"}</button> : undefined} />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={ShieldAlert} label="Öppna ärenden" value={openClaims} hint="Pågående försäkrings- eller åtgärdsflöden" />
      <MetricCard icon={FileWarning} label="Beräknad kostnad" value={money.format(totalEstimated)} hint="Samlad skadebedömning" />
      <MetricCard icon={CircleDollarSign} label="Försäkringsersättning" value={money.format(totalCompensation)} hint="Registrerad ersättning" />
      <MetricCard icon={WalletCards} label="Nettokostnad" value={money.format(totalNet)} hint="Kvar efter registrerad ersättning" />
    </section>

    {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra skadeärenden.</InlineAlert> : null}

    {canManage && createOpen ? (
      <Panel title="Registrera skadeärende" description="Dokumentera händelsen, försäkringsuppgifter och den första ekonomiska bedömningen.">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select name="propertyId" required className={premiumFieldClass} aria-label="Fastighet"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
            <input name="title" required placeholder="Rubrik" className={premiumFieldClass} aria-label="Rubrik" />
            <select name="damageType" className={premiumFieldClass} aria-label="Skadetyp">{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input name="incidentDate" type="date" className={premiumFieldClass} aria-label="Skadedatum" />
            <input name="location" placeholder="Skadeplats" className={premiumFieldClass} aria-label="Skadeplats" />
            <input name="insurer" placeholder="Försäkringsbolag" className={premiumFieldClass} aria-label="Försäkringsbolag" />
            <input name="claimNumber" placeholder="Skadenummer" className={premiumFieldClass} aria-label="Skadenummer" />
            <input name="responsible" placeholder="Ansvarig" className={premiumFieldClass} aria-label="Ansvarig" />
            <select name="status" className={premiumFieldClass} aria-label="Status">{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input name="estimatedCost" type="number" min="0" placeholder="Beräknad kostnad" className={premiumFieldClass} aria-label="Beräknad kostnad" />
            <input name="deductible" type="number" min="0" placeholder="Självrisk" className={premiumFieldClass} aria-label="Självrisk" />
            <input name="compensation" type="number" min="0" placeholder="Ersättning" className={premiumFieldClass} aria-label="Ersättning" />
          </div>
          <textarea name="note" placeholder="Anteckning, försäkringsdialog och nästa steg" className={premiumTextareaClass} aria-label="Anteckning och nästa steg" />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setCreateOpen(false)} className={premiumSecondaryButtonClass}>Avbryt</button><button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Registrera skadeärende"}</button></div>
        </form>
      </Panel>
    ) : null}

    <Panel title="Ärendeöversikt" description="Filtrera skadeportföljen och öppna rätt ärende för uppdatering." action={<button type="button" onClick={exportCsv} disabled={!filtered.length} className={`${premiumSecondaryButtonClass} gap-2`}><Download className="h-4 w-4" aria-hidden="true" />CSV</button>} bodyClassName="p-0">
      <div className="grid gap-3 border-b border-sand-200 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_190px_180px_190px] sm:p-5">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" /><input className={`${premiumFieldClass} pl-9`} placeholder="Sök skada, bolag, nummer eller ansvarig" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Sök skadeärenden" /></label>
        <select className={premiumFieldClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrera status"><option value="">Alla statusar</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className={premiumFieldClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrera skadetyp"><option value="">Alla skadetyper</option>{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filtrera fastighet"><option value="">Alla fastigheter</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
      </div>

      {loading ? <LoadingState label="Läser skadeärenden…" rows={4} /> : filtered.length === 0 ? <EmptyState icon={ShieldAlert} title="Inga skadeärenden hittades" description={claims.length ? "Justera sökning eller filter för att visa fler ärenden." : "När ett skadeärende registreras visas det här med status och ekonomisk uppföljning."} /> : (
        <div className="divide-y divide-sand-100">
          {filtered.map((claim) => {
            const canEditFields = claim.source !== "legacy" && !closedStatuses.has(claim.status || "");
            return (
              <article key={claim.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
                <div className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr_0.9fr_auto] xl:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{claim.title}</h3><StatusBadge tone={statusTone(claim.status)}>{statusLabel[claim.status || "reported"]}</StatusBadge><StatusBadge>{typeLabel[claim.damage_type || "other"]}</StatusBadge></div>
                    <p className="mt-2 text-sm text-ink-500">{claim.property_name}{claim.location ? ` · ${claim.location}` : ""}{claim.incident_date ? ` · ${date.format(new Date(claim.incident_date))}` : ""}</p>
                    {claim.note ? <p className="mt-2 line-clamp-2 max-w-2xl text-xs leading-5 text-ink-500">{claim.note}</p> : null}
                    {claim.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan uppdatering.</p> : null}
                  </div>
                  <div className="rounded-xl bg-sand-50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">Försäkring</p><p className="mt-1 text-sm font-semibold text-ink-800">{claim.insurer || "Ej angivet"}</p><p className="mt-1 text-xs text-ink-500">{claim.claim_number || "Skadenummer saknas"}</p></div>
                  <div className="rounded-xl bg-sand-50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">Ekonomi</p><p className="mt-1 text-sm font-semibold text-ink-800">Netto {money.format(Number(claim.net_cost || 0))}</p><p className="mt-1 text-xs text-ink-500">Bedömt {money.format(Number(claim.estimated_cost || 0))}</p></div>
                  {canManage && claim.source !== "legacy" ? <div className="flex flex-wrap gap-2 xl:w-[170px] xl:flex-col"><select disabled={updatingId === claim.id} value={claim.status || "reported"} onChange={(event) => void updateStatus(claim, event.target.value)} className={`${premiumFieldClass} h-9 text-xs`} aria-label={`Ändra status för ${claim.title || "skadeärende"}`}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{canEditFields ? <button type="button" onClick={() => (editingId === claim.id ? setEditingId("") : startEdit(claim))} className={premiumCompactButtonClass}>{editingId === claim.id ? "Stäng" : "Ändra uppgifter"}</button> : null}</div> : null}
                </div>

                {canManage && editingId === claim.id && canEditFields ? (
                  <div className="mt-5 rounded-xl border border-sand-200 bg-sand-50/65 p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className={premiumFieldClass} placeholder="Rubrik" value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} aria-label="Rubrik" /><input className={premiumFieldClass} placeholder="Skadeplats" value={editForm.location} onChange={(event) => setEditForm({ ...editForm, location: event.target.value })} aria-label="Skadeplats" /><input className={premiumFieldClass} placeholder="Försäkringsbolag" value={editForm.insurer} onChange={(event) => setEditForm({ ...editForm, insurer: event.target.value })} aria-label="Försäkringsbolag" /><input className={premiumFieldClass} placeholder="Skadenummer" value={editForm.claimNumber} onChange={(event) => setEditForm({ ...editForm, claimNumber: event.target.value })} aria-label="Skadenummer" /><input className={premiumFieldClass} type="number" min="0" placeholder="Beräknad kostnad" value={editForm.estimatedCost} onChange={(event) => setEditForm({ ...editForm, estimatedCost: event.target.value })} aria-label="Beräknad kostnad" /><input className={premiumFieldClass} type="number" min="0" placeholder="Självrisk" value={editForm.deductible} onChange={(event) => setEditForm({ ...editForm, deductible: event.target.value })} aria-label="Självrisk" /><input className={premiumFieldClass} type="number" min="0" placeholder="Ersättning" value={editForm.compensation} onChange={(event) => setEditForm({ ...editForm, compensation: event.target.value })} aria-label="Ersättning" /><textarea className={`${premiumTextareaClass} md:col-span-2 xl:col-span-1`} placeholder="Anteckning" value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} aria-label="Anteckning" /></div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={updatingId === claim.id} onClick={() => void saveEdit(claim)} className={premiumPrimaryButtonClass}>{updatingId === claim.id ? "Sparar…" : "Spara ändringar"}</button><button type="button" onClick={() => setEditingId("")} className={premiumSecondaryButtonClass}>Avbryt</button></div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  </div>;
}
