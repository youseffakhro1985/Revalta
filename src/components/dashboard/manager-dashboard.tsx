import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, Building2, CalendarDays, ClipboardList, UserRoundX, Wrench } from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";
import { isMissingTableError } from "@/lib/schema-readiness";
import { DashboardSlaOperations } from "@/components/dashboard/dashboard-sla-operations";
import { OverviewEmpty, OverviewHero, OverviewMetricLink, OverviewPanel } from "@/components/dashboard/overview-chrome";

const date = new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short" });

async function optionalFindMany<T>(table: string, query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error, table)) return [];
    throw error;
  }
}

export async function ManagerDashboard({ user }: { user: CurrentUser }) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 30 * 86400000);
  const activeWorkStatuses = { notIn: ["completed", "invoiced", "cancelled"] };
  const propertyScope = { deleted_at: null, ...tenantWhere(user) };

  const [totalProperties, properties, unassignedTickets, unassignedWorkOrders, overdueWorkOrders, upcomingActivities, upcomingRounds, upcomingInspections, activeVendors, expiringVendors, ticketQueue] = await Promise.all([
    db.property.count({ where: propertyScope }),
    db.property.findMany({
      where: propertyScope,
      orderBy: { name: "asc" },
      take: 6,
      select: {
        id: true,
        name: true,
        city: true,
        _count: { select: { tickets: { where: { deleted_at: null, status: { not: "closed" } } } } },
      },
    }),
    db.ticket.count({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { not: "closed" },
        assigned_to_id: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }),
    user.company_id
      ? db.workOrder.count({
          where: {
            company_id: user.company_id,
            deleted_at: null,
            assigned_to_id: null,
            property: { deleted_at: null },
            status: activeWorkStatuses,
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
      ? db.calendarEvent.findMany({
          where: { company_id: user.company_id, status: "planned", date: { gte: today, lte: horizon } },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 6,
          select: { id: true, title: true, date: true, time: true, type: true, property_name: true, responsible: true },
        })
      : Promise.resolve([]),
    user.company_id
      ? optionalFindMany("InspectionRound", () => db.inspectionRound.findMany({
          where: {
            company_id: user.company_id,
            status: { not: "completed" },
            next_due: { gte: today, lte: horizon },
            property: { deleted_at: null },
          },
          orderBy: { next_due: "asc" },
          take: 6,
          select: { id: true, title: true, next_due: true, property: { select: { name: true } } },
        }))
      : Promise.resolve([]),
    user.company_id
      ? optionalFindMany("ComplianceInspection", () => db.complianceInspection.findMany({
          where: {
            company_id: user.company_id,
            status: { notIn: ["completed", "cancelled"] },
            due_date: { gte: today, lte: horizon },
            property: { deleted_at: null },
          },
          orderBy: { due_date: "asc" },
          take: 6,
          select: { id: true, title: true, type: true, due_date: true, responsible: true, property: { select: { name: true } } },
        }))
      : Promise.resolve([]),
    user.company_id
      ? db.vendorContract.count({
          where: { company_id: user.company_id, status: "active", OR: [{ property_id: null }, { property: { deleted_at: null } }] },
        })
      : Promise.resolve(0),
    user.company_id
      ? db.vendorContract.count({
          where: {
            company_id: user.company_id,
            status: "active",
            end_date: { gte: now, lte: new Date(now.getTime() + 120 * 86400000) },
            OR: [{ property_id: null }, { property: { deleted_at: null } }],
          },
        })
      : Promise.resolve(0),
    db.ticket.findMany({
      where: {
        deleted_at: null,
        ...tenantWhere(user),
        status: { not: "closed" },
        assigned_to_id: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      orderBy: [{ priority: "desc" }, { created_at: "asc" }],
      take: 6,
      select: { id: true, title: true, priority: true, public_reference: true, property: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <OverviewHero
        eyebrow="Förvaltarvy"
        title="Dagens förvaltning"
        description="Fastigheter, otilldelade ärenden och arbetsordrar, försenade AO och kommande ronder i en operativ vy."
        userName={user.name}
        userEmail={user.email}
        role={user.role}
        companyName={user.company?.name}
        statusLabel={unassignedTickets || unassignedWorkOrders || overdueWorkOrders ? "Kräver åtgärd" : "Stabilt läge"}
        statusTone={unassignedTickets || unassignedWorkOrders || overdueWorkOrders ? "attention" : "good"}
        actions={[
          { href: "/dashboard/arbetsorder/planering", label: "Öppna planering", primary: true },
          { href: "/dashboard/felanmalan", label: "Ärenden" },
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Nyckeltal">
        <OverviewMetricLink href="/dashboard/fastigheter" icon={Building2} label="Fastigheter i arbetsytan" value={totalProperties} hint="Tenant-scopat bestånd" />
        <OverviewMetricLink href="/dashboard/felanmalan" icon={ClipboardList} label="Otilldelade ärenden" value={unassignedTickets} hint="Behöver ansvarig" tone={unassignedTickets ? "warning" : "default"} />
        <OverviewMetricLink href="/dashboard/arbetsorder/planering" icon={UserRoundX} label="Otilldelade arbetsordrar" value={unassignedWorkOrders} hint="Aktiva AO utan tekniker" tone={unassignedWorkOrders ? "warning" : "default"} />
        <OverviewMetricLink href="/dashboard/arbetsorder" icon={Wrench} label="Försenade arbetsordrar" value={overdueWorkOrders} hint="Aktiva AO efter deadline" tone={overdueWorkOrders ? "warning" : "default"} />
        <OverviewMetricLink href="/dashboard/leverantorer" icon={BriefcaseBusiness} label="Aktiva leverantörer" value={activeVendors} hint={`${expiringVendors} avtal löper inom 120 dagar`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <OverviewPanel title="Fastigheter i fokus" description="Snabbväg till bestånd och aktuella ärenden." bodyClassName="p-0">
          {properties.length ? <div className="divide-y divide-sand-100">{properties.map((property) => (
            <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-sand-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{property.name}</p><p className="mt-1 text-xs text-ink-500">{property.city}</p></div>
              <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{property._count.tickets} öppna</span>
            </Link>
          ))}</div> : <OverviewEmpty icon={Building2} title="Ingen fastighet ännu" description="När fastigheter registreras visas de här som en snabbväg in i beståndet." />}
        </OverviewPanel>

        <OverviewPanel title="Otilldelade ärenden" description="Äldsta och viktigaste ärenden som fortfarande saknar ansvarig." bodyClassName="p-0">
          {ticketQueue.length ? <div className="divide-y divide-sand-100">{ticketQueue.map((ticket) => (
            <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-sand-50/70">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-ink-900">{ticket.title}</p>{ticket.priority === "urgent" ? <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700">Akut</span> : null}</div><p className="mt-1 text-xs text-ink-500">{ticket.public_reference || "Ärende"} · {ticket.property?.name || "Ingen fastighet"}</p></div>
              <AlertTriangle className="h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />
            </Link>
          ))}</div> : <OverviewEmpty icon={ClipboardList} title="Inga otilldelade ärenden" description="Kön är tom — alla öppna ärenden har en ansvarig." />}
        </OverviewPanel>
      </section>

      <DashboardSlaOperations />

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <OverviewPanel title="Kommande aktiviteter" description="Kalender, ronder och besiktningar från idag och 30 dagar framåt." bodyClassName="p-0">
          {(() => {
            const upcoming = [
              ...upcomingActivities.map((event) => ({
                id: event.id,
                title: event.title,
                date: event.date,
                time: event.time,
                type: event.type,
                property_name: event.property_name,
                responsible: event.responsible,
                href: "/dashboard/kalender",
              })),
              ...upcomingRounds.map((round) => ({
                id: `round:${round.id}`,
                title: round.title,
                date: round.next_due,
                time: null as string | null,
                type: "Rond",
                property_name: round.property.name,
                responsible: null as string | null,
                href: "/dashboard/ronder",
              })),
              ...upcomingInspections.map((inspection) => ({
                id: `inspection:${inspection.id}`,
                title: inspection.title,
                date: inspection.due_date,
                time: null as string | null,
                type: "Besiktning",
                property_name: inspection.property.name,
                responsible: inspection.responsible,
                href: "/dashboard/besiktningar",
              })),
            ].sort((left, right) => left.date.getTime() - right.date.getTime() || String(left.time || "").localeCompare(String(right.time || ""))).slice(0, 6);

            return upcoming.length ? <div className="divide-y divide-sand-100">{upcoming.map((event) => (
              <Link key={event.id} href={event.href} className="grid gap-3 px-5 py-4 transition hover:bg-sand-50/70 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
                <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-petroleum-700">{date.format(event.date)}</p><p className="mt-1 text-xs text-ink-500">{event.time || "Heldag"}</p></div>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{event.title}</p><p className="mt-1 truncate text-xs text-ink-500">{[event.type, event.property_name, event.responsible].filter(Boolean).join(" · ")}</p></div>
              </Link>
            ))}</div> : <OverviewEmpty icon={CalendarDays} title="Inga planerade aktiviteter" description="Kalendern, ronder och besiktningar är tomma de närmaste 30 dagarna." />;
          })()}
          <div className="border-t border-sand-100 p-4"><Link href="/dashboard/kalender" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700">Öppna kalender <CalendarDays className="h-4 w-4" /></Link></div>
        </OverviewPanel>

        <OverviewPanel title="Leverantörsläge" description="Aktiva avtal och avtal som närmar sig slutdatum.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-2xl border border-sand-200 bg-sand-50 p-5"><p className="text-sm font-medium text-ink-500">Aktiva leverantörer</p><p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-950">{activeVendors}</p></div>
            <div className="rounded-2xl border border-sand-200 bg-sand-50 p-5"><p className="text-sm font-medium text-ink-500">Avtal inom 120 dagar</p><p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-950">{expiringVendors}</p></div>
          </div>
          <Link href="/dashboard/leverantorer" className="mt-5 inline-flex text-sm font-semibold text-petroleum-700">Öppna leverantörer →</Link>
        </OverviewPanel>
      </section>
    </div>
  );
}
