"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, History } from "lucide-react";
import { InlineAlert, Panel, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

type Plan = {
  id: string;
  name: string;
  version: number;
  status: string;
  base_year: number;
  horizon_years: number;
  annual_index_rate: number;
  approved_at: string | null;
  approved_by_name: string | null;
  created_at: string;
  action_count: number;
  estimated_total: number;
};

type Data = { property: { id: string; name: string }; plans: Plan[] };

const statusLabels: Record<string, string> = { draft: "Utkast", active: "Godkänd och aktiv", archived: "Arkiverad" };

export function MaintenancePlanGovernance({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/maintenance-plan/governance`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta versionshistoriken");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunde inte hämta versionshistoriken");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(planId: string, action: "plan.approve" | "plan.archive") {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/maintenance-plan/governance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte uppdatera planversionen");
      setSuccess(action === "plan.approve" ? "Planversionen är godkänd och aktiv." : "Planversionen är arkiverad.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunde inte uppdatera planversionen");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-56 animate-pulse rounded-2xl bg-sand-100" />;
  if (!data) return <InlineAlert>{error || "Versionshistoriken kunde inte laddas."}</InlineAlert>;

  return (
    <Panel title="Godkännande och versionshistorik" description="Spårbar styrning av underhållsplanens planversioner, godkännanden och arkivering." bodyClassName="p-0">
      {(error || success) ? <div className="p-5 pb-0"><InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert></div> : null}
      {data.plans.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-500">Inga planversioner har skapats ännu.</div>
      ) : (
        <div className="divide-y divide-sand-100">
          {data.plans.map((plan) => (
            <article key={plan.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <History className="h-4 w-4 text-petroleum-700" aria-hidden="true" />
                    <h3 className="font-semibold text-ink-900">{plan.name} · version {plan.version}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${plan.status === "active" ? "bg-emerald-50 text-emerald-800" : plan.status === "archived" ? "bg-sand-100 text-ink-500" : "bg-amber-50 text-amber-800"}`}>
                      {statusLabels[plan.status] || plan.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-500">Basår {plan.base_year} · {plan.horizon_years} år · index {plan.annual_index_rate}%</p>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div><p className="text-xs text-ink-400">Åtgärder</p><p className="mt-1 font-semibold text-ink-800">{plan.action_count}</p></div>
                    <div><p className="text-xs text-ink-400">Grundkostnad</p><p className="mt-1 font-semibold text-ink-800">{money.format(plan.estimated_total)}</p></div>
                    <div><p className="text-xs text-ink-400">Skapad</p><p className="mt-1 font-semibold text-ink-800">{date.format(new Date(plan.created_at))}</p></div>
                  </div>
                  {plan.approved_at ? <p className="mt-4 text-xs leading-5 text-ink-500">Godkänd {date.format(new Date(plan.approved_at))}{plan.approved_by_name ? ` av ${plan.approved_by_name}` : ""}.</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {plan.status !== "active" ? (
                    <button type="button" disabled={saving} onClick={() => void mutate(plan.id, "plan.approve")} className={premiumPrimaryButtonClass}>
                      <CheckCircle2 className="h-4 w-4" /> Godkänn version
                    </button>
                  ) : null}
                  {plan.status !== "archived" ? (
                    <button type="button" disabled={saving} onClick={() => void mutate(plan.id, "plan.archive")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 disabled:opacity-60">
                      <Archive className="h-4 w-4" /> Arkivera
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
