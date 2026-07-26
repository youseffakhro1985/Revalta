"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import { readResponseJson } from "@/lib/fetch-json";

type Lease = { id: string; lease_number: string; status: string; property: { name: string }; unit: { designation: string }; lease_holder: { name: string } };
const LEGACY_BACKFILL = "Besiktningen finns kvar i äldre lagring. Kör backfill till LeaseInspectionRecord innan den kan synkroniseras.";

export function InspectionResolutionCenter() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [record, setRecord] = useState<LeaseInspectionRecord | null>(null);
  const [source, setSource] = useState<"table" | "legacy" | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadLeases() {
    const r = await fetch("/api/leases", { cache: "no-store" });
    const d = await readResponseJson(r);
    if (!r.ok) throw new Error(d.error || "Kunde inte hämta avtal");
    const o = (d.leases || []).filter((x: Lease) => ["reserved", "active", "notice", "ended"].includes(x.status));
    setLeases(o);
    setLeaseId((c) => c || o[0]?.id || "");
  }

  async function load(id: string) {
    if (!id) { setRecord(null); setSource(undefined); setLoading(false); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const r = await fetch(`/api/leases/${id}/inspection-items`, { cache: "no-store" });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d.error || "Kunde inte hämta besiktningen");
      setRecord(d.record);
      setSource(d.source === "legacy" || d.source === "table" ? d.source : undefined);
    } catch (c) {
      setError(c instanceof Error ? c.message : "Kunde inte hämta besiktningen");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLeases().catch((c) => setError(c instanceof Error ? c.message : "Kunde inte hämta avtal"));
  }, []);
  useEffect(() => { void load(leaseId); }, [leaseId]);

  const isLegacy = source === "legacy";

  async function reconcile() {
    if (!record || !leaseId) return;
    if (isLegacy) {
      setError(LEGACY_BACKFILL);
      return;
    }
    setSyncing(true); setError(""); setMessage("");
    try {
      const r = await fetch(`/api/leases/${leaseId}/inspection-work-orders/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: record.version }),
      });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d.error || "Kunde inte synkronisera");
      setRecord(d.record);
      setMessage(d.changed ? `${d.changed} besiktningspunkter markerades som åtgärdade.` : "Inga nya slutförda arbetsorder behövde återkopplas.");
    } catch (c) {
      setError(c instanceof Error ? c.message : "Kunde inte synkronisera");
    } finally {
      setSyncing(false);
    }
  }

  const open = record?.items.filter((i) => i.condition === "action_required" && i.selectedForWorkOrder && !i.resolved).length || 0;
  const resolved = record?.items.filter((i) => i.condition === "action_required" && i.resolved).length || 0;

  return (
    <Panel title="Återkoppla slutförda arbetsorder" description="Synkronisera arbetsorderstatus tillbaka till rätt besiktningspunkt.">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <select className={premiumFieldClass} value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
            <option value="">Välj avtal</option>
            {leases.map((l) => (
              <option key={l.id} value={l.id}>{l.lease_number} · {l.property.name} · {l.unit.designation} · {l.lease_holder.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load(leaseId)} className="inline-flex h-11 items-center rounded-xl border border-sand-200 px-4 text-sm font-semibold">
            <RefreshCw className="mr-2 h-4 w-4" />Uppdatera
          </button>
        </div>
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
        {isLegacy ? <InlineAlert tone="warning">{LEGACY_BACKFILL}</InlineAlert> : null}
        {loading ? (
          <div className="h-28 animate-pulse rounded-xl bg-sand-100" />
        ) : !record ? (
          <EmptyState title="Välj ett avtal" description="Sparade besiktningspunkter visas här." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Öppna arbetsorderpunkter" value={open} />
              <Stat label="Åtgärdade punkter" value={resolved} />
            </div>
            {!isLegacy ? (
              <div className="flex justify-end">
                <button type="button" disabled={syncing} onClick={() => void reconcile()} className={premiumPrimaryButtonClass}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />{syncing ? "Synkroniserar…" : "Synkronisera slutförda arbetsorder"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-sand-50 p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}
