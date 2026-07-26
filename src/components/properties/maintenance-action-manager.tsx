"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, PencilLine, RefreshCw } from "lucide-react";
import { EmptyState, InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Action = {
  id: string;
  title: string;
  planned_year: number;
  estimated_cost: number;
  priority: string;
  risk: string;
  status: string;
  category: string;
  building_name: string | null;
  technical_asset_name: string | null;
};

type Data = {
  activePlan: { id: string; name: string; version: number } | null;
  actions: Action[];
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const riskLabels: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög", critical: "Kritisk" };
const statusLabels: Record<string, string> = {
  planned: "Planerad",
  approved: "Godkänd",
  in_progress: "Pågår",
  completed: "Slutförd",
  deferred: "Framflyttad",
  cancelled: "Avbruten",
};

export function MaintenanceActionManager({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/maintenance-plan`, { cache: "no-store" });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta åtgärderna");
      setData(payload);
      setSelectedId((current) => current || payload.actions?.[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte hämta åtgärderna");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => data?.actions.find((action) => action.id === selectedId) || null,
    [data, selectedId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData(event.currentTarget);
      const body = Object.fromEntries(form.entries());
      const response = await fetch(`/api/properties/${propertyId}/maintenance-plan/action`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, actionId: selected.id }),
      });
      const payload = await readResponseJson(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte uppdatera åtgärden");
      setSuccess("Åtgärden har uppdaterats och revisionsloggats.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunde inte uppdatera åtgärden");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-sand-100" />;
  if (!data) return <InlineAlert>{error || "Åtgärderna kunde inte laddas."}</InlineAlert>;

  return (
    <Panel
      title="Redigera underhållsåtgärder"
      description="Uppdatera år, kostnad, prioritet, risk och status med full spårbarhet."
    >
      {error || success ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

      {data.actions.length === 0 ? (
        <EmptyState title="Inga åtgärder att redigera" description="Lägg först till en åtgärd i underhållsplanen." />
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Välj åtgärd</span>
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className={premiumFieldClass}>
                {data.actions.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.planned_year} · {action.title}
                  </option>
                ))}
              </select>
            </label>

            {selected ? (
              <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Vald åtgärd</p>
                <p className="mt-2 font-semibold text-ink-900">{selected.title}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {selected.category}
                  {selected.building_name ? ` · ${selected.building_name}` : ""}
                  {selected.technical_asset_name ? ` · ${selected.technical_asset_name}` : ""}
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-ink-500">Nuvarande kostnad</dt><dd className="font-semibold text-ink-900">{money.format(selected.estimated_cost)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink-500">Prioritet</dt><dd className="font-semibold text-ink-900">{priorityLabels[selected.priority] || selected.priority}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink-500">Risk</dt><dd className="font-semibold text-ink-900">{riskLabels[selected.risk] || selected.risk}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink-500">Status</dt><dd className="font-semibold text-ink-900">{statusLabels[selected.status] || selected.status}</dd></div>
                </dl>
              </div>
            ) : null}
          </div>

          {selected ? (
            <form key={selected.id} onSubmit={submit} className="space-y-4">
              <Field label="Åtgärdsnamn">
                <input name="title" required defaultValue={selected.title} className={premiumFieldClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Planerat år">
                  <input name="plannedYear" required type="number" defaultValue={selected.planned_year} className={premiumFieldClass} />
                </Field>
                <Field label="Kostnad exkl. moms">
                  <input name="estimatedCost" required type="number" min="0" step="1000" defaultValue={selected.estimated_cost} className={premiumFieldClass} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prioritet">
                  <select name="priority" defaultValue={selected.priority} className={premiumFieldClass}>
                    <option value="low">Låg</option>
                    <option value="normal">Normal</option>
                    <option value="high">Hög</option>
                    <option value="urgent">Akut</option>
                  </select>
                </Field>
                <Field label="Risk">
                  <select name="risk" defaultValue={selected.risk} className={premiumFieldClass}>
                    <option value="low">Låg</option>
                    <option value="medium">Medel</option>
                    <option value="high">Hög</option>
                    <option value="critical">Kritisk</option>
                  </select>
                </Field>
              </div>
              <Field label="Status">
                <select name="status" defaultValue={selected.status} className={premiumFieldClass}>
                  <option value="planned">Planerad</option>
                  <option value="approved">Godkänd</option>
                  <option value="in_progress">Pågår</option>
                  <option value="completed">Slutförd</option>
                  <option value="deferred">Framflyttad</option>
                  <option value="cancelled">Avbruten</option>
                </select>
              </Field>
              <div className="rounded-xl border border-petroleum-100 bg-petroleum-50 p-3 text-sm text-petroleum-900">
                <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p>Alla ändringar sparas i revisionshistoriken med tidigare och nya värden.</p></div>
              </div>
              <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                {saving ? "Sparar…" : "Spara ändringar"}
              </button>
            </form>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>;
}
