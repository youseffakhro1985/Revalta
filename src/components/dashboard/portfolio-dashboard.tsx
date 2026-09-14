import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  DoorOpen,
  Gauge,
  MessageSquareText,
  UserRoundX,
  Wrench,
} from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";
import { isMissingTableError } from "@/lib/schema-readiness";
import {
  OverviewEmpty,
  OverviewHero,
  OverviewMetricLink,
  OverviewMiniStat,
  OverviewPanel,
  OverviewPulse,
  OverviewQuickNav,
} from "@/components/dashboard/overview-chrome";

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
const date = new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short" });

async function optionalFindMany<T>(table: string, query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error, table)) return [];
    throw error;
  }
}

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
  if (priority === "urgent") return "border-danger-100 bg-danger-50 text-danger-700";
  if (priority === "high") return "border-warning-100 bg-warning-50 text-warning-700";
  if (priority === "low") return "border-sand-200 bg-sand-50 text-ink-550";
  return "border-success-100 bg-success-50 text-success-700";
}

function statusClass(status: string) {
  if (status === "completed" || status === "invoiced") return "border-success-100 bg-success-50 text-success-700";
  if (status === "in_progress" || status === "accepted" || status === "assigned") return "border-petroleum-100 bg-petroleum-50 text-petroleum-700";
  if (status === "cancelled") return "border-danger-100 bg-danger-50 text-danger-700";
  return "border-sand-200 bg-sand-50 text-ink-600";
}

export async function PortfolioDashboard({ user }: { user: CurrentUser }) {
  const now = new Date();
  const year = now.getFullYear();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 30 * 86400000);
  const propertyScope = { deleted_at: null, ...tenantWhere(user) };
  const companyId = user.company_id;

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
    unassignedWorkOrders,
    upcomingRounds,
    upcomingInspections,
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
    companyId
      ? db.lease.findMany({
          where: {
            company_id: companyId,
            deleted_at: null,
            status: { in: activeLeaseStatuses },
            property: { deleted_at: null },
          },
          distinct: ["unit_id"],
          select: { unit_id: true },
        })
      : Promise.resolve([]),
    companyId
      ? db.lease.aggregate({
          where: {
            company_id: companyId,
            deleted_at: null,
            status: { in: activeLeaseStatuses },
            property: { deleted_at: null },
          },
          _sum: { monthly_rent: true },
        })
      : Promise.resolve({ _sum: { monthly_rent: null } }),
    companyId
      ? db.budgetEntry.aggregate({
          where: { company_id: companyId, year, property: { deleted_at: null } },
          _sum: { budget: true, actual: true },
        })
      : Promise.resolve({ _sum: { budget: null, actual: null } }),
    companyId
      ? db.portfolioMaintenanceItem.count({
          where: {
            company_id: companyId,
            property: { deleted_at: null },
            planned_year: { lte: year + 1 },
            status: { in: ["planned", "approved", "in_progress"] },
          },
        })
      : Promise.resolve(0),
    companyId
      ? db.workOrder.count({
          where: {
            company_id: companyId,
            deleted_at: null,
            property: { deleted_at: null },
            status: activeWorkStatuses,
            OR: [{ completion_due_at: { lt: now } }, { sla_resolution_due_at: { lt: now } }],
          },
        })
      : Promise.resolve(0),
    companyId
      ? db.workOrder.count({
          where: {
            company_id: companyId,
            deleted_at: null,
            assigned_to_id: null,
            property: { deleted_at: null },
            status: activeWorkStatuses,
          },
        })
      : Promise.resolve(0),
    companyId
      ? optionalFindMany("InspectionRound", () => db.inspectionRound.findMany({
          where: {
            company_id: companyId,
            status: { not: "completed" },
            next_due: { gte: today, lte: horizon },
            property: { deleted_at: null },
          },
          orderBy: { next_due: "asc" },
          take: 6,
          select: { id: true, title: true, next_due: true, property: { select: { name: true } } },
        }))
      : Promise.resolve([]),
    companyId
      ? optionalFindMany("ComplianceInspection", () => db.complianceInspection.findMany({
          where: {
            company_id: companyId,
            status: { notIn: ["completed", "cancelled"] },
            due_date: { gte: today, lte: horizon },
            property: { deleted_at: null },
          },
          orderBy: { due_date: "asc" },
          take: 6,
          select: { id: true, title: true, type: true, due_date: true, responsible: true, property: { select: { name: true } } },
        }))
      : Promise.resolve([]),
    companyId
      ? db.workOrder.findMany({
          where: { company_id: companyId, deleted_at: null, property: { deleted_at: null } },
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

  const budgetByProperty = companyId && focusProperties.length
    ? await db.budgetEntry.groupBy({
        by: ["property_id"],
        where: {
          company_id: companyId,
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

  const attentionCount = urgentTickets + overdueWorkOrders + unassignedWorkOrders;

  return (
    <div className="space-y-5 sm:space-y-6">
      <OverviewHero
        eyebrow="Portföljöversikt"
        title="Översikt"
        description="En samlad bild av bestånd, drift, uthyrning och ekonomi — med tydliga vägar till det som kräver åtgärd."
        userName={user.name}
        userEmail={user.email}
        role={user.role}
        companyName={user.company?.name}
        statusLabel={attentionCount ? "Kräver åtgärd" : "Live · stabil drift"}
        statusTone={attentionCount ? "attention" : "good"}
        actions={[
          { href: "/dashboard/arbetsorder/ny", label: "Ny arbetsorder", primary: true },
          { href: "/dashboard/felanmalan", label: "Ärenden" },
          { href: "/dashboard/ekonomi", label: "Ekonomi" },
        ]}
      />

      <OverviewQuickNav
        items={[
          { href: "/dashboard/fastigheter", label: "Fastigheter", description: "Bestånd, karta och objekt", icon: Building2 },
          { href: "/dashboard/felanmalan", label: "Ärenden", description: "Prioritera och följ upp", icon: MessageSquareText },
          { href: "/dashboard/arbetsorder", label: "Arbetsorder", description: "Planering och utförande", icon: Wrench },
          { href: "/dashboard/ekonomi", label: "Ekonomi", description: "Utfall, budget och rapport", icon: CircleDollarSign },
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal">
        <OverviewMetricLink icon={Building2} label="Fastigheter" value={integer.format(totalProperties)} hint={`${integer.format(totalUnits)} registrerade objekt`} href="/dashboard/fastigheter" />
        <OverviewMetricLink icon={MessageSquareText} label="Öppna ärenden" value={integer.format(openTickets)} hint={urgentTickets ? `${urgentTickets} akuta kräver uppmärksamhet` : "Inga akuta ärenden"} href="/dashboard/felanmalan" tone={urgentTickets ? "warning" : "default"} />
        <OverviewMetricLink icon={DoorOpen} label="Uthyrningsgrad" value={`${occupancy.toLocaleString("sv-SE")} %`} hint={`${occupiedUnitIds.length} av ${totalUnits} objekt uthyrda`} href="/dashboard/uthyrning" />
        <OverviewMetricLink icon={CircleDollarSign} label="Hyresintäkter" value={compactMoney.format(annualContractedRent)} hint="Årlig kontrakterad hyra" href="/dashboard/ekonomi" />
      </section>

      <OverviewPulse
        attentionCount={attentionCount}
        summary={attentionCount
          ? `${urgentTickets} akuta ärenden, ${unassignedWorkOrders} otilldelade och ${overdueWorkOrders} försenade arbetsordrar.`
          : "Inga akuta ärenden, otilldelade eller försenade arbetsordrar är registrerade just nu."}
        actions={[
          { href: "/dashboard/felanmalan", label: "Öppna ärenden →" },
          { href: "/dashboard/arbetsorder", label: "Öppna arbetsorder →" },
        ]}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.58fr)_minmax(320px,0.82fr)]">
        <OverviewPanel
          title="Driftnetto"
          description={`Registrerat ekonomiskt utfall per fastighet, ${year}`}
          action={<Link href="/dashboard/budget" className="inline-flex items-center gap-1 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Budget & prognos <ArrowRight className="h-3.5 w-3.5" /></Link>}
        >
          <div className="mb-5 flex flex-wrap gap-2">
            <OverviewMiniStat label="Utfall" value={compactMoney.format(actualTotal)} />
            <OverviewMiniStat label="Budget" value={compactMoney.format(budgetTotal)} />
            <OverviewMiniStat label="Budgetutnyttjande" value={budgetTotal ? `${budgetProgress.toLocaleString("sv-SE")} %` : "—"} />
          </div>
          <PortfolioLineChart points={chartPoints} />
        </OverviewPanel>

        <OverviewPanel title="Uthyrningsgrad per segment" description="Aktuellt bestånd">
          <div className="flex min-h-[270px] flex-col items-center justify-center gap-7 py-2 sm:flex-row xl:flex-col 2xl:flex-row">
            <div className="relative h-44 w-44 shrink-0 rounded-full shadow-[0_18px_40px_-28px_rgba(20,40,36,0.55)]" style={{ background: `conic-gradient(#315f55 ${Math.max(0, Math.min(100, occupancy))}%, #ece8df 0)` }} aria-label={`Uthyrningsgrad ${occupancy} procent`}>
              <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full border border-sand-100 bg-[#FFFEFB] shadow-[inset_0_1px_3px_rgba(17,34,31,0.04)]">
                <span className="font-display text-[30px] font-semibold tracking-[-0.04em] text-ink-950">{occupancy.toLocaleString("sv-SE")} %</span>
                <span className="mt-1 text-[11px] font-medium text-ink-400">Totalt uthyrt</span>
              </div>
            </div>
            <div className="w-full max-w-[280px] space-y-4">
              {occupancySegments.length ? occupancySegments.map((segment, index) => (
                <div key={segment.type}>
                  <div className="flex items-center gap-2.5 text-[13px]">
                    <span className={`h-2 w-2 rounded-full ${index === 0 ? "bg-petroleum-700" : index === 1 ? "bg-petroleum-400" : index === 2 ? "bg-[#b7a778]" : "bg-ink-300"}`} aria-hidden="true" />
                    <span className="flex-1 text-ink-600">{segment.label}</span>
                    <span className="font-semibold text-ink-900">{segment.percent.toLocaleString("sv-SE")} %</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{ width: `${Math.max(0, Math.min(100, segment.percent))}%` }} /></div>
                </div>
              )) : <p className="text-center text-sm text-ink-500">Segmentdata visas när objekt finns registrerade.</p>}
              <Link href="/dashboard/uthyrning" className="inline-flex items-center gap-1 pt-1 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Visa uthyrning <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </OverviewPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.58fr)_minmax(320px,0.82fr)]">
        <OverviewPanel
          title="Senaste arbetsorder"
          description="Senast registrerade i organisationen"
          action={<Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-1 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Visa alla <ArrowRight className="h-3.5 w-3.5" /></Link>}
          bodyClassName="p-0"
        >
          {recentWorkOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-sand-100 bg-[#FBFAF6] text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                    <th className="px-5 py-3.5">ID</th>
                    <th className="px-3 py-3.5">Rubrik</th>
                    <th className="px-3 py-3.5">Fastighet</th>
                    <th className="px-3 py-3.5">Prioritet</th>
                    <th className="px-3 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Skapad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {recentWorkOrders.map((workOrder) => (
                    <tr key={workOrder.id} className="group transition hover:bg-sand-50/55">
                      <td className="px-5 py-4 text-xs font-medium text-ink-500"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="hover:text-petroleum-800">{workOrder.work_order_number || "AO"}</Link></td>
                      <td className="max-w-[240px] px-3 py-4"><Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="block truncate text-sm font-semibold text-ink-800 transition group-hover:text-petroleum-800">{workOrder.title}</Link></td>
                      <td className="px-3 py-4 text-xs text-ink-500">{workOrder.property.name}</td>
                      <td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(workOrder.priority)}`}>{priorityLabel(workOrder.priority)}</span></td>
                      <td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(workOrder.status)}`}>{statusLabel(workOrder.status)}</span></td>
                      <td className="px-5 py-4 text-right text-xs text-ink-500">{shortDate.format(workOrder.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <OverviewEmpty
              icon={Wrench}
              title="Inga arbetsordrar ännu"
              description="Skapa den första arbetsordern för att börja följa drift och utförande här."
              action={<Link href="/dashboard/arbetsorder/ny" className="text-sm font-semibold text-petroleum-700">Skapa arbetsorder →</Link>}
            />
          )}
        </OverviewPanel>

        <OverviewPanel title="Prestandaöversikt" description="Operativa signaler från live-data">
          <div className="divide-y divide-sand-100">
            <PerformanceRow icon={MessageSquareText} label="Akuta ärenden" value={integer.format(urgentTickets)} href="/dashboard/felanmalan" tone={urgentTickets ? "warning" : "good"} />
            <PerformanceRow icon={UserRoundX} label="Otilldelade arbetsordrar" value={integer.format(unassignedWorkOrders)} href="/dashboard/arbetsorder/planering" tone={unassignedWorkOrders ? "warning" : "good"} />
            <PerformanceRow icon={Wrench} label="Försenade arbetsordrar" value={integer.format(overdueWorkOrders)} href="/dashboard/arbetsorder" tone={overdueWorkOrders ? "warning" : "good"} />
            <PerformanceRow icon={Gauge} label="Underhåll till nästa år" value={integer.format(maintenanceDue)} href="/dashboard/underhall" tone="neutral" />
            <PerformanceRow icon={CircleDollarSign} label="Budgetutfall" value={budgetTotal ? `${budgetProgress.toLocaleString("sv-SE")} %` : "—"} href="/dashboard/budget" tone={budgetTotal && budgetProgress > 105 ? "warning" : "good"} />
          </div>
          <Link href="/dashboard/rapporter" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Visa hela prestandarapporten <ArrowRight className="h-3.5 w-3.5" /></Link>
        </OverviewPanel>
      </section>

      <OverviewPanel title="Kommande ronder och besiktningar" description="Nästa 30 dagar från ronder och besiktningar. Tomma tabeller visas som tom lista, inte som fel." bodyClassName="p-0">
        {(() => {
          const upcoming = [
            ...upcomingRounds.map((round) => ({
              id: `round:${round.id}`,
              title: round.title,
              date: round.next_due,
              type: "Rond",
              property_name: round.property.name,
              responsible: null as string | null,
              href: "/dashboard/ronder",
            })),
            ...upcomingInspections.map((inspection) => ({
              id: `inspection:${inspection.id}`,
              title: inspection.title,
              date: inspection.due_date,
              type: "Besiktning",
              property_name: inspection.property.name,
              responsible: inspection.responsible,
              href: "/dashboard/besiktningar",
            })),
          ].sort((left, right) => left.date.getTime() - right.date.getTime()).slice(0, 6);

          return upcoming.length ? <div className="divide-y divide-sand-100">{upcoming.map((event) => (
            <Link key={event.id} href={event.href} className="grid gap-3 px-5 py-4 transition hover:bg-sand-50/70 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
              <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-petroleum-700">{date.format(event.date)}</p></div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{event.title}</p><p className="mt-1 truncate text-xs text-ink-500">{[event.type, event.property_name, event.responsible].filter(Boolean).join(" · ")}</p></div>
            </Link>
          ))}</div> : <OverviewEmpty icon={CalendarDays} title="Inga kommande ronder eller besiktningar" description="När ronder och besiktningar planeras visas de här 30 dagar framåt." />;
        })()}
        <div className="border-t border-sand-100 p-4"><Link href="/dashboard/kalender" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700">Öppna kalender <CalendarDays className="h-4 w-4" /></Link></div>
      </OverviewPanel>
    </div>
  );
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

function PerformanceRow({ icon: Icon, label, value, href, tone }: { icon: typeof Wrench; label: string; value: string; href: string; tone: "good" | "warning" | "neutral" }) {
  const dot = tone === "warning" ? "bg-warning-400" : tone === "good" ? "bg-success-500" : "bg-petroleum-300";
  return (
    <Link href={href} className="group flex items-center gap-3 py-3.5 first:pt-1 last:pb-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-sand-100 bg-[#F7F5EF] text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="min-w-0 flex flex-1 items-center gap-2"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" /><span className="truncate text-sm font-medium text-ink-600">{label}</span></span>
      <span className="text-sm font-semibold text-ink-900 transition group-hover:text-petroleum-800">{value}</span>
      <ArrowRight className="h-3.5 w-3.5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
    </Link>
  );
}
