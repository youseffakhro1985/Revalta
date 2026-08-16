import Link from "next/link";
import { CircleDollarSign, Droplets, Flame, Gauge, Zap } from "lucide-react";
import db from "@/lib/db";
import { canViewFinanceData, type CurrentUser } from "@/lib/current-user";
import { MetricCard, Panel } from "@/components/dashboard/premium-ui";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

type LatestReading = {
  value: unknown;
  unit: string;
  period: string;
} | null;

function readingValue(reading: LatestReading) {
  if (!reading) return "–";
  return `${number.format(Number(reading.value || 0))} ${reading.unit}`;
}

function readingHint(reading: LatestReading) {
  return reading ? `Senaste period ${reading.period}` : "Ingen avläsning registrerad";
}

export async function PropertyFinanceEnergySummary({ user, propertyId }: { user: CurrentUser; propertyId: string }) {
  if (!user.company_id || !canViewFinanceData(user.role)) return null;

  const year = new Date().getFullYear();
  const energyScope = { company_id: user.company_id, property_id: propertyId, property: { deleted_at: null } };
  const [electricity, heating, water, energyCost, budget] = await Promise.all([
    db.energyReading.findFirst({
      where: { ...energyScope, type: "electricity" },
      orderBy: { created_at: "desc" },
      select: { value: true, unit: true, period: true },
    }),
    db.energyReading.findFirst({
      where: { ...energyScope, type: "heating" },
      orderBy: { created_at: "desc" },
      select: { value: true, unit: true, period: true },
    }),
    db.energyReading.findFirst({
      where: { ...energyScope, type: "water" },
      orderBy: { created_at: "desc" },
      select: { value: true, unit: true, period: true },
    }),
    db.energyReading.aggregate({
      where: energyScope,
      _sum: { cost: true },
    }),
    db.budgetEntry.aggregate({
      where: { company_id: user.company_id, property_id: propertyId, year, property: { deleted_at: null } },
      _sum: { budget: true, forecast: true, actual: true },
    }),
  ]);

  const totalEnergyCost = Number(energyCost._sum.cost || 0);
  const budgetValue = Number(budget._sum.budget || 0);
  const forecastValue = Number(budget._sum.forecast || 0);
  const actualValue = Number(budget._sum.actual || 0);
  const variance = budgetValue - actualValue;
  const latestPeriods = [electricity?.period, heating?.period, water?.period].filter(Boolean);

  return (
    <div className="space-y-8">
      <section id="energi" className="scroll-mt-36 space-y-4" aria-labelledby="property-energy-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Energi</p>
            <h2 id="property-energy-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Energi och förbrukning</h2>
            <p className="mt-1 text-sm text-ink-500">Senaste registrerade avläsning per energityp. Enheten följer den faktiska EnergyReading-posten och räknas aldrig ihop över olika enheter.</p>
          </div>
          <Link href="/dashboard/energi" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna energimodulen →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Zap} label="Senaste el" value={readingValue(electricity)} hint={readingHint(electricity)} />
          <MetricCard icon={Flame} label="Senaste värme" value={readingValue(heating)} hint={readingHint(heating)} />
          <MetricCard icon={Droplets} label="Senaste vatten" value={readingValue(water)} hint={readingHint(water)} />
          <MetricCard icon={Gauge} label="Registrerad energikostnad" value={money.format(totalEnergyCost)} hint={latestPeriods.length ? `Senaste period ${latestPeriods[0]}` : "Ingen energidata registrerad"} />
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
