import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
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
  if (priority === "urgent" || priority === "high") return "border-red-100 bg-red-50 text-red-700";
  if (priority === "low") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  return "border-amber-100 bg-amber-50 text-amber-700";
}

function statusClass(status: string) {
  if (status === "completed" || status === "invoiced") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (status === "in_progress" || status === "accepted" || status === "assigned") return "border-sky-100 bg-sky-50 text-sky-700";
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
        status: { not: "closed" },
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }),
    db.ticket.count({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { not: "closed" },
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Portföljöversikt</p>
          <h1 className="mt-1 font-display text-[28px] font-semibold tracking-[-0.04em] text-ink-950 sm:text-[32px]">Översikt</h1>
          <p className="mt-1 text-sm text-ink-500">Samlad realtidsbild av bestånd, ärenden, uthyrning och ekonomi.</p>
        </div>
        <div className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-[12px] font-semibold text-ink-600 shadow-premium-sm">
          <CalendarDays className="h-4 w-4 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
          Senaste 30 dagar
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal">
        <DashboardMetric icon={Building2} label="Fastigheter" value={integer.format(totalProperties)} hint={`${integer.format(totalUnits)} registrerade objekt`} href="/dashboard/fastigheter" linkLabel="Visa alla" />
        <DashboardMetric icon={MessageSquareText} label="Öppna ärenden" value={integer.format(openTickets)} hint={urgentTickets ? `${urgentTickets} akuta kräver uppmärksamhet` : "Inga akuta ärenden"} href="/dashboard/felanmalan" linkLabel="Visa alla" />
        <DashboardMetric icon={DoorOpen} label="Uthyrningsgrad" value={`${occupancy.toLocaleString("sv-SE")} %`} hint={`${occupiedUnitIds.length} av ${totalUnits} objekt uthyrda`} href="/dashboard/uthyrning" linkLabel="Visa detaljer" />
        <DashboardMetric icon={CircleDollarSign} label="Hyresintäkter" value={compactMoney.format(annualContractedRent)} hint="Årlig kontrakterad hyra" href="/dashboard/hyresavisering" linkLabel="Visa ekonomi" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
        <DashboardPanel title="Driftnetto" description={`Utfall per fastighet, ${year}`} action={<Link href="/dashboard/budget" className="text-[12px] font-semibold text-petroleum-700 hover:text-petroleum-900">Budget & prognos →</Link>}>
          <PortfolioLineChart points={chartPoints} />
        </DashboardPanel>

        <DashboardPanel title="Uthyrningsgrad per segment" description="Aktuellt bestånd">
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-7 py-2 sm:flex-row xl:flex-col 2xl:flex-row">
            <div className="relative h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(#174a40 ${Math.max(0, Math.min(100, occupancy))}%, #e9e5db 0)` }} aria-label={`Uthyrningsgrad ${occupancy} procent`}>
              <div className="absolute inset-[18px] flex items-center justify-center rounded-full border border-sand-100 bg-white shadow-[inset_0_1px_3px_rgba(17,34,31,0.04)]">
                <span className="font-display text-[29px] font-semibold tracking-[-0.04em] text-ink-950">{occupancy.toLocaleString("sv-SE")} %</span>
              </div>
            </div>
            <div className="w-full max-w-[260px] space-y-3">
              {occupancySegments.length ? occupancySegments.map((segment, index) => (
                <div key={segment.type} className="flex items-center gap-3 text-[12px]">
                  <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-petroleum-800" : index === 1 ? "bg-petroleum-400" : index === 2 ? "bg-[#c9b98d]" : "bg-ink-300"}`} aria-hidden="true" />
                  <span className="flex-1 text-ink-600">{segment.label}</span>
                  <span className="font-semibold text-ink-900">{segment.percent.toLocaleString("sv-SE")} %</span>
                </div>
              )) : <p className="text-center text-sm text-ink-500">Segmentdata visas när objekt finns registrerade.</p>}
            </div>
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.85fr)]">
        <DashboardPanel title="Senaste arbetsorder" description="De senast skapade arbetsordrarna" action={<Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa alla <ArrowRight className="h-3.5 w-3.5" /></Link>} bodyClassName="p-0">
          {recentWorkOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[690px] text-left">
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-50/55 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">
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
                    <tr key={workOrder.id} className="group transition hover:bg-sand-50/65">
                      <td className="px-5 py-3.5 text-[11px] font-medium text-ink-500"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="hover:text-petroleum-800">{workOrder.work_order_number || "AO"}</Link></td>
                      <td className="max-w-[240px] px-3 py-3.5"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="block truncate text-[12px] font-semibold text-ink-800 transition group-hover:text-petroleum-800">{workOrder.title}</Link></td>
                      <td className="px-3 py-3.5 text-[11px] text-ink-500">{workOrder.property.name}</td>
                      <td className="px-3 py-3.5"><span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${priorityClass(workOrder.priority)}`}>{priorityLabel(workOrder.priority)}</span></td>
                      <td className="px-3 py-3.5"><span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold ${statusClass(workOrder.status)}`}>{statusLabel(workOrder.status)}</span></td>
                      <td className="px-5 py-3.5 text-right text-[11px] text-ink-500">{shortDate.format(workOrder.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[250px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-petroleum-50 text-petroleum-700"><Wrench className="h-5 w-5" strokeWidth={1.6} /></div>
              <p className="mt-4 text-sm font-semibold text-ink-700">Inga arbetsordrar ännu</p>
              <Link href="/dashboard/arbetsorder/ny" className="mt-2 text-xs font-semibold text-petroleum-700">Skapa första arbetsordern →</Link>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Prestandaöversikt" description="Operativa signaler från live-data">
          <div className="divide-y divide-sand-100">
            <PerformanceRow icon={AlertTriangle} label="Akuta ärenden" value={integer.format(urgentTickets)} href="/dashboard/felanmalan" tone={urgentTickets ? "warning" : "good"} />
            <PerformanceRow icon={Wrench} label="Försenade arbetsordrar" value={integer.format(overdueWorkOrders)} href="/dashboard/arbetsorder" tone={overdueWorkOrders ? "warning" : "good"} />
            <PerformanceRow icon={Gauge} label="Underhåll till nästa år" value={integer.format(maintenanceDue)} href="/dashboard/underhall" tone="neutral" />
            <PerformanceRow icon={CircleDollarSign} label="Budgetutfall" value={budgetTotal ? `${budgetProgress.toLocaleString("sv-SE")} %` : "–"} href="/dashboard/budget" tone={budgetTotal && budgetProgress > 105 ? "warning" : "good"} />
          </div>
          <Link href="/dashboard/rapporter" className="mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa hela prestandarapporten <ArrowRight className="h-3.5 w-3.5" /></Link>
        </DashboardPanel>
      </section>
    </div>
  );
}

function DashboardMetric({ icon: Icon, label, value, hint, href, linkLabel }: { icon: typeof Building2; label: string; value: string; hint: string; href: string; linkLabel: string }) {
  return (
    <article className="group flex min-h-[175px] flex-col rounded-2xl border border-sand-200/90 bg-white p-5 shadow-premium-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-sand-300 hover:shadow-premium-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-sand-100 bg-[#F3F2EA] text-petroleum-900"><Icon className="h-[18px] w-[18px]" strokeWidth={1.65} aria-hidden="true" /></div>
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-petroleum-300 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </div>
      <p className="mt-4 text-[12px] font-medium text-ink-600">{label}</p>
      <p className="mt-0.5 font-display text-[29px] font-semibold tracking-[-0.04em] text-ink-950">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-ink-400">{hint}</p>
      <Link href={href} className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[11px] font-semibold text-petroleum-700 transition hover:text-petroleum-950">{linkLabel} <ArrowRight className="h-3 w-3" /></Link>
    </article>
  );
}

function DashboardPanel({ title, description, action, children, bodyClassName = "p-5 sm:p-6" }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; bodyClassName?: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200/90 bg-white shadow-premium-sm">
      <div className="flex min-h-[70px] items-center justify-between gap-4 border-b border-sand-100 px-5 py-4 sm:px-6">
        <div><h2 className="font-display text-[18px] font-semibold tracking-[-0.025em] text-ink-900">{title}</h2>{description ? <p className="mt-0.5 text-[10px] text-ink-400">{description}</p> : null}</div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function PortfolioLineChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const values = points.map((point) => point.value);
  const hasData = values.some((value) => value !== 0);
  if (!points.length || !hasData) {
    return <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-sand-200 bg-sand-50/45 px-6 text-center text-sm text-ink-500">Driftnetto per fastighet visas när budgetutfall finns registrerat för {new Date().getFullYear()}.</div>;
  }

  const width = 720;
  const height = 245;
  const padX = 26;
  const padTop = 20;
  const padBottom = 42;
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
    <div className="min-h-[260px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Driftnetto per fastighet">
        <defs>
          <linearGradient id="revaltaPortfolioArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#386b61" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#386b61" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((line) => {
          const lineY = padTop + (line / 4) * usableHeight;
          return <line key={line} x1={padX} x2={width - padX} y1={lineY} y2={lineY} stroke="#ebe8e0" strokeWidth="1" />;
        })}
        <line x1={padX} x2={width - padX} y1={baseline} y2={baseline} stroke="#d8d4c9" strokeWidth="1" />
        <path d={area} fill="url(#revaltaPortfolioArea)" />
        <path d={path} fill="none" stroke="#174a40" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={point.label} cx={x(index)} cy={y(point.value)} r="3.5" fill="#174a40" stroke="#ffffff" strokeWidth="2" />)}
        {points.map((point, index) => (
          <text key={`${point.label}-label`} x={x(index)} y={height - 12} textAnchor="middle" fontSize="10" fill="#6d6d6d">{point.label.length > 14 ? `${point.label.slice(0, 12)}…` : point.label}</text>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between border-t border-sand-100 pt-3 text-[10px] text-ink-400"><span>Lägst {compactMoney.format(min)}</span><span>Högst {compactMoney.format(max)}</span></div>
    </div>
  );
}

function PerformanceRow({ icon: Icon, label, value, href, tone }: { icon: typeof AlertTriangle; label: string; value: string; href: string; tone: "good" | "warning" | "neutral" }) {
  const dot = tone === "warning" ? "bg-amber-400" : tone === "good" ? "bg-emerald-500" : "bg-petroleum-300";
  return (
    <Link href={href} className="group flex items-center gap-3 py-4 first:pt-1 last:pb-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sand-100 bg-sand-50 text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /></div>
      <div className="min-w-0 flex flex-1 items-center gap-2"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" /><p className="truncate text-[11px] font-medium text-ink-600">{label}</p></div>
      <span className="text-[13px] font-semibold text-ink-900 transition group-hover:text-petroleum-800">{value}</span>
    </Link>
  );
}
