"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, RefreshCw, Trash2 } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
import type { InspectionCondition, InspectionPriority, LeaseInspectionItem, LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import { PRIORITY_LABELS } from "@/lib/domain-labels";

type LeaseOption = { id: string; lease_number: string; property: { name: string }; unit: { designation: string }; lease_holder: { name: string } };
type Detail = { lease: LeaseOption; record: LeaseInspectionRecord; source?: "table" | "legacy"; permissions: { canManage: boolean } };

const conditionLabels: Record<InspectionCondition, string> = { approved: "Godkänd", remark: "Anmärkning", action_required: "Åtgärd krävs", not_inspected: "Ej kontrollerad" };
const priorityLabels = PRIORITY_LABELS;
const LEGACY_BACKFILL = "Besiktningen finns kvar i äldre lagring. Kör backfill till LeaseInspectionRecord innan den kan uppdateras.";

function newItem(): LeaseInspectionItem {
  return { id: crypto.randomUUID(), area: "", component: "", condition: "not_inspected", priority: "normal", description: "", recommendation: "", selectedForWorkOrder: false, resolved: false };
}

export function LeaseInspectionItemsCenter() {
  const [leases, setLeases] = useState<LeaseOption[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadLeases() {
    try {
      const response = await fetch("/api/leases", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta avtal");
      const options = (data.leases || []).filter((lease: LeaseOption & { status: string }) => ["reserved", "active", "notice", "ended"].includes(lease.status));
      setLeases(options);
      setLeaseId((current) => current || options[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte hämta avtal");
    }
  }

  async function loadDetail(id: string) {
    if (!id) { setDetail(null); setLoading(false); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/leases/${id}/inspection-items`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta besiktningspunkterna");
      setDetail(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte hämta besiktningspunkterna");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadLeases(); }, []);
  useEffect(() => { void loadDetail(leaseId); }, [leaseId]);

  const isLegacy = detail?.source === "legacy";
  const canEdit = Boolean(detail?.permissions.canManage) && !isLegacy;

  const summary = useMemo(() => {
    const items = detail?.record.items || [];
    return {
      total: items.length,
      approved: items.filter((item) => item.condition === "approved").length,
      actions: items.filter((item) => item.condition === "action_required" && !item.resolved).length,
      selected: items.filter((item) => item.selectedForWorkOrder && !item.resolved).length,
    };
  }, [detail]);

  function setItems(items: LeaseInspectionItem[]) {
    if (!canEdit) return;
    setDetail((current) => current ? { ...current, record: { ...current.record, items } } : current);
  }
  function patchItem(id: string, patch: Partial<LeaseInspectionItem>) {
    if (!detail || !canEdit) return;
    setItems(detail.record.items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  function removeItem(id: string) {
    if (!detail || !canEdit || !window.confirm("Ta bort besiktningspunkten?")) return;
    setItems(detail.record.items.filter((item) => item.id !== id));
  }

  async function save() {
    if (!detail) return;
    if (detail.source === "legacy") {
      setError(LEGACY_BACKFILL);
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/leases/${detail.lease.id}/inspection-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detail.record),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte spara besiktningspunkterna");
      setSuccess("Besiktningspunkterna har sparats med versionshistorik.");
      await loadDetail(detail.lease.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte spara besiktningspunkterna");
    } finally { setSaving(false); }
  }

  return <Panel title="Besiktningspunkter per rum och byggnadsdel" description="Registrera flera separata kontroller och välj exakt vilka åtgärder som senare ska bli arbetsorder.">
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Avtal</span><select className={premiumFieldClass} value={leaseId} onChange={(event) => setLeaseId(event.target.value)}><option value="">Välj avtal</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.property.name} · {lease.unit.designation} · {lease.lease_holder.name}</option>)}</select></label>
        <button type="button" onClick={() => void loadDetail(leaseId)} disabled={!leaseId || loading} className="inline-flex h-11 items-center justify-center rounded-xl border border-sand-200 px-4 text-sm font-semibold text-ink-700"><RefreshCw className="mr-2 h-4 w-4" />Uppdatera</button>
      </div>
      {error ? <InlineAlert>{error}</InlineAlert> : null}{success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {loading ? <div className="h-48 animate-pulse rounded-xl bg-sand-100" /> : !detail ? <EmptyState title="Välj ett avtal" description="Besiktningspunkter registreras separat per avtal och objekt." /> : <>
        {isLegacy ? <InlineAlert tone="warning">{LEGACY_BACKFILL}</InlineAlert> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Punkter", summary.total], ["Godkända", summary.approved], ["Öppna åtgärder", summary.actions], ["Valda för arbetsorder", summary.selected]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-sand-50 p-4"><p className="text-xs text-ink-500">{label}</p><p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p></div>)}</div>
        <div className="space-y-4">{detail.record.items.length === 0 ? <EmptyState title="Inga besiktningspunkter" description="Lägg till rum, område eller byggnadsdel som ska kontrolleras." /> : detail.record.items.map((item, index) => <article key={item.id} className="rounded-2xl border border-sand-200 p-5">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-ink-900">Besiktningspunkt {index + 1}</h3>{canEdit ? <button type="button" onClick={() => removeItem(item.id)} className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-700" aria-label="Ta bort"><Trash2 className="h-4 w-4" /></button> : null}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input disabled={!canEdit} className={premiumFieldClass} placeholder="Rum eller område" value={item.area} onChange={(event) => patchItem(item.id, { area: event.target.value })} /><input disabled={!canEdit} className={premiumFieldClass} placeholder="Byggnadsdel, t.ex. golv" value={item.component} onChange={(event) => patchItem(item.id, { component: event.target.value })} /><select disabled={!canEdit} className={premiumFieldClass} value={item.condition} onChange={(event) => patchItem(item.id, { condition: event.target.value as InspectionCondition, selectedForWorkOrder: event.target.value === "action_required" ? item.selectedForWorkOrder : false })}>{Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select disabled={!canEdit} className={premiumFieldClass} value={item.priority} onChange={(event) => patchItem(item.id, { priority: event.target.value as InspectionPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="mt-3 grid gap-3 md:grid-cols-2"><textarea disabled={!canEdit} className={premiumTextareaClass} placeholder="Beskriv skick eller anmärkning" value={item.description} onChange={(event) => patchItem(item.id, { description: event.target.value })} /><textarea disabled={!canEdit} className={premiumTextareaClass} placeholder="Rekommenderad åtgärd" value={item.recommendation} onChange={(event) => patchItem(item.id, { recommendation: event.target.value })} /></div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-700"><label className="flex items-center gap-2"><input type="checkbox" checked={item.selectedForWorkOrder} disabled={!canEdit || item.condition !== "action_required"} onChange={(event) => patchItem(item.id, { selectedForWorkOrder: event.target.checked })} className="h-4 w-4 accent-petroleum-700" />Välj för arbetsorder</label><label className="flex items-center gap-2"><input type="checkbox" checked={item.resolved} disabled={!canEdit} onChange={(event) => patchItem(item.id, { resolved: event.target.checked })} className="h-4 w-4 accent-petroleum-700" />Åtgärdad</label></div>
        </article>)}</div>
        {canEdit ? <div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={() => setItems([...detail.record.items, newItem()])} className="inline-flex items-center justify-center rounded-xl border border-petroleum-700 px-4 py-2.5 text-sm font-semibold text-petroleum-800"><Plus className="mr-2 h-4 w-4" />Lägg till besiktningspunkt</button><button type="button" disabled={saving} onClick={() => void save()} className={premiumPrimaryButtonClass}><ClipboardCheck className="mr-2 h-4 w-4" />{saving ? "Sparar…" : "Spara besiktning"}</button></div> : detail.permissions.canManage ? null : <InlineAlert tone="info">Du har läsbehörighet.</InlineAlert>}
      </>}
    </div>
  </Panel>;
}
