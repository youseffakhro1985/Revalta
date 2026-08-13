"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { useCallback, useEffect, useState } from "react";
import { Download, History, RefreshCw } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type AuditRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string | null; email: string } | null;
};

type ReportData = {
  audits: AuditRow[];
  summary: { eventCount: number; costCount: number; auditCount: number; totalCostExVat: number };
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const actionLabels: Record<string, string> = { created: "Skapad", updated: "Uppdaterad", corrected: "Korrigerad", deleted: "Borttagen" };
const entityLabels: Record<string, string> = { technical_asset: "Komponent", component_lifecycle_event: "Livscykelhändelse", component_cost_entry: "Kostnadspost" };

export function ComponentAuditReport({ propertyId, componentId }: { propertyId: string; componentId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/${componentId}/report`, { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta revisionshistoriken");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta revisionshistoriken");
    } finally { setLoading(false); }
  }, [propertyId, componentId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={History} label="Livscykelhändelser" value={data?.summary.eventCount ?? "–"} />
        <MetricCard icon={History} label="Kostnadsposter" value={data?.summary.costCount ?? "–"} />
        <MetricCard icon={History} label="Revisionsposter" value={data?.summary.auditCount ?? "–"} />
        <MetricCard icon={History} label="Total kostnad" value={data ? money.format(data.summary.totalCostExVat) : "–"} hint="Exklusive moms" />
      </div>

      <Panel title="Revisionshistorik och rapport" description="Spårbar historik över skapande, ändringar och korrigeringar för komponenten.">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-ink-500">Exporten innehåller tekniska grunddata, livscykelhändelser, kostnader, arbetsorder- och projektkopplingar samt revisionsspår.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Uppdatera</button>
            <a href={`/api/properties/${propertyId}/components/${componentId}/report?format=csv`} className="inline-flex items-center gap-2 rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-petroleum-900"><Download className="h-4 w-4" /> Exportera CSV</a>
          </div>
        </div>

        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}
        {!loading && data?.audits.length === 0 ? <EmptyState title="Ingen revisionshistorik ännu" description="Ändringar och korrigeringar visas här när komponenten används." /> : null}
        {data?.audits.length ? (
          <div className="overflow-hidden rounded-xl border border-sand-200">
            <div className="divide-y divide-sand-100">
              {data.audits.map((audit) => {
                const fields = Array.isArray(audit.metadata?.fields) ? audit.metadata?.fields.join(", ") : "";
                return <article key={audit.id} className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink-900">{actionLabels[audit.action] || audit.action}</span><span className="rounded-full bg-sand-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{entityLabels[audit.entity_type] || audit.entity_type}</span></div><p className="mt-1 text-sm text-ink-500">{audit.actor?.name || audit.actor?.email || "System"}{fields ? ` · Ändrade fält: ${fields}` : ""}</p></div><time className="shrink-0 text-xs font-semibold text-ink-500">{dateTime.format(new Date(audit.created_at))}</time></div></article>;
              })}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
