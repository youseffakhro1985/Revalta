"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, CircleDollarSign, Gauge, Layers3 } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Asset = Record<string, unknown>;
type Data = {
  property: { id: string; name: string };
  assets: Asset[];
  currentYear: number;
  metrics: { total: number; poorCondition: number; replacementDue5Years: number; replacementValue: number; lifetimeCost: number };
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const labels: Record<string, string> = { elevator: "Hiss", ventilation: "Ventilation", heating: "Värme", electricity: "El", water: "VA", fire: "Brandskydd", access: "Passersystem", other: "Övrigt" };

function text(item: Asset, key: string) { return item[key] == null ? "" : String(item[key]); }
function number(item: Asset, key: string) { return Number(item[key] || 0); }
function formatDate(value: unknown) { if (!value) return "Ej satt"; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? "Ej satt" : date.format(parsed); }

export function ComponentRegistryOverview({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/components`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta komponentregistret");
      setData(payload);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta komponentregistret");
    } finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  const replacementSchedule = useMemo(() => {
    if (!data) return [];
    const totals = new Map<number, number>();
    for (const asset of data.assets) {
      const year = number(asset, "expected_replacement_year");
      if (year) totals.set(year, (totals.get(year) || 0) + number(asset, "replacement_value"));
    }
    return [...totals.entries()].sort((a, b) => a[0] - b[0]).slice(0, 12);
  }, [data]);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (error) return <InlineAlert>{error}</InlineAlert>;
  if (!data || data.assets.length === 0) return <EmptyState title="Inga komponenter registrerade" description="Komplettera tekniska installationer med livslängd, skick och återanskaffningsvärde." />;

  const maxReplacement = Math.max(1, ...replacementSchedule.map(([, amount]) => amount));

  return (
    <section className="space-y-6" aria-labelledby="component-registry-heading">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Teknisk livscykel</p>
        <h2 id="component-registry-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Komponentregister</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Samlad kontroll över skick, livslängd, kostnadshistorik och framtida utbytesbehov.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Layers3} label="Komponenter" value={data.metrics.total} hint={`${data.metrics.poorCondition} med svagt skick`} />
        <MetricCard icon={CalendarRange} label="Byte inom 5 år" value={data.metrics.replacementDue5Years} />
        <MetricCard icon={CircleDollarSign} label="Återanskaffningsvärde" value={money.format(data.metrics.replacementValue)} />
        <MetricCard icon={Gauge} label="Historisk kostnad" value={money.format(data.metrics.lifetimeCost)} hint="Registrerat exklusive moms" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Komponenter och tekniskt skick" description="Prioriterad efter utbytesår och skick." bodyClassName="p-0">
          <div className="divide-y divide-sand-100">
            {data.assets.map((asset) => {
              const condition = number(asset, "condition_grade");
              const replacementYear = number(asset, "expected_replacement_year");
              const warning = condition >= 4 || (replacementYear > 0 && replacementYear <= data.currentYear + 5);
              return (
                <article key={text(asset, "id")} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{text(asset, "name")}</h3>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${warning ? "bg-amber-50 text-amber-800" : "bg-petroleum-50 text-petroleum-800"}`}>{condition ? `Skick ${condition}/5` : "Ej bedömd"}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{text(asset, "component_class") || labels[text(asset, "category")] || text(asset, "category") || "Komponent"}{text(asset, "building_name") ? ` · ${text(asset, "building_name")}` : ""}{text(asset, "location") ? ` · ${text(asset, "location")}` : ""}</p>
                    <p className="mt-2 text-xs text-ink-400">Senaste händelse {formatDate(asset.last_event_at)} · {number(asset, "event_count")} livscykelhändelser</p>
                  </div>
                  <div className="sm:text-right"><p className="text-xs text-ink-400">Beräknat byte</p><p className="mt-1 font-semibold text-ink-900">{replacementYear || "Ej satt"}</p></div>
                  <div className="sm:text-right"><p className="text-xs text-ink-400">Återanskaffning</p><p className="mt-1 font-semibold text-ink-900">{number(asset, "replacement_value") ? money.format(number(asset, "replacement_value")) : "Ej satt"}</p><p className="mt-1 text-xs text-ink-400">Historik {money.format(number(asset, "lifetime_cost"))}</p></div>
                </article>
              );
            })}
          </div>
        </Panel>

        <Panel title="Planerat utbytesbehov" description="Återanskaffningsvärde per registrerat utbytesår.">
          {replacementSchedule.length === 0 ? <EmptyState title="Inga utbytesår satta" /> : <div className="space-y-4">{replacementSchedule.map(([year, amount]) => <div key={year}><div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-ink-700">{year}</span><span className="font-semibold text-ink-900">{money.format(amount)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{ width: `${amount ? Math.max(3, (amount / maxReplacement) * 100) : 0}%` }} /></div></div>)}</div>}
        </Panel>
      </div>
    </section>
  );
}
