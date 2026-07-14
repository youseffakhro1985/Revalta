"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarRange, CircleDollarSign } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type Row = {
  property_id: string;
  property_name: string;
  base_year: number;
  annual_index_rate: number;
  action_id: string | null;
  planned_year: number | null;
  recurrence_years: number | null;
  estimated_cost: number | null;
  action_index_rate: number | null;
  risk: string | null;
  status: string | null;
};

type Occurrence = Row & { occurrenceYear: number; indexedCost: number };

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

function expand(row: Row, endYear: number): Occurrence[] {
  if (!row.action_id || !row.planned_year || row.estimated_cost == null || row.status === "cancelled") return [];
  const result: Occurrence[] = [];
  let year = row.planned_year;
  while (year <= endYear) {
    const rate = Number(row.action_index_rate ?? row.annual_index_rate) / 100;
    result.push({
      ...row,
      occurrenceYear: year,
      indexedCost: Number(row.estimated_cost) * Math.pow(1 + rate, Math.max(0, year - row.base_year)),
    });
    if (!row.recurrence_years) break;
    year += row.recurrence_years;
  }
  return result;
}

export function MaintenancePortfolioPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<5 | 10 | 20 | 30>(10);

  useEffect(() => {
    let active = true;
    fetch("/api/maintenance/portfolio", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Kunde inte hämta portföljbudgeten");
        if (active) setRows(payload.rows || []);
      })
      .catch((value) => {
        if (active) setError(value instanceof Error ? value.message : "Kunde inte hämta portföljbudgeten");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const portfolio = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const endYear = currentYear + zoom - 1;
    const occurrences = rows.flatMap((row) => expand(row, endYear));
    const totals = new Map<string, { id: string; name: string; total: number; debt: number; critical: number; actions: Set<string> }>();

    for (const row of rows) {
      if (!totals.has(row.property_id)) {
        totals.set(row.property_id, { id: row.property_id, name: row.property_name, total: 0, debt: 0, critical: 0, actions: new Set() });
      }
    }
    for (const item of occurrences) {
      const property = totals.get(item.property_id);
      if (!property) continue;
      property.total += item.indexedCost;
      if (item.occurrenceYear < currentYear && item.status !== "completed") property.debt += item.indexedCost;
      if (["high", "critical"].includes(item.risk || "")) property.critical += 1;
      if (item.action_id) property.actions.add(item.action_id);
    }

    const yearly = Array.from({ length: zoom }, (_, index) => {
      const year = currentYear + index;
      return { year, amount: occurrences.filter((item) => item.occurrenceYear === year).reduce((sum, item) => sum + item.indexedCost, 0) };
    });
    const properties = [...totals.values()].sort((a, b) => b.total - a.total);
    const total = properties.reduce((sum, item) => sum + item.total, 0);
    const debt = properties.reduce((sum, item) => sum + item.debt, 0);
    const peak = yearly.reduce((best, item) => item.amount > best.amount ? item : best, { year: 0, amount: 0 });
    return { properties, total, debt, peak, yearly };
  }, [rows, zoom]);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (error) return <InlineAlert>{error}</InlineAlert>;
  if (rows.length === 0) return <EmptyState title="Inga aktiva underhållsplaner" description="Aktivera minst en plan för att bygga portföljbudgeten." />;

  const maxYear = Math.max(1, ...portfolio.yearly.map((item) => item.amount));

  return (
    <section className="space-y-6" aria-labelledby="portfolio-maintenance-heading">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Portföljstyrning</p>
          <h1 id="portfolio-maintenance-heading" className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink-950">Underhållsbudget för hela beståndet</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Jämför investeringsbehov, risker och underhållsskuld mellan organisationens fastigheter.</p>
        </div>
        <div className="grid grid-cols-4 rounded-xl bg-sand-50 p-1">
          {[5, 10, 20, 30].map((years) => (
            <button key={years} type="button" onClick={() => setZoom(years as 5 | 10 | 20 | 30)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${zoom === years ? "bg-white text-petroleum-800 shadow-sm" : "text-ink-500"}`}>{years} år</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label={`${zoom}-årsbudget`} value={money.format(portfolio.total)} hint="Indexerad portföljkostnad" />
        <MetricCard icon={AlertTriangle} label="Underhållsskuld" value={money.format(portfolio.debt)} hint="Förfallna ej slutförda åtgärder" />
        <MetricCard icon={CalendarRange} label="Toppår" value={portfolio.peak.year || "–"} hint={portfolio.peak.amount ? money.format(portfolio.peak.amount) : "Inga kostnader"} />
        <MetricCard icon={Building2} label="Fastigheter" value={portfolio.properties.length} hint="Med aktiv underhållsplan" />
      </div>

      <Panel title="Årsvis portföljbehov" description={`Samlad investeringsprofil för de kommande ${zoom} åren.`}>
        <div className="space-y-3">
          {portfolio.yearly.map((item) => (
            <div key={item.year} className="grid grid-cols-[54px_1fr_auto] items-center gap-3">
              <span className="text-xs font-semibold text-ink-500">{item.year}</span>
              <div className="h-3 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{ width: `${item.amount ? Math.max(2, (item.amount / maxYear) * 100) : 0}%` }} /></div>
              <span className="min-w-24 text-right text-xs font-semibold text-ink-800">{money.format(item.amount)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Jämförelse per fastighet" description="Fastigheter sorterade efter investeringsbehov i vald period." bodyClassName="p-0">
        <div className="divide-y divide-sand-100">
          {portfolio.properties.map((property) => (
            <article key={property.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:px-6">
              <div><Link href={`/dashboard/fastigheter/${property.id}`} className="font-semibold text-ink-900 hover:text-petroleum-700">{property.name}</Link><p className="mt-1 text-xs text-ink-500">{property.actions.size} planerade åtgärder</p></div>
              <div className="sm:text-right"><p className="text-xs text-ink-400">Investeringsbehov</p><p className="mt-1 font-semibold text-ink-900">{money.format(property.total)}</p></div>
              <div className="sm:text-right"><p className="text-xs text-ink-400">Underhållsskuld</p><p className={`mt-1 font-semibold ${property.debt > 0 ? "text-amber-800" : "text-ink-900"}`}>{money.format(property.debt)}</p></div>
              <div className="sm:text-right"><p className="text-xs text-ink-400">Högriskposter</p><p className="mt-1 font-semibold text-ink-900">{property.critical}</p></div>
            </article>
          ))}
        </div>
      </Panel>
    </section>
  );
}
