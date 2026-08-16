import Link from "next/link";
import { CircleDollarSign, Droplets, Flame, Gauge, Zap } from "lucide-react";
import db from "@/lib/db";
import { canViewFinanceData, type CurrentUser } from "@/lib/current-user";
import { MetricCard, Panel } from "@/components/dashboard/premium-ui";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

function sumByType(rows: Array<{ type: string; _sum: { value: unknown; cost: unknown } }>, type: string) {
  const row = rows.find((entry) => entry.type === type);
  return {
    value: Number(row?._sum.value || 0),
    cost: Number(row?._sum.cost || 0),
  };
}

export async function PropertyFinanceEnergySummary({ user, propertyId }: { user: CurrentUser; propertyId: string }) {
  if (!user.company_id || !canViewFinanceData(user.role)) return null;

  const year = new Date().getFullYear();
  const [energyByType, latestEnergy, budget] = await Promise.all([
    db.energyReading.groupBy({
      by: ["type"],
      where: { company_id: user.company_id, property_id: propertyId, property: { deleted_at: null } },
      _sum: { value: true, cost: true },
    }),
    db.energyReading.findFirst({
      where: { company_id: user.company_id, property_id: propertyId, property: { deleted_at: null } },
      orderBy: { created_at: "desc" },
      select: { period: true, created_at: true },
    }),
    db.budgetEntry.aggregate({
      where: { company_id: user.company_id, property_id: propertyId, year, property: { deleted_at: null } },
      _sum: { budget: true, forecast: true, actual: true },
    }),
  ]);

  const electricity = sumByType(energyByType, "electricity");
  const heating = sumByType(energyByType, "heating");
  const water = sumByType(energyByType, "water");
  const totalEnergyCost = electricity.cost + heating.cost + water.cost;
  const budgetValue = Number(budget._sum.budget || 0);
  const forecastValue = Number(budget._sum.forecast || 0);
  const actualValue = Number(budget._sum.actual || 0);
  const variance = budgetValue - actualValue;

  return (
    <div className="space-y-8">
      <section id="energi" className="scroll-mt-36 space-y-4" aria-labelledby="property-energy-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Energi</p>
            <h2 id="property-energy-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Energi och förbrukning</h2>
            <p className="mt-1 text-sm text-ink-500">Fastighetens registrerade el, värme, vatten och kostnader från befintliga EnergyReading-poster.</p>
          </div>
          <Link href="/dashboard/energi" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna energimodulen →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Zap} label="El" value={`${number.format(electricity.value)} kWh`} hint={money.format(electricity.cost)} />
          <MetricCard icon={Flame} label="Värme" value={`${number.format(heating.value)} kWh`} hint={money.format(heating.cost)} />
          <MetricCard icon={Droplets} label="Vatten" value={`${number.format(water.value)} m³`} hint={money.format(water.cost)} />
          <MetricCard icon={Gauge} label="Energikostnad" value={money.format(totalEnergyCost)} hint={latestEnergy?.period ? `Senaste registrering ${latestEnergy.period}` : "Ingen avläsning registrerad"} />
        </div>
      </section>

      <section id="ekonomi" className="scroll-mt-36" aria-labelledby="property-finance-title">
        <Panel title="Ekonomi" description={`Fastighetens budget, prognos och utfall för ${year}.`}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceMetric label="Budget" value={money.format(budgetValue)} />
            <FinanceMetric label="Prognos" value={money.format(forecastValue)} />
            <FinanceMetric label="Utfall" value={money.format(actualValue)} />
            <FinanceMetric label="Budget kvar" value={money.format(variance)} tone={variance < 0 ? "risk" : "normal"} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-4">
            <p id="property-finance-title" className="text-xs leading-5 text-ink-500">Ekonomin återanvänder befintliga BudgetEntry-rader och skapar ingen separat fastighetsbudget.</p>
            <Link href="/dashboard/budget" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900"><CircleDollarSign className="h-4 w-4" aria-hidden="true" />Öppna budget & prognos</Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function FinanceMetric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "risk" }) {
  return <div className="rounded-2xl border border-sand-200 bg-sand-50/70 p-4"><p className="text-xs font-medium text-ink-500">{label}</p><p className={`mt-2 text-xl font-semibold tracking-tight ${tone === "risk" ? "text-red-700" : "text-ink-950"}`}>{value}</p></div>;
}
