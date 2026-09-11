import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  DoorOpen,
  MessageSquareText,
  Plus,
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
  if (priority === "low") return "border-sand-200 bg-sand-50 text-ink-500";
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

  const attentionItems = [
    urgentTickets ? { id: "akuta", label: `${integer.format(urgentTickets)} akuta ärenden väntar på åtgärd`, meta: "Felanmälan · prioritet akut", href: "/dashboard/felanmalan", tone: "danger" as const } : null,
    overdueWorkOrders ? { id: "forsenade", label: `${integer.format(overdueWorkOrders)} arbetsordrar har passerat sitt slutdatum`, meta: "Arbetsorder · försenad SLA eller slutdatum", href: "/dashboard/arbetsorder", tone: "warning" as const } : null,
    maintenanceDue ? { id: "underhall", label: `${integer.format(maintenanceDue)} underhållsåtgärder planerade till och med ${year + 1}`, meta: "Underhållsplan · planerad, godkänd eller pågående", href: "/dashboard/underhall", tone: "neutral" as const } : null,
    budgetTotal && budgetProgress > 100 ? { id: "budget", label: `Budgetutfallet ligger på ${budgetProgress.toLocaleString("sv-SE")} % av årets budget`, meta: `Ekonomi · utfall ${compactMoney.format(actualTotal)} av ${compactMoney.format(budgetTotal)}`, href: "/dashboard/budget", tone: "warning" as const } : null,
  ].filter((item): item is { id: string; label: string; meta: string; href: string; tone: "danger" | "warning" | "neutral" } => item !== null);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink-950 sm:text-[36px]">Översikt</h1>
          <p className="mt-2.5 max-w-2xl text-[14px] leading-6 text-ink-500">Bestånd, drift, uthyrning och ekonomi i en samlad bild — med det som kräver åtgärd först.</p>
          <p className="mt-2 text-[12px] text-ink-400">Live-data från er organisation · verksamhetsår {year}</p>
        </div>
        <Link href="/dashboard/arbetsorder/ny" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-petroleum-900 px-5 text-[13px] font-semibold text-white transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2">
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />Ny arbetsorder
        </Link>
      </header>

      <section className="grid gap-px overflow-hidden rounded-2xl border border-sand-200/90 bg-sand-200/70 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal">
        <DashboardMetric icon={Building2} label="Fastigheter" value={integer.format(totalProperties)} hint={`${integer.format(totalUnits)} registrerade objekt`} href="/dashboard/fastigheter" />
        <DashboardMetric icon={MessageSquareText} label="Öppna ärenden" value={integer.format(openTickets)} hint={urgentTickets ? `${integer.format(urgentTickets)} akuta kräver uppmärksamhet` : "Inga akuta ärenden"} href="/dashboard/felanmalan" tone={urgentTickets ? "warning" : "default"} />
        <DashboardMetric icon={DoorOpen} label="Uthyrningsgrad" value={`${occupancy.toLocaleString("sv-SE")} %`} hint={`${integer.format(occupiedUnitIds.length)} av ${integer.format(totalUnits)} objekt uthyrda`} href="/dashboard/uthyrning" />
        <DashboardMetric icon={CircleDollarSign} label="Hyresintäkter" value={compactMoney.format(annualContractedRent)} hint="Årlig kontrakterad hyra" href="/dashboard/ekonomi" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.85fr)]">
        <DashboardPanel
          title="Driftnetto"
          description={`Registrerat ekonomiskt utfall per fastighet, ${year}`}
          action={<Link href="/dashboard/budget" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-petroleum-700 transition hover:text-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">Budget &amp; prognos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        >
          <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
            <MiniStat label="Utfall" value={compactMoney.format(actualTotal)} />
            <MiniStat label="Budget" value={compactMoney.format(budgetTotal)} />
            <MiniStat label="Budgetutnyttjande" value={budgetTotal ? `${budgetProgress.toLocaleString("sv-SE")} %` : "—"} />
          </div>
          <PortfolioLineChart points={chartPoints} />
        </DashboardPanel>

        <DashboardPanel title="Kräver din uppmärksamhet" description="Prioriterat utifrån aktuell drift- och ekonomidata" bodyClassName="px-2 py-2 sm:px-2.5">
          {attentionItems.length ? (
            <ul className="divide-y divide-sand-100">
              {attentionItems.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="group flex items-start gap-3 rounded-lg px-3 py-3.5 transition hover:bg-sand-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">
                    <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${item.tone === "danger" ? "bg-red-500" : item.tone === "warning" ? "bg-amber-500" : "bg-petroleum-400"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium leading-5 text-ink-800 transition group-hover:text-petroleum-800">{item.label}</span>
                      <span className="mt-1 block text-[12px] leading-5 text-ink-400">{item.meta}</span>
                    </span>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
              <CheckCircle2 className="h-5 w-5 text-petroleum-600" strokeWidth={1.6} aria-hidden="true" />
              <p className="mt-3 text-[13.5px] font-medium text-ink-700">Inget kräver åtgärd just nu</p>
              <p className="mt-1 max-w-xs text-[12px] leading-5 text-ink-400">Inga akuta ärenden, försenade arbetsordrar eller budgetavvikelser är registrerade.</p>
            </div>
          )}
        </DashboardPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.85fr)]">
        <DashboardPanel
          title="Senaste arbetsorder"
          description="Senast registrerade i organisationen"
          action={<Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-petroleum-700 transition hover:text-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">Visa alla <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
          bodyClassName="p-0"
        >
          {recentWorkOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-sand-200 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-400">
                    <th scope="col" className="px-6 py-3.5">ID</th>
                    <th scope="col" className="px-3 py-3.5">Rubrik</th>
                    <th scope="col" className="px-3 py-3.5">Fastighet</th>
                    <th scope="col" className="px-3 py-3.5">Prioritet</th>
                    <th scope="col" className="px-3 py-3.5">Status</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Skapad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {recentWorkOrders.map((workOrder) => (
                    <tr key={workOrder.id} className="group transition hover:bg-sand-50/60">
                      <td className="px-6 py-4 text-[12.5px] font-medium tabular-nums text-ink-500"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="rounded transition hover:text-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">{workOrder.work_order_number || "AO"}</Link></td>
                      <td className="max-w-[260px] px-3 py-4"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="block truncate rounded text-[13.5px] font-medium text-ink-800 transition group-hover:text-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">{workOrder.title}</Link></td>
                      <td className="px-3 py-4 text-[13px] text-ink-500">{workOrder.property.name}</td>
                      <td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${priorityClass(workOrder.priority)}`}>{priorityLabel(workOrder.priority)}</span></td>
                      <td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${statusClass(workOrder.status)}`}>{statusLabel(workOrder.status)}</span></td>
                      <td className="px-6 py-4 text-right text-[12.5px] tabular-nums text-ink-400">{shortDate.format(workOrder.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-[245px] flex-col items-center justify-center px-6 text-center">
              <Wrench className="h-5 w-5 text-petroleum-600" strokeWidth={1.6} aria-hidden="true" />
              <p className="mt-3 text-[13.5px] font-medium text-ink-700">Inga arbetsordrar ännu</p>
              <p className="mt-1 max-w-xs text-[12px] leading-5 text-ink-400">Skapa den första arbetsordern för att börja följa drift och utförande här.</p>
              <Link href="/dashboard/arbetsorder/ny" className="mt-3 text-[12.5px] font-semibold text-petroleum-700 hover:text-petroleum-900">Skapa arbetsorder →</Link>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Uthyrningsgrad" description="Aktuellt bestånd per segment">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[32px] font-semibold leading-none tracking-[-0.04em] text-ink-950 tabular-nums">{occupancy.toLocaleString("sv-SE")} %</span>
            <span className="text-[12.5px] text-ink-400">totalt uthyrt</span>
          </div>
          <div className="mt-5 space-y-4">
            {occupancySegments.length ? occupancySegments.map((segment) => (
              <div key={segment.type}>
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="flex-1 truncate text-ink-600">{segment.label}</span>
                  <span className="tabular-nums text-[12px] text-ink-400">{integer.format(segment.occupied)}/{integer.format(segment.total)}</span>
                  <span className="w-14 text-right font-semibold tabular-nums text-ink-900">{segment.percent.toLocaleString("sv-SE")} %</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{ width: `${Math.max(0, Math.min(100, segment.percent))}%` }} /></div>
              </div>
            )) : <p className="text-[13px] leading-5 text-ink-500">Segmentdata visas när objekt finns registrerade.</p>}
          </div>
          <Link href="/dashboard/uthyrning" className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-petroleum-700 transition hover:text-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200">Visa uthyrning <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </DashboardPanel>
      </section>
    </div>
  );
}

function DashboardMetric({ icon: Icon, label, value, hint, href, tone = "default" }: { icon: typeof Building2; label: string; value: string; hint: string; href: string; tone?: "default" | "warning" }) {
  return (
    <Link href={href} className="group flex flex-col bg-[#FFFEFB] px-6 py-6 transition hover:bg-sand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleum-300">
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink-500">
        <Icon className="h-4 w-4 shrink-0 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
        {label}
      </span>
      <span className="mt-3 font-display text-[30px] font-semibold leading-none tracking-[-0.04em] text-ink-950 tabular-nums">{value}</span>
      <span className={`mt-2.5 text-[12px] leading-5 ${tone === "warning" ? "font-medium text-amber-700" : "text-ink-400"}`}>{hint}</span>
    </Link>
  );
}

function DashboardPanel({ title, description, action, children, bodyClassName = "p-6" }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; bodyClassName?: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-sand-200/90 bg-[#FFFEFB]">
      <div className="flex items-start justify-between gap-4 border-b border-sand-100 px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-[19px] font-semibold tracking-[-0.025em] text-ink-900">{title}</h2>
          {description ? <p className="mt-1 text-[12.5px] leading-5 text-ink-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-ink-400">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-ink-900 tabular-nums">{value}</p>
    </div>
  );
}

function PortfolioLineChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const values = points.map((point) => point.value);
  const hasData = values.some((value) => value !== 0);
  if (!points.length || !hasData) {
    return <div className="flex min-h-[250px] items-center justify-center rounded-xl border border-dashed border-sand-200 bg-[#FBFAF6] px-6 text-center text-[13px] leading-6 text-ink-400">Driftnetto per fastighet visas när ekonomiskt utfall finns registrerat för {new Date().getFullYear()}.</div>;
  }

  const width = 720;
  const height = 250;
  const padX = 30;
  const padTop = 18;
  const padBottom = 40;
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
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Driftnetto per fastighet. ${points.map((point) => `${point.label}: ${compactMoney.format(point.value)}`).join(". ")}`}>
        {[0, 1, 2, 3, 4].map((line) => {
          const lineY = padTop + (line / 4) * usableHeight;
          return <line key={line} x1={padX} x2={width - padX} y1={lineY} y2={lineY} stroke="#efece4" strokeWidth="1" />;
        })}
        <line x1={padX} x2={width - padX} y1={baseline} y2={baseline} stroke="#d8d3c7" strokeWidth="1" />
        <path d={area} fill="#eef3f1" />
        <path d={path} fill="none" stroke="#315f55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={point.label} cx={x(index)} cy={y(point.value)} r="3.5" fill="#315f55" stroke="#FFFEFB" strokeWidth="2" />)}
        {points.map((point, index) => <text key={`${point.label}-label`} x={x(index)} y={height - 12} textAnchor="middle" fontSize="11" fill="#77736b">{point.label.length > 14 ? `${point.label.slice(0, 12)}…` : point.label}</text>)}
      </svg>
      <div className="mt-3 flex items-center justify-between border-t border-sand-100 pt-3 text-[12px] tabular-nums text-ink-400"><span>Lägst {compactMoney.format(min)}</span><span>Högst {compactMoney.format(max)}</span></div>
    </div>
  );
}
