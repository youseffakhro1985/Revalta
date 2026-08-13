"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/domain-labels";
import { readResponseJson } from "@/lib/fetch-json";

type Lease = { id: string; lease_number: string; status: string; property: { name: string }; unit: { designation: string }; lease_holder: { name: string } };
type Link = { itemId: string; workOrderId: string; workOrder: { id: string; status: string; priority: string; title: string } | null };
const statusLabels = WORK_ORDER_STATUS_LABELS;
const LEGACY_BACKFILL = "Besiktningen finns kvar i äldre lagring. Kör backfill till LeaseInspectionRecord innan arbetsorder kan skapas.";

export function InspectionWorkOrderCenter() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [record, setRecord] = useState<LeaseInspectionRecord | null>(null);
  const [source, setSource] = useState<"table" | "legacy" | undefined>(undefined);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadLeases() {
    const response = await fetch("/api/leases", { cache: "no-store" });
    const data = await readResponseJson(response);
    if (!response.ok) throw new Error(data.error || "Kunde inte hämta avtal");
    const options = (data.leases || []).filter((lease: Lease) => ["reserved", "active", "notice", "ended"].includes(lease.status));
    setLeases(options); setLeaseId((current) => current || options[0]?.id || "");
  }

  async function load(id: string) {
    if (!id) { setRecord(null); setLinks([]); setSource(undefined); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const [itemsResponse, statusResponse] = await Promise.all([
        fetch(`/api/leases/${id}/inspection-items`, { cache: "no-store" }),
        fetch(`/api/leases/${id}/inspection-work-orders/status`, { cache: "no-store" }),
      ]);
      const itemsData = await readResponseJson(itemsResponse); const statusData = await readResponseJson(statusResponse);
      if (!itemsResponse.ok) throw new Error(itemsData.error || "Kunde inte hämta besiktningspunkter");
      if (!statusResponse.ok) throw new Error(statusData.error || "Kunde inte hämta arbetsorderstatus");
      setRecord(itemsData.record);
      setSource(itemsData.source === "legacy" || itemsData.source === "table" ? itemsData.source : undefined);
      setLinks(statusData.links || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunde inte läsa arbetsorderkopplingar"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadLeases().catch((cause) => setError(cause instanceof Error ? cause.message : "Kunde inte hämta avtal")); }, []);
  useEffect(() => { void load(leaseId); }, [leaseId]);

  const isLegacy = source === "legacy";
  const linkedByItem = useMemo(() => new Map(links.map((link) => [link.itemId, link])), [links]);
  const selected = record?.items.filter((item) => item.selectedForWorkOrder && item.condition === "action_required" && !item.resolved) || [];
  const pending = selected.filter((item) => !linkedByItem.has(item.id));

  async function create() {
    if (!record || !pending.length) return;
    if (isLegacy) {
      setError(LEGACY_BACKFILL);
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/leases/${leaseId}/inspection-work-orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: record.version, itemIds: pending.map((item) => item.id) }) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsorder");
      setSuccess(`${data.created.length} arbetsorder skapades och kopplades till besiktningen.`);
      await load(leaseId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kunde inte skapa arbetsorder"); }
    finally { setSaving(false); }
  }

  return <Panel title="Arbetsorder från besiktningspunkter" description="Skapa en separat, spårbar arbetsorder för varje vald åtgärdspunkt.">
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Avtal</span><select className={premiumFieldClass} value={leaseId} onChange={(event) => setLeaseId(event.target.value)}><option value="">Välj avtal</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.property.name} · {lease.unit.designation} · {lease.lease_holder.name}</option>)}</select></label><button type="button" onClick={() => void load(leaseId)} className="inline-flex h-11 items-center justify-center rounded-xl border border-sand-200 px-4 text-sm font-semibold text-ink-700"><RefreshCw className="mr-2 h-4 w-4" />Uppdatera</button></div>
      {error ? <InlineAlert>{error}</InlineAlert> : null}{success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {isLegacy ? <InlineAlert tone="warning">{LEGACY_BACKFILL}</InlineAlert> : null}
      {loading ? <div className="h-36 animate-pulse rounded-xl bg-sand-100" /> : !record ? <EmptyState title="Välj ett avtal" description="Sparade besiktningspunkter visas här." /> : selected.length === 0 ? <EmptyState title="Inga valda åtgärdspunkter" description="Markera punkter med Åtgärd krävs och Välj för arbetsorder i besiktningsregistret." /> : <div className="space-y-3">{selected.map((item) => { const link = linkedByItem.get(item.id); return <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-sand-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink-900">{item.area} · {item.component}</p><p className="mt-1 text-sm text-ink-500">{item.description}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-petroleum-700">{item.priority} prioritet</p></div>{link?.workOrder ? <div className="flex items-center gap-3"><span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{statusLabels[link.workOrder.status] || link.workOrder.status}</span><a href={`/dashboard/arbetsorder/${link.workOrder.id}`} className="inline-flex items-center rounded-lg border border-sand-200 px-3 py-2 text-sm font-semibold text-petroleum-800">Öppna<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></div> : <span className="text-sm font-medium text-ink-500">Ej skapad</span>}</article>; })}</div>}
      {pending.length > 0 && !isLegacy ? <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void create()} className={premiumPrimaryButtonClass}><Wrench className="mr-2 h-4 w-4" />{saving ? "Skapar…" : `Skapa ${pending.length} arbetsorder`}</button></div> : null}
    </div>
  </Panel>;
}
