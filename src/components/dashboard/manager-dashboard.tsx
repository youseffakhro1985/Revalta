import Link from "next/link";
import { AlertTriangle, BriefcaseBusiness, Building2, CalendarDays, ClipboardList, Wrench } from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";
import { DashboardSlaOperations } from "@/components/dashboard/dashboard-sla-operations";
import { MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";

const date = new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short" });

export async function ManagerDashboard({ user }: { user: CurrentUser }) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 30 * 86400000);
  const activeWorkStatuses = { notIn: ["completed", "invoiced", "cancelled"] };

  const [properties, unassignedTickets, overdueWorkOrders, upcomingActivities, activeVendors, expiringVendors, ticketQueue] = await Promise.all([
    db.property.findMany({
      where: { deleted_at: null, ...tenantWhere(user) },
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Förvaltarvy"
        title="Dagens förvaltning"
        description="Mina fastigheter, otilldelade ärenden, försenade arbetsordrar, kommande aktiviteter och leverantörsläge i en operativ arbetsyta."
        action={<Link href="/dashboard/arbetsorder/planering" className="inline-flex h-11 items-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800">Öppna planering</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Building2} label="Mina fastigheter" value={properties.length} hint="Fastigheter inom din organisation" />
        <MetricCard icon={ClipboardList} label="Otilldelade ärenden" value={unassignedTickets} hint="Behöver ansvarig" />
        <MetricCard icon={Wrench} label="Försenade arbetsordrar" value={overdueWorkOrders} hint="Aktiva AO efter deadline" />
        <MetricCard icon={BriefcaseBusiness} label="Aktiva leverantörer" value={activeVendors} hint={`${expiringVendors} avtal löper inom 120 dagar`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Mina fastigheter" description="Snabbväg till bestånd och aktuella ärenden." bodyClassName="p-0">
          {properties.length ? <div className="divide-y divide-sand-100">{properties.map((property) => (
            <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-sand-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{property.name}</p><p className="mt-1 text-xs text-ink-500">{property.city}</p></div>
              <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{property._count.tickets} öppna</span>
            </Link>
          ))}</div> : <p className="p-8 text-center text-sm text-ink-500">Ingen fastighet finns i organisationen ännu.</p>}
        </Panel>

        <Panel title="Otilldelade ärenden" description="Äldsta och viktigaste ärenden som fortfarande saknar ansvarig." bodyClassName="p-0">
          {ticketQueue.length ? <div className="divide-y divide-sand-100">{ticketQueue.map((ticket) => (
            <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-sand-50/70">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-ink-900">{ticket.title}</p>{ticket.priority === "urgent" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Akut</span> : null}</div><p className="mt-1 text-xs text-ink-500">{ticket.public_reference || "Ärende"} · {ticket.property?.name || "Ingen fastighet"}</p></div>
              <AlertTriangle className="h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />
            </Link>
          ))}</div> : <p className="p-8 text-center text-sm text-ink-500">Inga otilldelade ärenden.</p>}
        </Panel>
      </section>

      <DashboardSlaOperations />

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Kommande aktiviteter" description="Planerade aktiviteter från idag och 30 dagar framåt." bodyClassName="p-0">
          {upcomingActivities.length ? <div className="divide-y divide-sand-100">{upcomingActivities.map((event) => (
            <div key={event.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
              <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-petroleum-700">{date.format(event.date)}</p><p className="mt-1 text-xs text-ink-500">{event.time || "Heldag"}</p></div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{event.title}</p><p className="mt-1 truncate text-xs text-ink-500">{[event.type, event.property_name, event.responsible].filter(Boolean).join(" · ")}</p></div>
            </div>
          ))}</div> : <p className="p-8 text-center text-sm text-ink-500">Inga planerade aktiviteter de närmaste 30 dagarna.</p>}
          <div className="border-t border-sand-100 p-4"><Link href="/dashboard/kalender" className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700">Öppna kalender <CalendarDays className="h-4 w-4" /></Link></div>
        </Panel>

        <Panel title="Leverantörsläge" description="Aktiva avtal och avtal som närmar sig slutdatum.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-2xl border border-sand-200 bg-sand-50 p-5"><p className="text-sm font-medium text-ink-500">Aktiva leverantörer</p><p className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">{activeVendors}</p></div>
            <div className="rounded-2xl border border-sand-200 bg-sand-50 p-5"><p className="text-sm font-medium text-ink-500">Avtal inom 120 dagar</p><p className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">{expiringVendors}</p></div>
          </div>
          <Link href="/dashboard/leverantorer" className="mt-5 inline-flex text-sm font-semibold text-petroleum-700">Öppna leverantörer →</Link>
        </Panel>
      </section>
    </div>
  );
}
