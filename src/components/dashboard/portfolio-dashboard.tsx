import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  DoorOpen,
  Gauge,
  MessageSquareText,
  Wrench,
} from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";

const integer = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  notation: "compact",
  maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });

const activeLeaseStatuses = ["reserved", "active", "notice"];
const activeWorkStatuses = { notIn: ["completed", "invoiced", "cancelled"] };

function unitTypeLabel(type: string) {
  if (type === "apartment") return "Bostäder";
  if (type === "office") return "Kontor";
  if (type === "retail" || type === "commercial") return "Lokaler";
  if (type === "parking") return "Parkering";
  return "Övrigt";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    planned: "Planerad",
    assigned: "Tilldelad",
    accepted: "Accepterad",
    in_progress: "Pågår",
    paused: "Pausad",
    completed: "Klart",
    invoiced: "Fakturerad",
    cancelled: "Avbruten",
  };
  return labels[status] || status;
}

function priorityLabel(priority: string) {
  if (priority === "urgent") return "Akut";
  if (priority === "high") return "Hög";
  if (priority === "low") return "Låg";
  return "Normal";
}

function priorityClass(priority: string) {
  if (priority === "urgent") return "border-red-100 bg-red-50 text-red-700";
  if (priority === "high") return "border-orange-100 bg-orange-50 text-orange-700";
  if (priority === "low") return "border-sand-200 bg-sand-50 text-ink-550";
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function statusClass(status: string) {
  if (status === "completed" || status === "invoiced") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "in_progress" || status === "accepted" || status === "assigned") return "border-petroleum-100 bg-petroleum-50 text-petroleum-700";
  if (status === "cancelled") return "border-red-100 bg-red-50 text-red-700";
  return "border-sand-200 bg-sand-50 text-ink-600";
}

export async function PortfolioDashboard({ user }: { user: CurrentUser }) {
  const now = new Date();
  const year = now.getFullYear();
  const propertyScope = { deleted_at: null, ...tenantWhere(user) };

  const [
    totalProperties,
    focusProperties,
    openTickets,
    urgentTickets,
    totalUnits,
    occupiedLeases,
    rentAggregate,
    budget,
    maintenanceDue,
    overdueWorkOrders,
    recentWorkOrders,
    unitTypeTotals,
  ] = await Promise.all([
    db.property.count({ where: propertyScope }),
    db.property.findMany({
      where: propertyScope,
      orderBy: { name: "asc" },
      take: 6,
      select: { id: true, name: true },
    }),
    db.ticket.count({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { notIn: ["completed", "closed"] },
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }),
    db.ticket.count({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { notIn: ["completed", "closed"] },
        priority: "urgent",
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }),
    db.unit.count({ where: { property: propertyScope } }),
    user.company_id
      ? db.lease.findMany({
          where: {
            company_id: user.company_id,
            deleted_at: null,
            status: { in: activeLeaseStatuses },
            property: { deleted_at: null },
          },
          distinct: ["unit_id"],
          select: { unit_id: true },
        })
      : Promise.resolve([]),
    user.company_id
      ? db.lease.aggregate({
          where: {
            company_id: user.company_id,
            deleted_at: null,
            status: { in: activeLeaseStatuses },
            property: { deleted_at: null },
          },
          _sum: { monthly_rent: true },
        })
      : Promise.resolve({ _sum: { monthly_rent: null } }),
    user.company_id
      ? db.budgetEntry.aggregate({
          where: { company_id: user.company_id, year, property: { deleted_at: null } },
          _sum: { budget: true, actual: true },
        })
      : Promise.resolve({ _sum: { budget: null, actual: null } }),
    user.company_id
      ? db.portfolioMaintenanceItem.count({
          where: {
            company_id: user.company_id,
            property: { deleted_at: null },
            planned_year: { lte: year + 1 },
            status: { in: ["planned", "approved", "in_progress"] },
          },
        })
      : Promise.resolve(0),
    user.company_id
      ? db.workOrder.count({
          where: {
            company_id: user.company_id,
            deleted_at: null,
            property: { deleted_at: null },
            status: activeWorkStatuses,
            OR: [{ completion_due_at: { lt: now } }, { sla_resolution_due_at: { lt: now } }],
          },
        })
      : Promise.resolve(0),
    user.company_id
      ? db.workOrder.findMany({
          where: { company_id: user.company_id, deleted_at: null, property: { deleted_at: null } },
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            work_order_number: true,
            title: true,
            priority: true,
            status: true,
            created_at: true,
            property: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    db.unit.groupBy({
      by: ["unit_type"],
      where: { property: propertyScope },
      _count: { _all: true },
    }),
  ]);

  const occupiedUnitIds = occupiedLeases.map((lease) => lease.unit_id);
  const occupiedUnits = occupiedUnitIds.length
    ? await db.unit.findMany({
        where: { id: { in: occupiedUnitIds }, property: propertyScope },
        select: { unit_type: true },
      })
    : [];

  const budgetByProperty = user.company_id && focusProperties.length
    ? await db.budgetEntry.groupBy({
        by: ["property_id"],
        where: {
          company_id: user.company_id,
          year,
          property_id: { in: focusProperties.map((property) => property.id) },
        },
        _sum: { actual: true },
      })
    : [];

  const budgetMap = new Map(budgetByProperty.map((entry) => [entry.property_id, Number(entry._sum.actual || 0)]));
  const chartPoints = focusProperties.map((property) => ({ label: property.name, value: budgetMap.get(property.id) || 0 }));
  const occupancy = totalUnits ? Math.round((occupiedUnitIds.length / totalUnits) * 1000) / 10 : 0;
  const annualContractedRent = Number(rentAggregate._sum.monthly_rent || 0) * 12;
  const budgetTotal = Number(budget._sum.budget || 0);
  const actualTotal = Number(budget._sum.actual || 0);
  const budgetProgress = budgetTotal ? Math.round((actualTotal / budgetTotal) * 1000) / 10 : 0;

  const occupiedByType = occupiedUnits.reduce<Record<string, number>>((acc, unit) => {
    acc[unit.unit_type] = (acc[unit.unit_type] || 0) + 1;
    return acc;
  }, {});

  const occupancySegments = unitTypeTotals
    .map((segment) => ({
      type: segment.unit_type,
      label: unitTypeLabel(segment.unit_type),
      total: segment._count._all,
      occupied: occupiedByType[segment.unit_type] || 0,
    }))
    .map((segment) => ({ ...segment, percent: segment.total ? Math.round((segment.occupied / segment.total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  const attentionCount = urgentTickets + overdueWorkOrders;

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Portföljöversikt</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-2.5 py-1 text-[9px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Live-data
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Översikt</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-500">En lugn realtidsbild av bestånd, drift, uthyrning och ekonomi — med snabbvägar till det som kräver åtgärd.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-[#FFFEFB] px-3.5 text-[11px] font-semibold text-ink-600 shadow-premium-sm">
            <CalendarDays className="h-4 w-4 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
            Senaste 30 dagar
          </span>
          <Link href="/dashboard/arbetsorder/ny" className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[11px] font-semibold text-white shadow-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300">
            <span className="text-base leading-none">＋</span>Ny arbetsorder
          </Link>
        </div>
      </header>

      <nav aria-label="Snabbvägar" className="grid gap-2 rounded-2xl border border-sand-200/90 bg-[#FFFEFB] p-2 shadow-premium-sm sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink href="/dashboard/fastigheter" label="Fastigheter" description="Bestånd, karta och objekt" icon={Building2} />
        <QuickLink href="/dashboard/felanmalan" label="Ärenden" description="Prioritera och följ upp" icon={MessageSquareText} />
        <QuickLink href="/dashboard/arbetsorder" label="Arbetsorder" description="Planering och utförande" icon={Wrench} />
        <QuickLink href="/dashboard/ekonomi" label="Ekonomi" description="Utfall, budget och rapport" icon={CircleDollarSign} />
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal">
        <DashboardMetric icon={Building2} label="Fastigheter" value={integer.format(totalProperties)} hint={`${integer.format(totalUnits)} registrerade objekt`} href="/dashboard/fastigheter" />
        <DashboardMetric icon={MessageSquareText} label="Öppna ärenden" value={integer.format(openTickets)} hint={urgentTickets ? `${urgentTickets} akuta kräver uppmärksamhet` : "Inga akuta ärenden"} href="/dashboard/felanmalan" tone={urgentTickets ? "warning" : "default"} />
        <DashboardMetric icon={DoorOpen} label="Uthyrningsgrad" value={`${occupancy.toLocaleString("sv-SE")} %`} hint={`${occupiedUnitIds.length} av ${totalUnits} objekt uthyrda`} href="/dashboard/uthyrning" />
        <DashboardMetric icon={CircleDollarSign} label="Hyresintäkter" value={compactMoney.format(annualContractedRent)} hint="Årlig kontrakterad hyra" href="/dashboard/ekonomi" />
      </section>

      <section className={`flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${attentionCount ? "border-amber-200 bg-amber-50/65" : "border-emerald-100 bg-emerald-50/55"}`} aria-label="Driftstatus">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${attentionCount ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {attentionCount ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-[11px] font-semibold text-ink-800">{attentionCount ? `${attentionCount} signaler behöver uppmärksamhet` : "Driften ser stabil ut"}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-ink-500">{attentionCount ? `${urgentTickets} akuta ärenden och ${overdueWorkOrders} försenade arbetsordrar.` : "Inga akuta ärenden eller försenade arbetsordrar är registrerade just nu."}</p>
          </div>
        </div>
        {attentionCount ? <div className="flex flex-wrap gap-2 pl-11 sm:pl-0"><Link href="/dashboard/felanmalan" className="text-[10px] font-semibold text-petroleum-800 hover:text-petroleum-950">Öppna ärenden →</Link><Link href="/dashboard/arbetsorder" className="text-[10px] font-semibold text-petroleum-800 hover:text-petroleum-950">Öppna arbetsorder →</Link></div> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.58fr)_minmax(310px,0.82fr)]">
        <DashboardPanel
          title="Driftnetto"
          description={`Registrerat ekonomiskt utfall per fastighet, ${year}`}
          action={<Link href="/dashboard/budget" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Budget & prognos <ArrowRight className="h-3 w-3" /></Link>}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <MiniStat label="Utfall" value={compactMoney.format(actualTotal)} />
            <MiniStat label="Budget" value={compactMoney.format(budgetTotal)} />
            <MiniStat label="Budgetutnyttjande" value={budgetTotal ? `${budgetProgress.toLocaleString("sv-SE")} %` : "—"} />
          </div>
          <PortfolioLineChart points={chartPoints} />
        </DashboardPanel>

        <DashboardPanel title="Uthyrningsgrad per segment" description="Aktuellt bestånd">
          <div className="flex min-h-[270px] flex-col items-center justify-center gap-7 py-2 sm:flex-row xl:flex-col 2xl:flex-row">
            <div className="relative h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(#315f55 ${Math.max(0, Math.min(100, occupancy))}%, #ece8df 0)` }} aria-label={`Uthyrningsgrad ${occupancy} procent`}>
              <div className="absolute inset-[19px] flex flex-col items-center justify-center rounded-full border border-sand-100 bg-[#FFFEFB] shadow-[inset_0_1px_3px_rgba(17,34,31,0.04)]">
                <span className="font-display text-[28px] font-semibold tracking-[-0.04em] text-ink-950">{occupancy.toLocaleString("sv-SE")} %</span>
                <span className="mt-1 text-[9px] font-medium text-ink-400">Totalt uthyrt</span>
              </div>
            </div>
            <div className="w-full max-w-[270px] space-y-3.5">
              {occupancySegments.length ? occupancySegments.map((segment, index) => (
                <div key={segment.type}>
                  <div className="flex items-center gap-2.5 text-[11px]">
                    <span className={`h-2 w-2 rounded-full ${index === 0 ? "bg-petroleum-700" : index === 1 ? "bg-petroleum-400" : index === 2 ? "bg-[#b7a778]" : "bg-ink-300"}`} aria-hidden="true" />
                    <span className="flex-1 text-ink-600">{segment.label}</span>
                    <span className="font-semibold text-ink-900">{segment.percent.toLocaleString("sv-SE")} %</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{ width: `${Math.max(0, Math.min(100, segment.percent))}%` }} /></div>
                </div>
              )) : <p className="text-center text-sm text-ink-500">Segmentdata visas när objekt finns registrerade.</p>}
              <Link href="/dashboard/uthyrning" className="inline-flex items-center gap-1 pt-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa uthyrning <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.58fr)_minmax(310px,0.82fr)]">
        <DashboardPanel
          title="Senaste arbetsorder"
          description="Senast registrerade i organisationen"
          action={<Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa alla <ArrowRight className="h-3 w-3" /></Link>}
          bodyClassName="p-0"
        >
          {recentWorkOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-sand-100 bg-[#FBFAF6] text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                    <th className="px-5 py-3">ID</th>
                    <th className="px-3 py-3">Rubrik</th>
                    <th className="px-3 py-3">Fastighet</th>
                    <th className="px-3 py-3">Prioritet</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Skapad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {recentWorkOrders.map((workOrder) => (
                    <tr key={workOrder.id} className="group transition hover:bg-sand-50/55">
                      <td className="px-5 py-3.5 text-[10px] font-medium text-ink-450"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="hover:text-petroleum-800">{workOrder.work_order_number || "AO"}</Link></td>
                      <td className="max-w-[240px] px-3 py-3.5"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="block truncate text-[11px] font-semibold text-ink-800 transition group-hover:text-petroleum-800">{workOrder.title}</Link></td>
                      <td className="px-3 py-3.5 text-[10px] text-ink-500">{workOrder.property.name}</td>
                      <td className="px-3 py-3.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${priorityClass(workOrder.priority)}`}>{priorityLabel(workOrder.priority)}</span></td>
                      <td className="px-3 py-3.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${statusClass(workOrder.status)}`}>{statusLabel(workOrder.status)}</span></td>
                      <td className="px-5 py-3.5 text-right text-[10px] text-ink-450">{shortDate.format(workOrder.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[245px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-petroleum-50 text-petroleum-700"><Wrench className="h-4.5 w-4.5" strokeWidth={1.6} /></div>
              <p className="mt-3 text-[12px] font-semibold text-ink-700">Inga arbetsordrar ännu</p>
              <p className="mt-1 max-w-xs text-[10px] leading-4 text-ink-450">Skapa den första arbetsordern för att börja följa drift och utförande här.</p>
              <Link href="/dashboard/arbetsorder/ny" className="mt-3 text-[10px] font-semibold text-petroleum-700">Skapa arbetsorder →</Link>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Prestandaöversikt" description="Operativa signaler från live-data">
          <div className="divide-y divide-sand-100">
            <PerformanceRow icon={AlertTriangle} label="Akuta ärenden" value={integer.format(urgentTickets)} href="/dashboard/felanmalan" tone={urgentTickets ? "warning" : "good"} />
            <PerformanceRow icon={Wrench} label="Försenade arbetsordrar" value={integer.format(overdueWorkOrders)} href="/dashboard/arbetsorder" tone={overdueWorkOrders ? "warning" : "good"} />
            <PerformanceRow icon={Gauge} label="Underhåll till nästa år" value={integer.format(maintenanceDue)} href="/dashboard/underhall" tone="neutral" />
            <PerformanceRow icon={CircleDollarSign} label="Budgetutfall" value={budgetTotal ? `${budgetProgress.toLocaleString("sv-SE")} %` : "—"} href="/dashboard/budget" tone={budgetTotal && budgetProgress > 105 ? "warning" : "good"} />
          </div>
          <Link href="/dashboard/rapporter" className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa hela prestandarapporten <ArrowRight className="h-3 w-3" /></Link>
        </DashboardPanel>
      </section>
    </div>
  );
}

function QuickLink({ href, label, description, icon: Icon }: { href: string; label: string; description: string; icon: typeof Building2 }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-3.5 py-3 transition hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sand-100 bg-[#F3F2EA] text-petroleum-800 transition group-hover:bg-petroleum-50"><Icon className="h-4 w-4" strokeWidth={1.65} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-ink-800">{label}</span><span className="mt-0.5 block truncate text-[9px] text-ink-400">{description}</span></span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
    </Link>
  );
}

function DashboardMetric({ icon: Icon, label, value, hint, href, tone = "default" }: { icon: typeof Building2; label: string; value: string; hint: string; href: string; tone?: "default" | "warning" }) {
  return (
    <Link href={href} className="group flex min-h-[160px] flex-col rounded-2xl border border-sand-200/90 bg-[#FFFEFB] p-5 shadow-premium-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-sand-300 hover:shadow-premium-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tone === "warning" ? "border-amber-100 bg-amber-50 text-amber-700" : "border-sand-100 bg-[#F3F2EA] text-petroleum-800"}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.65} aria-hidden="true" /></span>
        <ArrowRight className="h-3.5 w-3.5 text-ink-250 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
      </div>
      <p className="mt-3.5 text-[11px] font-medium text-ink-550">{label}</p>
      <p className="mt-0.5 font-display text-[29px] font-semibold tracking-[-0.045em] text-ink-950">{value}</p>
      <p className={`mt-1 text-[9px] leading-4 ${tone === "warning" ? "font-semibold text-amber-700" : "text-ink-400"}`}>{hint}</p>
      <span className="mt-auto pt-2 text-[9px] font-semibold text-petroleum-700 opacity-0 transition group-hover:opacity-100">Öppna →</span>
    </Link>
  );
}

function DashboardPanel({ title, description, action, children, bodyClassName = "p-5 sm:p-6" }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; bodyClassName?: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200/90 bg-[#FFFEFB] shadow-premium-sm">
      <div className="flex min-h-[66px] items-center justify-between gap-4 border-b border-sand-100 px-5 py-4 sm:px-6">
        <div className="min-w-0"><h2 className="font-display text-[17px] font-semibold tracking-[-0.025em] text-ink-900">{title}</h2>{description ? <p className="mt-0.5 truncate text-[9px] text-ink-400">{description}</p> : null}</div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-sand-100 bg-[#FBFAF6] px-3 py-2"><p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-ink-350">{label}</p><p className="mt-0.5 text-[11px] font-semibold text-ink-750">{value}</p></div>;
}

function PortfolioLineChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const values = points.map((point) => point.value);
  const hasData = values.some((value) => value !== 0);
  if (!points.length || !hasData) {
    return <div className="flex min-h-[235px] items-center justify-center rounded-xl border border-dashed border-sand-200 bg-[#FBFAF6] px-6 text-center text-[11px] leading-5 text-ink-450">Driftnetto per fastighet visas när ekonomiskt utfall finns registrerat för {new Date().getFullYear()}.</div>;
  }

  const width = 720;
  const height = 225;
  const padX = 26;
  const padTop = 18;
  const padBottom = 38;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padTop - padBottom;
  const x = (index: number) => padX + (points.length === 1 ? usableWidth / 2 : (index / (points.length - 1)) * usableWidth);
  const y = (value: number) => padTop + ((max - value) / range) * usableHeight;
  const baseline = y(0);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${baseline.toFixed(1)} L${x(0).toFixed(1)},${baseline.toFixed(1)} Z`;

  return (
    <div className="min-h-[235px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Driftnetto per fastighet">
        {[0, 1, 2, 3, 4].map((line) => {
          const lineY = padTop + (line / 4) * usableHeight;
          return <line key={line} x1={padX} x2={width - padX} y1={lineY} y2={lineY} stroke="#ece8df" strokeWidth="1" />;
        })}
        <line x1={padX} x2={width - padX} y1={baseline} y2={baseline} stroke="#d8d3c7" strokeWidth="1" />
        <path d={area} fill="#edf3f0" />
        <path d={path} fill="none" stroke="#315f55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={point.label} cx={x(index)} cy={y(point.value)} r="3.5" fill="#315f55" stroke="#FFFEFB" strokeWidth="2" />)}
        {points.map((point, index) => <text key={`${point.label}-label`} x={x(index)} y={height - 10} textAnchor="middle" fontSize="9" fill="#77736b">{point.label.length > 14 ? `${point.label.slice(0, 12)}…` : point.label}</text>)}
      </svg>
      <div className="mt-1 flex items-center justify-between border-t border-sand-100 pt-3 text-[9px] text-ink-400"><span>Lägst {compactMoney.format(min)}</span><span>Högst {compactMoney.format(max)}</span></div>
    </div>
  );
}

function PerformanceRow({ icon: Icon, label, value, href, tone }: { icon: typeof AlertTriangle; label: string; value: string; href: string; tone: "good" | "warning" | "neutral" }) {
  const dot = tone === "warning" ? "bg-amber-400" : tone === "good" ? "bg-emerald-500" : "bg-petroleum-300";
  return (
    <Link href={href} className="group flex items-center gap-3 py-3.5 first:pt-1 last:pb-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sand-100 bg-[#F7F5EF] text-petroleum-700"><Icon className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="min-w-0 flex flex-1 items-center gap-2"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" /><span className="truncate text-[10px] font-medium text-ink-600">{label}</span></span>
      <span className="text-[12px] font-semibold text-ink-900 transition group-hover:text-petroleum-800">{value}</span>
      <ArrowRight className="h-3 w-3 text-ink-250 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
    </Link>
  );
}
