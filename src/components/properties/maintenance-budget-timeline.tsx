"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, CalendarRange, Layers3 } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Action = {
  id: string;
  category: string;
  title: string;
  planned_year: number;
  recurrence_years: number | null;
  estimated_cost: number;
  annual_index_rate: number | null;
  priority: string;
  risk: string;
  status: string;
  building_name: string | null;
};

type Plan = {
  id: string;
  name: string;
  base_year: number;
  horizon_years: number;
  annual_index_rate: number;
};

type Data = {
  activePlan: Plan | null;
  actions: Action[];
};

type TimelineItem = Action & { occurrenceYear: number; indexedCost: number };

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

function expandAction(action: Action, plan: Plan, endYear: number): TimelineItem[] {
  if (["cancelled", "completed"].includes(action.status)) return [];
  const result: TimelineItem[] = [];
  let year = action.planned_year;
  while (year <= endYear) {
    if (year >= plan.base_year) {
      const yearsFromBase = Math.max(0, year - plan.base_year);
      const rate = Number(action.annual_index_rate ?? plan.annual_index_rate) / 100;
      result.push({
        ...action,
        occurrenceYear: year,
        indexedCost: Number(action.estimated_cost) * Math.pow(1 + rate, yearsFromBase),
      });
    }
    if (!action.recurrence_years) break;
    year += action.recurrence_years;
  }
  return result;
}

export function MaintenanceBudgetTimeline({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<5 | 10 | 20 | 30>(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/maintenance-plan`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta budget och tidslinje");
      setData(payload);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta budget och tidslinje");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(() => {
    if (!data?.activePlan) return [];
    const endYear = data.activePlan.base_year + Math.min(zoom, data.activePlan.horizon_years) - 1;
    return data.actions
      .flatMap((action) => expandAction(action, data.activePlan!, endYear))
      .sort((a, b) => a.occurrenceYear - b.occurrenceYear || b.indexedCost - a.indexedCost);
  }, [data, zoom]);

  const years = useMemo(() => {
    if (!data?.activePlan) return [];
    const count = Math.min(zoom, data.activePlan.horizon_years);
    return Array.from({ length: count }, (_, index) => data.activePlan!.base_year + index);
  }, [data, zoom]);

  const yearly = useMemo(() => {
    return years.map((year) => ({
      year,
      amount: timeline.filter((item) => item.occurrenceYear === year).reduce((sum, item) => sum + item.indexedCost, 0),
    }));
  }, [timeline, years]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of timeline) totals.set(item.category, (totals.get(item.category) || 0) + item.indexedCost);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [timeline]);

  const buildingTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of timeline) {
      const key = item.building_name || "Hela fastigheten";
      totals.set(key, (totals.get(key) || 0) + item.indexedCost);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [timeline]);

  const total = timeline.reduce((sum, item) => sum + item.indexedCost, 0);
  const peak = yearly.reduce((best, item) => (item.amount > best.amount ? item : best), { year: 0, amount: 0 });
  const maxYearAmount = Math.max(1, ...yearly.map((item) => item.amount));

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (error) return <InlineAlert>{error}</InlineAlert>;
  if (!data?.activePlan) return <EmptyState title="Ingen aktiv underhållsplan" description="Aktivera en planversion för att visa budgetmotor och tidslinje." />;

  return (
    <section className="space-y-6" aria-labelledby="maintenance-budget-timeline-heading">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Budgetmotor</p>
          <h2 id="maintenance-budget-timeline-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Budget och tidslinje</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Analysera investeringsbehov per år, kategori och byggnad med indexerade framtida kostnader.</p>
        </div>
        <div className="grid grid-cols-4 rounded-xl bg-sand-50 p-1" aria-label="Välj tidshorisont">
          {[5, 10, 20, 30].map((yearsOption) => (
            <button
              key={yearsOption}
              type="button"
              onClick={() => setZoom(yearsOption as 5 | 10 | 20 | 30)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${zoom === yearsOption ? "bg-white text-petroleum-800 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}
            >
              {yearsOption} år
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={BarChart3} label={`${Math.min(zoom, data.activePlan.horizon_years)}-årsbudget`} value={money.format(total)} hint="Indexerad planerad kostnad" />
        <MetricCard icon={CalendarRange} label="Toppår" value={peak.year || "–"} hint={peak.amount ? money.format(peak.amount) : "Inga kostnader"} />
        <MetricCard icon={Layers3} label="Kategorier" value={categoryTotals.length} hint="Med planerade åtgärder" />
        <MetricCard icon={Building2} label="Byggnader" value={buildingTotals.length} hint="Inklusive hela fastigheten" />
      </div>

      <Panel title="Årsvis investeringsprofil" description={`Visar ${years[0]}–${years.at(-1)} i aktiv planversion.`}>
        <div className="space-y-3">
          {yearly.map((item) => (
            <div key={item.year} className="grid grid-cols-[54px_1fr_auto] items-center gap-3">
              <span className="text-xs font-semibold text-ink-500">{item.year}</span>
              <div className="h-3 overflow-hidden rounded-full bg-sand-100">
                <div className="h-full rounded-full bg-petroleum-600" style={{ width: `${item.amount ? Math.max(2, (item.amount / maxYearAmount) * 100) : 0}%` }} />
              </div>
              <span className="min-w-24 text-right text-xs font-semibold text-ink-800">{money.format(item.amount)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Budget per kategori" description="Största planerade kostnadsposter i vald period.">
          {categoryTotals.length === 0 ? <EmptyState title="Inga kategorier" /> : <div className="space-y-3">{categoryTotals.map(([name, amount]) => <BudgetRow key={name} name={name} amount={amount} total={total} />)}</div>}
        </Panel>
        <Panel title="Budget per byggnad" description="Investeringsbehov för byggnader och gemensamma delar.">
          {buildingTotals.length === 0 ? <EmptyState title="Inga byggnader" /> : <div className="space-y-3">{buildingTotals.map(([name, amount]) => <BudgetRow key={name} name={name} amount={amount} total={total} />)}</div>}
        </Panel>
      </div>

      <Panel title="Professionell tidslinje" description="Åtgärder sorterade kronologiskt inom vald tidshorisont." bodyClassName="p-0">
        {timeline.length === 0 ? <EmptyState title="Inga åtgärder i perioden" /> : (
          <div className="divide-y divide-sand-100">
            {timeline.map((item) => (
              <article key={`${item.id}-${item.occurrenceYear}`} className="grid gap-3 p-5 sm:grid-cols-[72px_1fr_auto] sm:items-center sm:px-6">
                <div className="text-sm font-semibold text-petroleum-800">{item.occurrenceYear}</div>
                <div>
                  <h3 className="font-semibold text-ink-900">{item.title}</h3>
                  <p className="mt-1 text-xs text-ink-500">{item.category}{item.building_name ? ` · ${item.building_name}` : " · Hela fastigheten"}</p>
                </div>
                <div className="text-left text-sm font-semibold text-ink-900 sm:text-right">{money.format(item.indexedCost)}</div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}

function BudgetRow({ name, amount, total }: { name: string; amount: number; total: number }) {
  const share = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-ink-700">{name}</span>
        <span className="font-semibold text-ink-900">{money.format(amount)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-100">
        <div className="h-full rounded-full bg-petroleum-500" style={{ width: `${Math.max(2, share)}%` }} />
      </div>
    </div>
  );
}
