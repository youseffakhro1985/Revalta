import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DoorOpen,
  FileText,
  Gauge,
  Wrench,
} from "lucide-react";
import db from "@/lib/db";
import { auditScopedWhere, canViewOperations, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { activePropertyRelationFilter, notDeletedFilter } from "@/lib/schema-readiness";
import { ReportsToolbar, type ReportExportRow } from "@/components/reports/reports-toolbar";
import { redirect } from "next/navigation";

const ticketOpenStatuses = new Set(["new", "received", "assigned", "in_progress", "waiting", "waiting_material", "waiting_resident", "waiting_vendor"]);
const workOrderActiveStatuses = new Set(["new", "planned", "in_progress", "waiting_material", "blocked"]);
const workOrderCompletedStatuses = new Set(["completed", "invoiced"]);
const leaseOccupyingStatuses = ["reserved", "active", "notice"];
const expenseCategories = new Set(["operations", "maintenance", "energy", "administration", "finance", "other"]);
const periodKeys = new Set(["30", "90", "365"]);

type PeriodKey = "30" | "90" | "365";

type MetricProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  href: string;
  alert?: boolean;
};

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDays(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "–";
  const days = milliseconds / 86_400_000;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} tim`;
  return `${Math.max(1, Math.round(days))} dagar`;
}

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} Mkr`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} tkr`;
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}

function comparisonLabel(current: number, previous: number, suffix = "") {
  if (!current && !previous) return "Ingen förändring mot föregående period";
  if (!previous) return `Ny aktivitet i perioden${suffix}`;
  const delta = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (!delta) return `Oförändrat mot föregående period${suffix}`;
  return `${delta > 0 ? "+" : ""}${delta} % mot föregående period${suffix}`;
}

function Metric({ icon: Icon, label, value, detail, href, alert }: MetricProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm transition hover:-translate-y-0.5 hover:border-petroleum-200 hover:shadow-premium-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${alert ? "bg-red-50 text-red-700" : "bg-petroleum-50 text-petroleum-800"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" />
      </div>
      <p className="mt-4 text-[11px] font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-ink-950">{value}</p>
      <p className={`mt-2 text-[10px] leading-4 ${alert ? "text-red-700" : "text-ink-500"}`}>{detail}</p>
    </Link>
  );
}

function buildBuckets(start: Date, end: Date) {
  const count = 6;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const step = Math.max(1, (endMs - startMs) / count);
  const totalDays = Math.round((endMs - startMs) / 86_400_000);
  const formatter = new Intl.DateTimeFormat("sv-SE", totalDays > 180 ? { month: "short" } : { day: "numeric", month: "short" });
  return Array.from({ length: count }, (_, index) => {
    const bucketStart = new Date(startMs + step * index);
    const bucketEnd = new Date(index === count - 1 ? endMs + 1 : startMs + step * (index + 1));
    return { start: bucketStart, end: bucketEnd, label: formatter.format(bucketStart), tickets: 0, completedOrders: 0 };
  });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; property?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewOperations(user.role)) redirect("/dashboard");

  const params = await searchParams;
  const period: PeriodKey = periodKeys.has(params.period || "") ? params.period as PeriodKey : "90";
  const periodDays = Number(period);
  const now = new Date();
  const currentStart = new Date(now.getTime() - periodDays * 86_400_000);
  const previousStart = new Date(currentStart.getTime() - periodDays * 86_400_000);
  const previousEnd = currentStart;
  const currentYear = now.getFullYear();

  const [propertyActive, ticketActive, workOrderActive, leaseActive, propertyRelation] = await Promise.all([
    notDeletedFilter("Property"),
    notDeletedFilter("Ticket"),
    notDeletedFilter("WorkOrder"),
    notDeletedFilter("Lease"),
    activePropertyRelationFilter(),
  ]);

  const properties = await db.property.findMany({
    where: { ...propertyActive, ...tenantWhere(user) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      total_area: true,
      boa: true,
      loa: true,
      _count: { select: { buildings: true, units: true } },
    },
  });

  const selectedPropertyId = properties.some((property) => property.id === params.property) ? params.property! : "";
  const reportProperties = selectedPropertyId ? properties.filter((property) => property.id === selectedPropertyId) : properties;
  const selectedProperty = selectedPropertyId ? properties.find((property) => property.id === selectedPropertyId) : null;
  const selectedWhere = selectedPropertyId ? { property_id: selectedPropertyId } : {};
  const ticketPropertyScope = "property" in propertyRelation ? { OR: [{ property_id: null }, propertyRelation] } : {};

  const [tickets, workOrders, leases, rentNotices, budgetEntries, recentAudit] = await Promise.all([
    db.ticket.findMany({
      where: {
        ...ticketActive,
        ...tenantWhere(user),
        AND: [
          ticketPropertyScope,
          selectedWhere,
          {
            OR: [
              { created_at: { gte: previousStart, lte: now } },
              { closed_at: { gte: previousStart, lte: now } },
              { status: { in: [...ticketOpenStatuses] } },
            ],
          },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 1500,
      select: {
        id: true,
        status: true,
        priority: true,
        category: true,
        created_at: true,
        closed_at: true,
        property: { select: { id: true, name: true } },
        assigned_to: { select: { id: true, name: true, email: true } },
      },
    }),
    user.company_id
      ? db.workOrder.findMany({
          where: {
            company_id: user.company_id,
            ...workOrderActive,
            ...propertyRelation,
            ...selectedWhere,
            OR: [
              { created_at: { gte: previousStart, lte: now } },
              { completed_at: { gte: previousStart, lte: now } },
              { status: { in: [...workOrderActiveStatuses] } },
            ],
          },
          orderBy: { created_at: "desc" },
          take: 1500,
          select: {
            id: true,
            status: true,
            priority: true,
            work_type: true,
            created_at: true,
            completed_at: true,
            scheduled_start: true,
            sla_resolution_due_at: true,
            actual_cost: true,
            property_id: true,
            property: { select: { id: true, name: true } },
            assigned_to: { select: { id: true, name: true, email: true } },
          },
        })
      : Promise.resolve([]),
    user.company_id
      ? db.lease.findMany({
          where: {
            company_id: user.company_id,
            ...leaseActive,
            ...propertyRelation,
            ...selectedWhere,
            status: { in: leaseOccupyingStatuses },
          },
          orderBy: { updated_at: "desc" },
          take: 1500,
          select: { id: true, property_id: true, unit_id: true, status: true, monthly_rent: true },
        })
      : Promise.resolve([]),
    user.company_id
      ? db.rentNotice.findMany({
          where: {
            company_id: user.company_id,
            ...propertyRelation,
            ...selectedWhere,
            OR: [
              { due_date: { gte: previousStart, lte: now } },
              { status: "overdue" },
            ],
          },
          orderBy: { due_date: "desc" },
          take: 1500,
          select: { id: true, property_id: true, due_date: true, status: true, total: true },
        })
      : Promise.resolve([]),
    user.company_id
      ? db.budgetEntry.findMany({
          where: {
            company_id: user.company_id,
            ...propertyRelation,
            ...selectedWhere,
            year: currentYear,
          },
          orderBy: { created_at: "desc" },
          take: 1200,
          select: { id: true, property_id: true, category: true, account: true, budget: true, actual: true },
        })
      : Promise.resolve([]),
    db.auditLog.findMany({
      where: { ...auditScopedWhere(user), created_at: { gte: currentStart, lte: now } },
      orderBy: { created_at: "desc" },
      take: 600,
      select: { action: true, created_at: true },
    }),
  ]);

  const isCurrent = (value: Date | null | undefined) => Boolean(value && value >= currentStart && value <= now);
  const isPrevious = (value: Date | null | undefined) => Boolean(value && value >= previousStart && value < previousEnd);

  const currentTickets = tickets.filter((ticket) => isCurrent(ticket.created_at));
  const previousTickets = tickets.filter((ticket) => isPrevious(ticket.created_at));
  const openTickets = tickets.filter((ticket) => ticketOpenStatuses.has(ticket.status));
  const urgentOpenTickets = openTickets.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "critical");
  const closedCurrentTickets = tickets.filter((ticket) => isCurrent(ticket.closed_at));
  const resolutionTimes = closedCurrentTickets
    .filter((ticket) => ticket.closed_at)
    .map((ticket) => ticket.closed_at!.getTime() - ticket.created_at.getTime())
    .filter((value) => value > 0);
  const averageResolution = resolutionTimes.length ? resolutionTimes.reduce((sum, value) => sum + value, 0) / resolutionTimes.length : 0;

  const completedCurrentOrders = workOrders.filter((order) => workOrderCompletedStatuses.has(order.status) && isCurrent(order.completed_at));
  const completedPreviousOrders = workOrders.filter((order) => workOrderCompletedStatuses.has(order.status) && isPrevious(order.completed_at));
  const activeOrders = workOrders.filter((order) => workOrderActiveStatuses.has(order.status));
  const configuredSlaCompleted = completedCurrentOrders.filter((order) => order.sla_resolution_due_at && order.completed_at);
  const slaOnTime = configuredSlaCompleted.filter((order) => order.completed_at! <= order.sla_resolution_due_at!).length;
  const slaRate = configuredSlaCompleted.length ? percent(slaOnTime, configuredSlaCompleted.length) : null;
  const overdueSlaOrders = activeOrders.filter((order) => order.sla_resolution_due_at && order.sla_resolution_due_at < now).length;

  const occupiedUnits = new Set(leases.map((lease) => lease.unit_id));
  const totalUnits = reportProperties.reduce((sum, property) => sum + property._count.units, 0);
  const occupancyRate = totalUnits ? percent(occupiedUnits.size, totalUnits) : 0;
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits.size);
  const noticeLeases = leases.filter((lease) => lease.status === "notice").length;
  const contractedAnnualRent = leases.reduce((sum, lease) => sum + Number(lease.monthly_rent) * 12, 0);

  const paidCurrentNotices = rentNotices.filter((notice) => notice.status === "paid" && isCurrent(notice.due_date));
  const paidPreviousNotices = rentNotices.filter((notice) => notice.status === "paid" && isPrevious(notice.due_date));
  const currentRentIncome = paidCurrentNotices.reduce((sum, notice) => sum + Number(notice.total), 0);
  const previousRentIncome = paidPreviousNotices.reduce((sum, notice) => sum + Number(notice.total), 0);
  const overdueNotices = rentNotices.filter((notice) => notice.status === "overdue");
  const overdueAmount = overdueNotices.reduce((sum, notice) => sum + Number(notice.total), 0);

  const budgetIncome = budgetEntries.filter((entry) => entry.category === "income").reduce((sum, entry) => sum + Number(entry.budget), 0);
  const actualIncome = budgetEntries.filter((entry) => entry.category === "income").reduce((sum, entry) => sum + Number(entry.actual), 0);
  const budgetCosts = budgetEntries.filter((entry) => expenseCategories.has(entry.category)).reduce((sum, entry) => sum + Math.abs(Number(entry.budget)), 0);
  const actualCosts = budgetEntries.filter((entry) => expenseCategories.has(entry.category)).reduce((sum, entry) => sum + Math.abs(Number(entry.actual)), 0);
  const registeredNet = actualIncome - actualCosts;
  const budgetNet = budgetIncome - budgetCosts;
  const budgetUtilization = budgetCosts ? Math.round((actualCosts / budgetCosts) * 100) : null;

  const trendBuckets = buildBuckets(currentStart, now);
  for (const ticket of currentTickets) {
    const bucket = trendBuckets.find((item) => ticket.created_at >= item.start && ticket.created_at < item.end);
    if (bucket) bucket.tickets += 1;
  }
  for (const order of completedCurrentOrders) {
    if (!order.completed_at) continue;
    const bucket = trendBuckets.find((item) => order.completed_at! >= item.start && order.completed_at! < item.end);
    if (bucket) bucket.completedOrders += 1;
  }
  const trendMax = Math.max(1, ...trendBuckets.flatMap((bucket) => [bucket.tickets, bucket.completedOrders]));

  const categories = new Map<string, number>();
  for (const ticket of currentTickets) categories.set(ticket.category, (categories.get(ticket.category) || 0) + 1);
  const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCategory = Math.max(1, ...categoryRows.map(([, value]) => value));

  const occupiedByProperty = new Map<string, Set<string>>();
  for (const lease of leases) {
    const set = occupiedByProperty.get(lease.property_id) || new Set<string>();
    set.add(lease.unit_id);
    occupiedByProperty.set(lease.property_id, set);
  }
  const openTicketsByProperty = new Map<string, number>();
  for (const ticket of openTickets) {
    if (!ticket.property?.id) continue;
    openTicketsByProperty.set(ticket.property.id, (openTicketsByProperty.get(ticket.property.id) || 0) + 1);
  }
  const activeOrdersByProperty = new Map<string, number>();
  for (const order of activeOrders) activeOrdersByProperty.set(order.property_id, (activeOrdersByProperty.get(order.property_id) || 0) + 1);
  const incomeByProperty = new Map<string, number>();
  for (const notice of paidCurrentNotices) incomeByProperty.set(notice.property_id, (incomeByProperty.get(notice.property_id) || 0) + Number(notice.total));
  const costByProperty = new Map<string, number>();
  for (const entry of budgetEntries.filter((item) => expenseCategories.has(item.category))) {
    costByProperty.set(entry.property_id, (costByProperty.get(entry.property_id) || 0) + Math.abs(Number(entry.actual)));
  }

  const propertyRows = reportProperties.map((property) => {
    const occupied = occupiedByProperty.get(property.id)?.size || 0;
    const units = property._count.units;
    return {
      ...property,
      occupied,
      occupancy: units ? percent(occupied, units) : 0,
      openTickets: openTicketsByProperty.get(property.id) || 0,
      activeOrders: activeOrdersByProperty.get(property.id) || 0,
      rentIncome: incomeByProperty.get(property.id) || 0,
      costActual: costByProperty.get(property.id) || 0,
    };
  }).sort((a, b) => (b.openTickets + b.activeOrders) - (a.openTickets + a.activeOrders) || a.name.localeCompare(b.name, "sv"));

  const exportRows: ReportExportRow[] = propertyRows.map((property) => ({
    fastighet: property.name,
    stad: property.city,
    objekt: property._count.units,
    uthyrningsgrad: `${property.occupancy} %`,
    oppna_arenden: property.openTickets,
    aktiva_arbetsorder: property.activeOrders,
    hyresintakter: compactMoney(property.rentIncome),
    kostnadsutfall: compactMoney(property.costActual),
  }));

  const maintenanceEvents = recentAudit.filter((item) => item.action.includes("maintenance")).length;
  const inspectionEvents = recentAudit.filter((item) => item.action.includes("inspection") || item.action.includes("round")).length;
  const documentEvents = recentAudit.filter((item) => item.action.includes("document")).length;
  const portfolioArea = reportProperties.reduce((sum, property) => sum + Number(property.total_area || property.boa || 0) + Number(property.loa || 0), 0);
  const buildingCount = reportProperties.reduce((sum, property) => sum + property._count.buildings, 0);

  const periodLabel = period === "30" ? "30 dagar" : period === "90" ? "90 dagar" : "12 månader";
  const dateLabel = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });
  const updatedLabel = new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short" }).format(now);

  return (
    <div className="space-y-5 pb-4">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Analys & beslutsstöd / Rapporter</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Rapporter</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-500">
            Samlad uppföljning av drift, arbetsorder, uthyrning och ekonomi med verklig data från organisationens bestånd.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-ink-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />Live-data · uppdaterad {updatedLabel}
        </div>
      </header>

      <ReportsToolbar
        period={period}
        propertyId={selectedPropertyId}
        properties={properties.map((property) => ({ id: property.id, name: property.name }))}
        rows={exportRows}
        generatedAt={now.toISOString()}
      />

      <nav className="print:hidden grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Rapportgenvägar">
        {[
          ["Drift & ärenden", "Följ prioritet, status och åtgärdstider", "/dashboard/felanmalan"],
          ["Arbetsorder", "Planering, SLA och genomförande", "/dashboard/arbetsorder"],
          ["Uthyrning", "Vakans, avtal och hyresparter", "/dashboard/uthyrning"],
          ["Ekonomi", "Budget, utfall och hyresintäkter", "/dashboard/ekonomi"],
        ].map(([title, description, href]) => (
          <Link key={title} href={href} className="group flex items-center justify-between rounded-2xl border border-sand-200 bg-[#FCFBF8] px-4 py-3 transition hover:border-petroleum-200 hover:bg-white">
            <div><p className="text-xs font-semibold text-ink-800">{title}</p><p className="mt-0.5 text-[10px] text-ink-500">{description}</p></div>
            <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" />
          </Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Building2} label="Uthyrningsgrad" value={`${occupancyRate} %`} detail={`${vacantUnits} lediga av ${totalUnits} objekt`} href="/dashboard/uthyrning" alert={vacantUnits > 0 && occupancyRate < 90} />
        <Metric icon={FileText} label="Öppna ärenden" value={openTickets.length} detail={`${currentTickets.length} nya · ${comparisonLabel(currentTickets.length, previousTickets.length)}`} href="/dashboard/felanmalan" alert={urgentOpenTickets.length > 0} />
        <Metric icon={CheckCircle2} label="Slutförda arbetsorder" value={completedCurrentOrders.length} detail={comparisonLabel(completedCurrentOrders.length, completedPreviousOrders.length)} href="/dashboard/arbetsorder" />
        <Metric icon={Gauge} label="SLA i tid" value={slaRate === null ? "—" : `${slaRate} %`} detail={slaRate === null ? "Ingen slutförd arbetsorder med SLA i perioden" : `${configuredSlaCompleted.length} mätbara · ${overdueSlaOrders} aktiva försenade`} href="/dashboard/arbetsorder" alert={overdueSlaOrders > 0} />
        <Metric icon={CircleDollarSign} label="Hyresintäkter" value={compactMoney(currentRentIncome)} detail={comparisonLabel(currentRentIncome, previousRentIncome)} href="/dashboard/ekonomi" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Operativ utveckling</p>
              <h2 className="mt-1 font-display text-[19px] font-semibold text-ink-950">Ärenden och slutförda arbetsorder</h2>
            </div>
            <p className="text-[10px] text-ink-500">{dateLabel.format(currentStart)} – {dateLabel.format(now)}</p>
          </div>
          <div className="mt-4 flex gap-4 text-[10px] text-ink-500"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-petroleum-800" />Nya ärenden</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sand-500" />Slutförda arbetsorder</span></div>
          <div className="mt-6 grid min-h-52 grid-cols-6 items-end gap-2 border-b border-sand-200 pb-3 sm:gap-4">
            {trendBuckets.map((bucket) => (
              <div key={bucket.start.toISOString()} className="flex h-full flex-col justify-end">
                <div className="mb-2 flex min-h-6 items-end justify-center gap-1.5">
                  <span className="text-[9px] font-semibold text-petroleum-800">{bucket.tickets || ""}</span>
                  <span className="text-[9px] font-semibold text-ink-500">{bucket.completedOrders || ""}</span>
                </div>
                <div className="flex h-32 items-end justify-center gap-1.5">
                  <div className="w-[42%] max-w-7 rounded-t-lg bg-petroleum-800" style={{ height: `${Math.max(bucket.tickets ? 8 : 2, (bucket.tickets / trendMax) * 100)}%` }} />
                  <div className="w-[42%] max-w-7 rounded-t-lg bg-sand-500" style={{ height: `${Math.max(bucket.completedOrders ? 8 : 2, (bucket.completedOrders / trendMax) * 100)}%` }} />
                </div>
                <p className="mt-2 truncate text-center text-[9px] capitalize text-ink-400">{bucket.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#FCFBF8] px-3.5 py-3"><p className="text-[10px] text-ink-500">Genomsnittlig åtgärdstid</p><p className="mt-1 text-sm font-semibold text-ink-900">{formatDays(averageResolution)}</p></div>
            <div className="rounded-xl bg-[#FCFBF8] px-3.5 py-3"><p className="text-[10px] text-ink-500">Aktiva arbetsorder</p><p className="mt-1 text-sm font-semibold text-ink-900">{activeOrders.length}</p></div>
            <div className="rounded-xl bg-[#FCFBF8] px-3.5 py-3"><p className="text-[10px] text-ink-500">Akuta öppna ärenden</p><p className={`mt-1 text-sm font-semibold ${urgentOpenTickets.length ? "text-red-700" : "text-ink-900"}`}>{urgentOpenTickets.length}</p></div>
          </div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Periodjämförelse</p>
          <h2 className="mt-1 font-display text-[19px] font-semibold text-ink-950">Nu mot föregående {periodLabel}</h2>
          <div className="mt-5 divide-y divide-sand-100">
            {[
              ["Nya ärenden", currentTickets.length.toLocaleString("sv-SE"), previousTickets.length.toLocaleString("sv-SE"), comparisonLabel(currentTickets.length, previousTickets.length)],
              ["Slutförda arbetsorder", completedCurrentOrders.length.toLocaleString("sv-SE"), completedPreviousOrders.length.toLocaleString("sv-SE"), comparisonLabel(completedCurrentOrders.length, completedPreviousOrders.length)],
              ["Hyresintäkter", compactMoney(currentRentIncome), compactMoney(previousRentIncome), comparisonLabel(currentRentIncome, previousRentIncome)],
            ].map(([label, current, previous, delta]) => (
              <div key={label} className="py-4">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-ink-800">{label}</p><p className="text-sm font-semibold text-ink-950">{current}</p></div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-ink-500"><span>Föregående: {previous}</span><span>{delta}</span></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex flex-col gap-2 border-b border-sand-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Beståndsprestanda</p><h2 className="mt-1 font-display text-[19px] font-semibold text-ink-950">Fastigheter i fokus</h2></div>
            <p className="text-[10px] text-ink-500">{selectedProperty ? `Filtrerat på ${selectedProperty.name}` : `${propertyRows.length} fastigheter`}</p>
          </div>
          {propertyRows.length === 0 ? <p className="p-6 text-sm text-ink-500">Inga fastigheter att rapportera ännu.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-left">
                <thead className="bg-[#FCFBF8] text-[9px] uppercase tracking-[0.08em] text-ink-400"><tr><th className="px-5 py-3 font-semibold">Fastighet</th><th className="px-3 py-3 font-semibold">Uthyrning</th><th className="px-3 py-3 font-semibold">Ärenden</th><th className="px-3 py-3 font-semibold">Arbetsorder</th><th className="px-3 py-3 font-semibold">Hyresintäkt</th><th className="px-3 py-3 font-semibold">Kostnadsutfall</th><th className="px-5 py-3"><span className="sr-only">Öppna</span></th></tr></thead>
                <tbody className="divide-y divide-sand-100">
                  {propertyRows.map((property) => (
                    <tr key={property.id} className="transition hover:bg-sand-50/60">
                      <td className="px-5 py-4"><p className="text-xs font-semibold text-ink-900">{property.name}</p><p className="mt-0.5 text-[10px] text-ink-500">{property.city} · {property._count.units} objekt</p></td>
                      <td className="px-3 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-700" style={{ width: `${property.occupancy}%` }} /></div><span className="text-[11px] font-semibold text-ink-700">{property.occupancy} %</span></div></td>
                      <td className="px-3 py-4 text-xs font-semibold text-ink-800">{property.openTickets}</td>
                      <td className="px-3 py-4 text-xs font-semibold text-ink-800">{property.activeOrders}</td>
                      <td className="px-3 py-4 text-xs font-semibold text-ink-800">{compactMoney(property.rentIncome)}</td>
                      <td className="px-3 py-4 text-xs font-semibold text-ink-800">{compactMoney(property.costActual)}</td>
                      <td className="px-5 py-4 text-right"><Link href={`/dashboard/fastigheter/${property.id}`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Öppna <ArrowRight className="h-3 w-3" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Behöver uppmärksamhet</p>
          <h2 className="mt-1 font-display text-[19px] font-semibold text-ink-950">Operativa signaler</h2>
          <div className="mt-5 space-y-2.5">
            <Link href="/dashboard/felanmalan" className="flex items-center justify-between rounded-xl border border-sand-100 bg-[#FCFBF8] px-3.5 py-3 transition hover:border-red-100 hover:bg-red-50/40"><span className="inline-flex items-center gap-2 text-xs font-medium text-ink-700"><AlertTriangle className="h-4 w-4 text-red-600" />Akuta öppna ärenden</span><span className="text-sm font-semibold text-ink-950">{urgentOpenTickets.length}</span></Link>
            <Link href="/dashboard/arbetsorder" className="flex items-center justify-between rounded-xl border border-sand-100 bg-[#FCFBF8] px-3.5 py-3 transition hover:border-amber-100 hover:bg-amber-50/40"><span className="inline-flex items-center gap-2 text-xs font-medium text-ink-700"><Clock3 className="h-4 w-4 text-amber-700" />SLA försenade</span><span className="text-sm font-semibold text-ink-950">{overdueSlaOrders}</span></Link>
            <Link href="/dashboard/uthyrning" className="flex items-center justify-between rounded-xl border border-sand-100 bg-[#FCFBF8] px-3.5 py-3 transition hover:border-petroleum-100 hover:bg-petroleum-50/40"><span className="inline-flex items-center gap-2 text-xs font-medium text-ink-700"><DoorOpen className="h-4 w-4 text-petroleum-700" />Lediga objekt</span><span className="text-sm font-semibold text-ink-950">{vacantUnits}</span></Link>
            <Link href="/dashboard/hyresavisering" className="flex items-center justify-between rounded-xl border border-sand-100 bg-[#FCFBF8] px-3.5 py-3 transition hover:border-amber-100 hover:bg-amber-50/40"><span className="inline-flex items-center gap-2 text-xs font-medium text-ink-700"><CircleDollarSign className="h-4 w-4 text-amber-700" />Förfallna aviseringar</span><span className="text-sm font-semibold text-ink-950">{compactMoney(overdueAmount)}</span></Link>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Ärendebild</p>
          <h2 className="mt-1 font-display text-[18px] font-semibold text-ink-950">Vanligaste kategorier</h2>
          <div className="mt-5 space-y-4">
            {categoryRows.length === 0 ? <p className="text-sm text-ink-500">Inga nya ärenden i vald period.</p> : categoryRows.map(([category, value]) => (
              <div key={category}>
                <div className="mb-1.5 flex items-center justify-between gap-3"><p className="text-xs font-medium capitalize text-ink-700">{category.replaceAll("_", " ")}</p><p className="text-xs font-semibold text-ink-900">{value}</p></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-700" style={{ width: `${Math.max(4, (value / maxCategory) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Ekonomi</p><h2 className="mt-1 font-display text-[18px] font-semibold text-ink-950">Årets registrerade utfall</h2></div><Link href="/dashboard/budget" className="print:hidden text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Budget</Link></div>
          <div className="mt-5 divide-y divide-sand-100">
            <div className="flex items-center justify-between py-3"><div><p className="text-xs font-medium text-ink-700">Intäktsutfall</p><p className="text-[10px] text-ink-500">Budget {compactMoney(budgetIncome)}</p></div><p className="text-sm font-semibold text-ink-950">{compactMoney(actualIncome)}</p></div>
            <div className="flex items-center justify-between py-3"><div><p className="text-xs font-medium text-ink-700">Kostnadsutfall</p><p className="text-[10px] text-ink-500">Budget {compactMoney(budgetCosts)}</p></div><p className="text-sm font-semibold text-ink-950">{compactMoney(actualCosts)}</p></div>
            <div className="flex items-center justify-between py-3"><div><p className="text-xs font-medium text-ink-700">Registrerat driftnetto</p><p className="text-[10px] text-ink-500">Budgeterat netto {compactMoney(budgetNet)}</p></div><p className={`text-sm font-semibold ${registeredNet < 0 ? "text-red-700" : "text-ink-950"}`}>{compactMoney(registeredNet)}</p></div>
            <div className="flex items-center justify-between py-3"><p className="text-xs font-medium text-ink-700">Budgetutnyttjande kostnader</p><p className="text-sm font-semibold text-ink-950">{budgetUtilization === null ? "—" : `${budgetUtilization} %`}</p></div>
          </div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Förvaltningsaktivitet</p>
          <h2 className="mt-1 font-display text-[18px] font-semibold text-ink-950">Registrerat i vald period</h2>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {[
              ["Underhåll", maintenanceEvents, Wrench],
              ["Ronder", inspectionEvents, Gauge],
              ["Dokument", documentEvents, FileText],
              ["Alla aktiviteter", recentAudit.length, Clock3],
            ].map(([label, value, Icon]) => {
              const ActivityIcon = Icon as LucideIcon;
              return <div key={String(label)} className="rounded-xl border border-sand-100 bg-[#FCFBF8] p-3"><ActivityIcon className="h-4 w-4 text-petroleum-700" /><p className="mt-3 text-lg font-semibold text-ink-950">{String(value)}</p><p className="mt-0.5 text-[10px] text-ink-500">{String(label)}</p></div>;
            })}
          </div>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-sand-200 bg-[#F4F2EC] p-4"><p className="text-[10px] text-ink-500">Samlad registrerad area</p><p className="mt-1.5 text-lg font-semibold text-ink-950">{Math.round(portfolioArea).toLocaleString("sv-SE")} m²</p></div>
        <div className="rounded-2xl border border-sand-200 bg-[#F4F2EC] p-4"><p className="text-[10px] text-ink-500">Byggnader i urvalet</p><p className="mt-1.5 text-lg font-semibold text-ink-950">{buildingCount}</p></div>
        <div className="rounded-2xl border border-sand-200 bg-[#F4F2EC] p-4"><p className="text-[10px] text-ink-500">Kontrakterad årshyra</p><p className="mt-1.5 text-lg font-semibold text-ink-950">{compactMoney(contractedAnnualRent)}</p></div>
        <div className="rounded-2xl border border-sand-200 bg-[#F4F2EC] p-4"><p className="text-[10px] text-ink-500">Uppsagda avtal</p><p className="mt-1.5 text-lg font-semibold text-ink-950">{noticeLeases}</p></div>
      </section>
    </div>
  );
}
