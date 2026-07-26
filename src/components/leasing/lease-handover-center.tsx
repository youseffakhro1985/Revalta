"use client";

import { useEffect, useMemo, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
import { HandoverKeyRegister } from "@/components/leasing/handover-key-register";
import { handoverChecklistKeys, type HandoverChecklist, type HandoverInspection, type LeaseHandoverPayload } from "@/lib/lease-handover";
import { readResponseJson } from "@/lib/fetch-json";

type LeaseOption = { id: string; lease_number: string; status: string; property: { name: string }; unit: { designation: string }; lease_holder: { name: string } };
type AuditItem = { id: string; action: string; created_at: string; actor?: { name?: string | null; email?: string | null } | null };
type Detail = { lease: LeaseOption; handover: LeaseHandoverPayload; source?: "table" | "legacy"; permissions: { canManage: boolean }; history: AuditItem[] };

const labels: Record<(typeof handoverChecklistKeys)[number], string> = {
  identity_verified: "Identitet kontrollerad", lease_signed: "Avtal signerat", contact_details_verified: "Kontaktuppgifter verifierade",
  insurance_confirmed: "Försäkring bekräftad", meter_reading_recorded: "Mätarställning registrerad", keys_handed_over: "Nycklar utlämnade",
  inspection_completed: "Besiktning genomförd", cleaning_approved: "Städning godkänd", keys_returned: "Nycklar återlämnade",
  final_meter_reading_recorded: "Slutlig mätarställning registrerad",
};
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const LEGACY_BACKFILL = "Överlämningen finns kvar i äldre lagring. Kör backfill till LeaseHandoverRecord innan den kan uppdateras.";

export function LeaseHandoverCenter() {
  const [leases, setLeases] = useState<LeaseOption[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadLeases() {
    setLoading(true);
    try {
      const response = await fetch("/api/leases", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta avtal");
      const options = (data.leases || []).filter((item: LeaseOption) => ["reserved", "active", "notice", "ended"].includes(item.status));
      setLeases(options); setLeaseId((current) => current || options[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunde inte hämta avtal"); }
    finally { setLoading(false); }
  }
  async function loadDetail(id: string) {
    if (!id) { setDetail(null); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/leases/${id}/handover`, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta överlämningen");
      setDetail(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunde inte hämta överlämningen"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadLeases(); }, []);
  useEffect(() => { void loadDetail(leaseId); }, [leaseId]);

  const isLegacy = detail?.source === "legacy";
  const canEdit = Boolean(detail?.permissions.canManage) && !isLegacy;

  const required = useMemo(() => detail?.handover.mode === "move_out"
    ? ["inspection_completed", "cleaning_approved", "keys_returned", "final_meter_reading_recorded"]
    : ["identity_verified", "lease_signed", "contact_details_verified", "keys_handed_over", "inspection_completed"], [detail?.handover.mode]);
  const progress = useMemo(() => !detail ? 0 : Math.round((required.filter((key) => detail.handover.checklist[key as keyof HandoverChecklist]).length / required.length) * 100), [detail, required]);

  function update(patch: Partial<LeaseHandoverPayload>) {
    if (!canEdit) return;
    setDetail((current) => current ? { ...current, handover: { ...current.handover, ...patch } } : current);
  }
  function updateInspection(patch: Partial<HandoverInspection>) {
    if (!detail || !canEdit) return;
    update({ inspection: { ...detail.handover.inspection, ...patch } });
  }

  async function save(completed: boolean) {
    if (!detail) return;
    if (detail.source === "legacy") {
      setError(LEGACY_BACKFILL);
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/leases/${detail.lease.id}/handover`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...detail.handover, completed }) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara överlämningen");
      setSuccess(completed ? "Överlämningen är slutförd och historiken har sparats." : "Överlämningen har sparats.");
      await loadDetail(detail.lease.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunde inte spara överlämningen"); }
    finally { setSaving(false); }
  }

  return <Panel title="Inflyttning, avflyttning och nycklar" description="Checklista, nyckelkvittens och besiktning med spårbar historik.">
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Avtal</span><select className={premiumFieldClass} value={leaseId} onChange={(event) => setLeaseId(event.target.value)}><option value="">Välj avtal</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.property.name} · {lease.unit.designation} · {lease.lease_holder.name}</option>)}</select></label><button type="button" onClick={() => void loadDetail(leaseId)} disabled={!leaseId || loading} className="inline-flex h-11 items-center justify-center rounded-xl border border-sand-200 px-4 text-sm font-semibold text-ink-700"><RefreshCw className="mr-2 h-4 w-4" />Uppdatera</button></div>
      {error ? <InlineAlert>{error}</InlineAlert> : null}{success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {loading ? <div className="h-52 animate-pulse rounded-2xl bg-sand-100" /> : !detail ? <EmptyState title="Välj ett avtal" description="Pågående och avslutade avtal kan hanteras här." /> : <>
        {isLegacy ? <InlineAlert tone="warning">{LEGACY_BACKFILL}</InlineAlert> : null}
        <div className="grid gap-4 md:grid-cols-3"><Summary label="Avtal" value={detail.lease.lease_number} /><Summary label="Objekt" value={`${detail.lease.property.name} · ${detail.lease.unit.designation}`} /><Summary label="Obligatoriskt klart" value={`${progress} %`} /></div>
        <section className="rounded-2xl border border-sand-200 p-5"><div className="flex gap-2"><button type="button" disabled={!canEdit} onClick={() => update({ mode: "move_in" })} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${detail.handover.mode === "move_in" ? "bg-petroleum-700 text-white" : "bg-sand-100 text-ink-700"}`}>Inflyttning</button><button type="button" disabled={!canEdit} onClick={() => update({ mode: "move_out" })} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${detail.handover.mode === "move_out" ? "bg-petroleum-700 text-white" : "bg-sand-100 text-ink-700"}`}>Avflyttning</button></div><div className="mt-4 grid gap-2 md:grid-cols-2">{handoverChecklistKeys.map((key) => <label key={key} className="flex items-center gap-3 rounded-xl border border-sand-100 px-3 py-2.5 text-sm text-ink-700"><input type="checkbox" disabled={!canEdit} checked={detail.handover.checklist[key]} onChange={(event) => update({ checklist: { ...detail.handover.checklist, [key]: event.target.checked } })} className="h-4 w-4 accent-petroleum-700" />{labels[key]}{required?.includes(key) ? <span className="ml-auto text-[10px] font-semibold uppercase text-petroleum-700">Obligatorisk</span> : null}</label>)}</div></section>
        <HandoverKeyRegister keys={detail.handover.keys} disabled={!canEdit} onChange={(keys) => update({ keys })} />
        <section className="rounded-2xl border border-sand-200 p-5"><h3 className="font-semibold text-ink-900">Besiktning</h3><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><select disabled={!canEdit} className={premiumFieldClass} value={detail.handover.inspection.status} onChange={(event) => updateInspection({ status: event.target.value as HandoverInspection["status"] })}><option value="not_started">Ej påbörjad</option><option value="scheduled">Planerad</option><option value="completed">Genomförd</option><option value="approved">Godkänd</option></select><input type="datetime-local" disabled={!canEdit} className={premiumFieldClass} value={detail.handover.inspection.scheduledAt?.slice(0,16) || ""} onChange={(event) => updateInspection({ scheduledAt: event.target.value || null })} /><input type="datetime-local" disabled={!canEdit} className={premiumFieldClass} value={detail.handover.inspection.completedAt?.slice(0,16) || ""} onChange={(event) => updateInspection({ completedAt: event.target.value || null })} /><input placeholder="Besiktningsperson" disabled={!canEdit} className={premiumFieldClass} value={detail.handover.inspection.inspector} onChange={(event) => updateInspection({ inspector: event.target.value })} /><select disabled={!canEdit} className={premiumFieldClass} value={detail.handover.inspection.condition} onChange={(event) => updateInspection({ condition: event.target.value as HandoverInspection["condition"] })}><option value="not_assessed">Ej bedömd</option><option value="approved">Godkänd</option><option value="remarks">Anmärkningar</option><option value="action_required">Åtgärd krävs</option></select><textarea placeholder="Besiktningsanteckning" disabled={!canEdit} className={`${premiumTextareaClass} md:col-span-2 xl:col-span-3`} value={detail.handover.inspection.note} onChange={(event) => updateInspection({ note: event.target.value })} /></div></section>
        <textarea placeholder="Övergripande anteckning" disabled={!canEdit} className={premiumTextareaClass} value={detail.handover.generalNote} onChange={(event) => update({ generalNote: event.target.value })} />
        {canEdit ? <div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={() => void save(false)} className="rounded-xl border border-petroleum-700 px-4 py-2.5 text-sm font-semibold text-petroleum-800">Spara utkast</button><button type="button" disabled={saving || Boolean(detail.handover.completedAt)} onClick={() => void save(true)} className={premiumPrimaryButtonClass}>{detail.handover.completedAt ? "Överlämning slutförd" : "Slutför överlämning"}</button></div> : detail.permissions.canManage ? null : <InlineAlert tone="info">Du har läsbehörighet.</InlineAlert>}
        <section className="rounded-2xl border border-sand-200 p-5"><div className="flex items-center gap-2"><History className="h-5 w-5 text-petroleum-700" /><h3 className="font-semibold text-ink-900">Historik</h3></div>{detail.history.length === 0 ? <p className="mt-3 text-sm text-ink-500">Ingen historik registrerad ännu.</p> : <div className="mt-3 divide-y divide-sand-100">{detail.history.map((item) => <div key={item.id} className="py-3 text-sm"><p className="font-medium text-ink-800">{item.action === "lease_handover.completed" ? "Överlämning slutförd" : "Överlämning uppdaterad"}</p><p className="mt-1 text-xs text-ink-500">{date.format(new Date(item.created_at))} · {item.actor?.name || item.actor?.email || "System"}</p></div>)}</div>}</section>
      </>}
    </div>
  </Panel>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-sand-50 p-4"><p className="text-xs text-ink-500">{label}</p><p className="mt-1 font-semibold text-ink-900">{value}</p></div>; }
