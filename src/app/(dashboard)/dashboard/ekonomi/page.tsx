"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Landmark,
  LineChart,
  Search,
  WalletCards,
} from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";

type BudgetEntry = {
  id: string;
  property_id?: string;
  property_name?: string;
  year?: number;
  category?: string;
  account?: string;
  budget?: number;
  forecast?: number;
  actual?: number;
  variance_budget?: number;
  created_at: string;
  source?: "table" | "legacy";
};

type BudgetResponse = {
  entries?: BudgetEntry[];
  properties?: Array<{ id: string; name: string }>;
  permissions?: { canManage?: boolean };
  error?: string;
};

type RentNotice = {
  id: string;
  property_id?: string;
  property_name?: string;
  tenant_name?: string;
  unit?: string;
  period?: string;
  due_date?: string;
  status?: string;
  total?: number;
  created_at: string;
  source?: "table" | "legacy";
};

type RentNoticeResponse = {
  notices?: RentNotice[];
  error?: string;
};

type RangeKey = "quarter" | "year" | "all";

type FinancialSeriesPoint = {
  label: string;
  income: number;
  net: number;
  cash: number;
};

const money = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});
const compactMoney = new Intl.NumberFormat("sv-SE", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  sent: "Skickad",
  paid: "Betald",
  overdue: "Förfallen",
  credited: "Krediterad",
};

function startOfQuarter(date: Date) {
  const month = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), month, 1);
}

function rangeStart(range: RangeKey) {
  const now = new Date();
  if (range === "quarter") return startOfQuarter(now);
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(2000, 0, 1);
}

function inRange(value: string | undefined, range: RangeKey) {
  if (!value) return range === "all";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return time >= rangeStart(range).getTime() && time <= Date.now() + 86_400_000;
}

function isExpenseCategory(category: string | undefined) {
  return category !== "income";
}

function percentDelta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatTrend(value: number | null, suffix = "vs föregående period") {
  if (value === null) return "Ingen jämförelseperiod ännu";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}% ${suffix}`;
}

function quarterKey(date: Date) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function quarterLabel(date: Date) {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

function recentQuarters(count = 6) {
  const current = startOfQuarter(new Date());
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    return new Date(current.getFullYear(), current.getMonth() - offset * 3, 1);
  });
}

function svgPath(values: number[], width: number, height: number, max: number) {
  if (!values.length) return "";
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (Math.max(0, value) / Math.max(1, max)) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function EconomyDashboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [notices, setNotices] = useState<RentNotice[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("quarter");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [budgetResponse, noticeResponse] = await Promise.all([
          fetch("/api/budget", { cache: "no-store" }),
          fetch("/api/rent-notices", { cache: "no-store" }),
        ]);
        if (budgetResponse.status === 401 || noticeResponse.status === 401) {
          router.push("/login");
          return;
        }
        const budget = await readResponseJson<BudgetResponse>(budgetResponse);
        const rent = await readResponseJson<RentNoticeResponse>(noticeResponse);
        if (!budgetResponse.ok) throw new Error(budget.error || "Kunde inte hämta ekonomidata");
        if (!active) return;
        setEntries(budget.entries || []);
        setCanManage(Boolean(budget.permissions?.canManage));
        if (noticeResponse.ok) setNotices(rent.notices || []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Kunde inte läsa ekonomin");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const normalizedQuery = query.trim().toLocaleLowerCase("sv-SE");
  const rangeNotices = useMemo(() => notices.filter((notice) => inRange(notice.due_date || notice.created_at, range)), [notices, range]);
  const currentYear = new Date().getFullYear();
  const rangeEntries = useMemo(() => entries.filter((entry) => range === "all" || Number(entry.year || currentYear) === currentYear), [entries, range, currentYear]);

  const filteredNotices = useMemo(() => rangeNotices.filter((notice) => {
    if (!normalizedQuery) return true;
    return [notice.tenant_name, notice.property_name, notice.unit, notice.period, notice.status]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("sv-SE").includes(normalizedQuery));
  }), [rangeNotices, normalizedQuery]);

  const filteredEntries = useMemo(() => rangeEntries.filter((entry) => {
    if (!normalizedQuery) return true;
    return [entry.account, entry.property_name, entry.category, entry.year]
      .filter((value) => value !== undefined && value !== null)
      .some((value) => String(value).toLocaleLowerCase("sv-SE").includes(normalizedQuery));
  }), [rangeEntries, normalizedQuery]);

  const finance = useMemo(() => {
    const paidIncome = filteredNotices.filter((notice) => notice.status === "paid").reduce((sum, notice) => sum + Number(notice.total || 0), 0);
    const invoicedIncome = filteredNotices.filter((notice) => notice.status !== "credited").reduce((sum, notice) => sum + Number(notice.total || 0), 0);
    const overdueAmount = filteredNotices.filter((notice) => notice.status === "overdue" || (
      notice.due_date && new Date(notice.due_date).getTime() < Date.now() && !["paid", "credited"].includes(notice.status || "")
    )).reduce((sum, notice) => sum + Number(notice.total || 0), 0);
    const operatingCosts = filteredEntries.filter((entry) => ["operations", "maintenance", "energy", "administration", "other"].includes(entry.category || ""))
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.actual || 0)), 0);
    const financeCosts = filteredEntries.filter((entry) => entry.category === "finance").reduce((sum, entry) => sum + Math.max(0, Number(entry.actual || 0)), 0);
    const investments = filteredEntries.filter((entry) => entry.category === "investment").reduce((sum, entry) => sum + Math.max(0, Number(entry.actual || 0)), 0);
    const registeredIncome = filteredEntries.filter((entry) => entry.category === "income").reduce((sum, entry) => sum + Number(entry.actual || 0), 0);
    const income = paidIncome || registeredIncome || invoicedIncome;
    const net = income - operatingCosts - financeCosts;
    const cash = net - investments;
    return { income, invoicedIncome, overdueAmount, operatingCosts, financeCosts, investments, net, cash };
  }, [filteredNotices, filteredEntries]);

  const previousQuarter = useMemo(() => {
    const currentStart = startOfQuarter(new Date());
    const previousStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 3, 1);
    const noticesInPrevious = notices.filter((notice) => {
      const value = new Date(notice.due_date || notice.created_at).getTime();
      return value >= previousStart.getTime() && value < currentStart.getTime();
    });
    const income = noticesInPrevious.filter((notice) => notice.status === "paid").reduce((sum, notice) => sum + Number(notice.total || 0), 0);
    return { income };
  }, [notices]);

  const series = useMemo<FinancialSeriesPoint[]>(() => {
    const quarters = recentQuarters(6);
    const annualExpenseByYear = new Map<number, number>();
    const annualInvestmentByYear = new Map<number, number>();
    for (const entry of entries) {
      const year = Number(entry.year || new Date(entry.created_at).getFullYear());
      if (entry.category === "investment") annualInvestmentByYear.set(year, (annualInvestmentByYear.get(year) || 0) + Math.max(0, Number(entry.actual || 0)));
      else if (isExpenseCategory(entry.category)) annualExpenseByYear.set(year, (annualExpenseByYear.get(year) || 0) + Math.max(0, Number(entry.actual || 0)));
    }
    return quarters.map((quarter) => {
      const key = quarterKey(quarter);
      const income = notices.filter((notice) => {
        const date = new Date(notice.due_date || notice.created_at);
        return quarterKey(date) === key && notice.status === "paid";
      }).reduce((sum, notice) => sum + Number(notice.total || 0), 0);
      const operating = (annualExpenseByYear.get(quarter.getFullYear()) || 0) / 4;
      const investment = (annualInvestmentByYear.get(quarter.getFullYear()) || 0) / 4;
      return { label: quarterLabel(quarter), income, net: income - operating, cash: income - operating - investment };
    });
  }, [entries, notices]);

  const budgetRows = useMemo(() => {
    const row = (label: string, categories: string[], sign = 1) => {
      const relevant = filteredEntries.filter((entry) => categories.includes(entry.category || ""));
      const budget = relevant.reduce((sum, entry) => sum + Number(entry.budget || 0) * sign, 0);
      const actual = relevant.reduce((sum, entry) => sum + Number(entry.actual || 0) * sign, 0);
      const variance = budget ? ((actual - budget) / Math.abs(budget)) * 100 : null;
      return { label, budget, actual, variance };
    };
    const income = row("Hyresintäkter", ["income"]);
    if (!income.actual && finance.income) income.actual = finance.income;
    const operations = row("Driftkostnader", ["operations", "maintenance", "energy", "administration", "other"], -1);
    const interest = row("Räntenetto", ["finance"], -1);
    const investments = row("Investeringar", ["investment"], -1);
    const netActual = finance.net;
    const netBudget = income.budget + operations.budget + interest.budget;
    const cashBudget = netBudget + investments.budget;
    return [
      income,
      { label: "Driftnetto", actual: netActual, budget: netBudget, variance: netBudget ? ((netActual - netBudget) / Math.abs(netBudget)) * 100 : null },
      operations,
      interest,
      { label: "Kassaflöde", actual: finance.cash, budget: cashBudget, variance: cashBudget ? ((finance.cash - cashBudget) / Math.abs(cashBudget)) * 100 : null },
    ];
  }, [filteredEntries, finance]);

  const propertyDistribution = useMemo(() => {
    const totals = new Map<string, { id?: string; name: string; amount: number }>();
    filteredNotices.filter((notice) => notice.status !== "credited").forEach((notice) => {
      const name = notice.property_name || "Ej kopplad";
      const current = totals.get(name) || { id: notice.property_id, name, amount: 0 };
      current.amount += Number(notice.total || 0);
      if (!current.id && notice.property_id) current.id = notice.property_id;
      totals.set(name, current);
    });
    return [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, 6);
  }, [filteredNotices]);

  const recentInvoices = useMemo(() => [...filteredNotices]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5), [filteredNotices]);

  const upcoming = useMemo(() => filteredNotices
    .filter((notice) => notice.due_date && new Date(notice.due_date).getTime() >= new Date().setHours(0, 0, 0, 0) && !["paid", "credited"].includes(notice.status || ""))
    .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())
    .slice(0, 4), [filteredNotices]);

  const chartMax = Math.max(1, ...series.flatMap((point) => [point.income, Math.max(0, point.net), Math.max(0, point.cash)]));
  const distributionTotal = propertyDistribution.reduce((sum, item) => sum + item.amount, 0);
  const incomeTrend = range === "quarter" ? percentDelta(finance.income, previousQuarter.income) : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Ekonomi & analys / Översikt</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Ekonomi</h1>
          <p className="mt-1 text-sm text-ink-500">Hyresintäkter, budget, utfall och betalningsläge i en samlad ekonomisk arbetsyta.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={range} onChange={(event) => setRange(event.target.value as RangeKey)} aria-label="Välj ekonomiperiod" className="h-10 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-650 shadow-premium-sm outline-none focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100">
            <option value="quarter">Senaste kvartalet</option>
            <option value="year">Detta år</option>
            <option value="all">Alla perioder</option>
          </select>
          {canManage ? <Link href="/dashboard/ekonomi/ny-utbetalning" className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[11px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800"><CircleDollarSign className="h-4 w-4" /> Ny utbetalning</Link> : null}
        </div>
      </div>

      <section className="rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm" aria-label="Sök i ekonomin">
        <label className="relative block max-w-2xl">
          <span className="sr-only">Sök fakturor, motparter, konton eller budget</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök fakturor, hyresgäster, konton, budget ..." className="h-11 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] pl-10 pr-4 text-[12px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100" />
        </label>
      </section>

      {error ? <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="status">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ekonomiska nyckeltal">
        <KpiCard icon={CircleDollarSign} label="Hyresintäkter" value={loading ? "—" : compactCurrency(finance.income)} trend={incomeTrend === null && range !== "quarter" ? `${filteredNotices.length} avier i vald period` : formatTrend(incomeTrend)} href="/dashboard/hyresavisering" linkLabel="Visa detaljer" tone="positive" />
        <KpiCard icon={LineChart} label="Driftnetto" value={loading ? "—" : compactCurrency(finance.net)} trend={`${compactCurrency(finance.operatingCosts + finance.financeCosts)} registrerade kostnader`} href="/dashboard/budget" linkLabel="Visa detaljer" tone={finance.net >= 0 ? "positive" : "negative"} />
        <KpiCard icon={FileText} label="Förfallna fakturor" value={loading ? "—" : compactCurrency(finance.overdueAmount)} trend="Förfallna hyresavier i vald period" href="/dashboard/hyresavisering" linkLabel="Visa fakturor" tone={finance.overdueAmount > 0 ? "negative" : "positive"} />
        <KpiCard icon={Banknote} label="Kassaflöde" value={loading ? "—" : compactCurrency(finance.cash)} trend={`${compactCurrency(finance.investments)} registrerade investeringar`} href="/dashboard/rapporter" linkLabel="Visa kassaflöde" tone={finance.cash >= 0 ? "positive" : "negative"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-display text-[18px] font-semibold text-ink-950">Ekonomisk utveckling</h2><p className="mt-1 text-[10px] text-ink-450">Sex senaste kvartalen · verkliga avier och registrerat ekonomiskt utfall</p></div>
            <span className="rounded-lg border border-sand-200 bg-[#FCFBF8] px-2.5 py-1.5 text-[10px] font-semibold text-ink-550">Kvartalsvis</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-ink-500"><Legend tone="dark" label="Hyresintäkter" /><Legend tone="mid" label="Driftnetto" /><Legend tone="sand" label="Kassaflöde" /></div>
          <div className="mt-5 min-h-[250px]">
            {series.every((point) => point.income === 0 && point.net === 0 && point.cash === 0) ? <EmptyPanel icon={LineChart} title="Ingen ekonomisk historik ännu" description="När avier och ekonomiskt utfall registreras visas utvecklingen automatiskt här." /> : (
              <div className="relative overflow-hidden rounded-xl bg-[#FCFBF8] px-3 pb-3 pt-5">
                <svg viewBox="0 0 720 240" className="h-[230px] w-full" role="img" aria-label="Ekonomisk utveckling över sex kvartal">
                  {[0, 1, 2, 3, 4].map((index) => <line key={index} x1="24" y1={20 + index * 48} x2="696" y2={20 + index * 48} stroke="#ece4d8" strokeWidth="1" />)}
                  <path d={svgPath(series.map((point) => point.income), 672, 190, chartMax)} transform="translate(24 20)" fill="none" stroke="#29463f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={svgPath(series.map((point) => Math.max(0, point.net)), 672, 190, chartMax)} transform="translate(24 20)" fill="none" stroke="#779e90" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={svgPath(series.map((point) => Math.max(0, point.cash)), 672, 190, chartMax)} transform="translate(24 20)" fill="none" stroke="#ad9f89" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                  {series.map((point, index) => {
                    const x = 24 + (index / Math.max(1, series.length - 1)) * 672;
                    const y = 20 + 190 - (point.income / chartMax) * 190;
                    return <circle key={point.label} cx={x} cy={y} r="3.5" fill="#29463f" />;
                  })}
                </svg>
                <div className="grid grid-cols-6 gap-1 px-1 text-center text-[9px] text-ink-400">{series.map((point) => <span key={point.label}>{point.label}</span>)}</div>
              </div>
            )}
          </div>
        </article>

        <article id="budget-vs-utfall" className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-[18px] font-semibold text-ink-950">Budget vs utfall</h2><p className="mt-1 text-[10px] text-ink-450">Vald period och aktuellt budgetår</p></div><Link href="/dashboard/budget" className="text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna budget <ArrowRight className="inline h-3 w-3" /></Link></div>
          <div className="mt-5 grid grid-cols-[1fr_72px_72px_58px] gap-2 border-b border-sand-100 pb-2 text-right text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-400"><span className="text-left">Post</span><span>Utfall</span><span>Budget</span><span>Avvik.</span></div>
          <div className="divide-y divide-sand-100">{budgetRows.map((item) => <BudgetRow key={item.label} {...item} />)}</div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.85fr_0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex items-center justify-between border-b border-sand-100 px-5 py-4"><h2 className="font-display text-[17px] font-semibold text-ink-950">Senaste fakturor</h2><Link href="/dashboard/hyresavisering" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3" /></Link></div>
          {loading ? <div className="space-y-2 p-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-sand-100" />)}</div> : recentInvoices.length === 0 ? <EmptyPanel icon={FileText} title="Inga fakturor ännu" description="Hyresavier visas här när de har skapats." compact /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr className="bg-[#FCFBF8] text-[9px] font-semibold uppercase tracking-[0.05em] text-ink-400"><th className="px-4 py-2.5">Fakturanr</th><th className="px-3 py-2.5">Motpart</th><th className="px-3 py-2.5">Fastighet</th><th className="px-3 py-2.5">Förfallodatum</th><th className="px-3 py-2.5 text-right">Belopp</th><th className="px-4 py-2.5">Status</th></tr></thead><tbody className="divide-y divide-sand-100">{recentInvoices.map((notice) => <tr key={notice.id} onClick={() => router.push("/dashboard/hyresavisering")} className="cursor-pointer text-[10px] text-ink-600 transition hover:bg-sand-50/70"><td className="px-4 py-3 font-medium text-ink-800">{invoiceNumber(notice)}</td><td className="max-w-[150px] px-3 py-3"><span className="block truncate">{notice.tenant_name || "Ej angiven"}</span></td><td className="max-w-[130px] px-3 py-3"><span className="block truncate">{notice.property_name || "—"}</span></td><td className="px-3 py-3">{notice.due_date ? dateFormatter.format(new Date(notice.due_date)) : "—"}</td><td className="px-3 py-3 text-right font-semibold text-ink-800">{money.format(Number(notice.total || 0))}</td><td className="px-4 py-3"><StatusPill status={notice.status || "draft"} /></td></tr>)}</tbody></table></div>
          )}
          <div className="border-t border-sand-100 px-5 py-3"><Link href="/dashboard/hyresavisering" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla fakturor <ArrowRight className="h-3 w-3" /></Link></div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <h2 className="font-display text-[17px] font-semibold text-ink-950">Fördelning per fastighet</h2>
          {propertyDistribution.length === 0 ? <EmptyPanel icon={Building2} title="Ingen fördelning ännu" description="När avier kopplas till fastigheter visas intäktsfördelningen här." compact /> : <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
            <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: donutGradient(propertyDistribution) }}><div className="absolute inset-[26px] flex flex-col items-center justify-center rounded-full bg-white text-center"><strong className="font-display text-xl text-ink-950">{compactCurrency(distributionTotal)}</strong><span className="mt-0.5 text-[9px] text-ink-450">Hyresintäkter</span></div></div>
            <div className="w-full space-y-2">{propertyDistribution.map((item, index) => <Link key={item.name} href={item.id ? `/dashboard/fastigheter/${item.id}` : "/dashboard/fastigheter"} className="flex items-center gap-2 text-[10px] text-ink-600 hover:text-petroleum-800"><span className={`h-2 w-2 rounded-full ${distributionDot(index)}`} /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="font-semibold">{distributionTotal ? ((item.amount / distributionTotal) * 100).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) : 0}%</span></Link>)}</div>
          </div>}
          <Link href="/dashboard/fastigheter" className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3" /></Link>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold text-ink-950">Kommande betalningar</h2><Link href="/dashboard/hyresavisering" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3" /></Link></div>
          {upcoming.length === 0 ? <EmptyPanel icon={CalendarDays} title="Inga kommande betalningar" description="Obetalda avier med framtida förfallodatum visas automatiskt." compact /> : <div className="mt-4 divide-y divide-sand-100">{upcoming.map((notice) => <Link key={notice.id} href="/dashboard/hyresavisering" className="flex items-start gap-3 py-3 transition hover:bg-sand-50/60"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-50 text-petroleum-700"><Landmark className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-ink-800">{notice.tenant_name || "Betalning"}</span><span className="mt-0.5 block truncate text-[9px] text-ink-400">{notice.property_name || "Fastighet"} · {notice.due_date ? dateFormatter.format(new Date(notice.due_date)) : "—"}</span></span><strong className="shrink-0 text-[10px] text-ink-800">{money.format(Number(notice.total || 0))}</strong></Link>)}</div>}
        </article>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, trend, href, linkLabel, tone }: { icon: typeof CircleDollarSign; label: string; value: string; trend: string; href: string; linkLabel: string; tone: "positive" | "negative" }) {
  return <article className="rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm sm:p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand-50 text-petroleum-800"><Icon className="h-[18px] w-[18px]" strokeWidth={1.7} /></span><div className="min-w-0"><p className="text-[11px] font-medium text-ink-650">{label}</p><p className="mt-1 font-display text-[27px] font-semibold tracking-[-0.045em] text-ink-950">{value}</p><p className={`mt-1.5 min-h-8 text-[9px] leading-4 ${tone === "negative" ? "text-danger-600" : "text-petroleum-600"}`}>{trend}</p></div></div><Link href={href} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">{linkLabel} <ArrowRight className="h-3 w-3" /></Link></article>;
}

function BudgetRow({ label, actual, budget, variance }: { label: string; actual: number; budget: number; variance: number | null }) {
  const ratio = budget ? Math.min(100, Math.abs(actual / budget) * 100) : actual ? 100 : 0;
  const good = variance === null || variance >= 0;
  return <div className="grid grid-cols-[1fr_72px_72px_58px] items-center gap-2 py-3 text-[10px]"><div className="min-w-0"><p className="truncate font-medium text-ink-700">{label}</p><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-100"><div className={`h-full rounded-full ${good ? "bg-petroleum-700" : "bg-sand-500"}`} style={{ width: `${ratio}%` }} /></div></div><span className="text-right font-semibold text-ink-800">{compactCurrency(actual)}</span><span className="text-right text-ink-500">{compactCurrency(budget)}</span><span className={`text-right font-semibold ${good ? "text-petroleum-600" : "text-danger-600"}`}>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}%`}</span></div>;
}

function EmptyPanel({ icon: Icon, title, description, compact = false }: { icon: typeof LineChart; title: string; description: string; compact?: boolean }) {
  return <div className={`${compact ? "py-8" : "py-14"} text-center`}><Icon className="mx-auto h-7 w-7 text-sand-400" /><p className="mt-2 text-[11px] font-semibold text-ink-750">{title}</p><p className="mx-auto mt-1 max-w-sm text-[9px] leading-4 text-ink-450">{description}</p></div>;
}

function Legend({ tone, label }: { tone: "dark" | "mid" | "sand"; label: string }) {
  const cls = tone === "dark" ? "bg-petroleum-800" : tone === "mid" ? "bg-petroleum-400" : "bg-sand-500";
  return <span className="inline-flex items-center gap-1.5"><span className={`h-0.5 w-5 rounded-full ${cls}`} />{label}</span>;
}

function StatusPill({ status }: { status: string }) {
  const positive = status === "paid";
  const negative = status === "overdue";
  const cls = positive ? "border-success-200 bg-success-50 text-success-700" : negative ? "border-danger-200 bg-danger-50 text-danger-700" : "border-sand-200 bg-sand-50 text-ink-550";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${cls}`}>{statusLabels[status] || status}</span>;
}

function invoiceNumber(notice: RentNotice) {
  const year = notice.period?.slice(0, 4) || new Date(notice.created_at).getFullYear();
  return `F-${year}-${notice.id.slice(0, 6).toUpperCase()}`;
}

function compactCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} Mkr`;
  if (absolute >= 1_000) return `${compactMoney.format(value)} kr`;
  return money.format(value);
}

function donutGradient(items: Array<{ amount: number }>) {
  const palette = ["#29463f", "#587f73", "#779e90", "#a5c2b7", "#ad9f89", "#ded3c2"];
  const total = items.reduce((sum, item) => sum + item.amount, 0) || 1;
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += (item.amount / total) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(",")})`;
}

function distributionDot(index: number) {
  return ["bg-petroleum-800", "bg-petroleum-500", "bg-petroleum-400", "bg-petroleum-300", "bg-sand-500", "bg-sand-300"][index % 6] || "bg-sand-400";
}
