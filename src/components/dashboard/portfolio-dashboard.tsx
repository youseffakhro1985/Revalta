import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleDollarSign,
  DoorOpen,
  Gauge,
  Hammer,
  ShieldCheck,
} from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";
import { DashboardSlaOperations } from "@/components/dashboard/dashboard-sla-operations";
import { MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export async function PortfolioDashboard({ user }: { user: CurrentUser }) {
  const now = new Date();
  const year = now.getFullYear();
  const activeWorkStatuses = { notIn: ["completed", "invoiced", "cancelled"] };
  const propertyScope = { deleted_at: null, ...tenantWhere(user) };

  const [properties, openTickets, urgentTickets, unassignedTickets, totalUnits, leasedUnits, budget, maintenanceDue, overdueWorkOrders] = await Promise.all([
    db.property.findMany({
      where: propertyScope,
      orderBy: { name: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        city: true,
        _count: {
          select: {
            units: true,
            tickets: { where: { deleted_at: null, status: { not: "closed" } } },
          },
        },
      },
    }),
    db.ticket.count({ where: { deleted_at: null, ...tenantWhere(user), status: { not: "closed" }, OR: [{ property_id: null }, { property: { deleted_at: null } }] } }),
    db.ticket.count({ where: { deleted_at: null, ...tenantWhere(user), status: { not: "closed" }, priority: "urgent", OR: [{ property_id: null }, { property: { deleted_at: null } }] } }),
    db.ticket.count({ where: { deleted_at: null, ...tenantWhere(user), status: { not: "closed" }, assigned_to_id: null, OR: [{ property_id: null }, { property: { deleted_at: null } }] } }),
    db.unit.count({ where: { property: propertyScope } }),
    user.company_id
      ? db.lease.findMany({
          where: {
            company_id: user.company_id,
            deleted_at: null,
            status: { in: ["reserved", "active", "notice"] },
            property: { deleted_at: null },
          },
          distinct: ["unit_id"],
          select: { unit_id: true },
        })
      : Promise.resolve([]),
    user.company_id
      ? db.budgetEntry.aggregate({
          where: { company_id: user.company_id, year, property: { deleted_at: null } },
          _sum: { budget: true, forecast: true, actual: true },
        })
      : Promise.resolve({ _sum: { budget: null, forecast: null, actual: null } }),
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
  ]);

  const vacantUnits = Math.max(0, totalUnits - leasedUnits.length);
  const budgetTotal = Number(budget._sum.budget || 0);
  const actualTotal = Number(budget._sum.actual || 0);
  const criticalDeviations = urgentTickets + overdueWorkOrders;
  const stable = criticalDeviations === 0 && unassignedTickets === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Portföljstyrning"
        title="Portföljöversikt"
        description="Samlad ledningsbild för bestånd, kritiska avvikelser, ekonomi, SLA, underhåll och vakans."
        action={<Link href="/dashboard/rapporter" className="inline-flex h-11 items-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800">Öppna rapporter</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Building2} label="Fastigheter" value={properties.length} hint={`${totalUnits} registrerade objekt`} />
        <MetricCard icon={AlertTriangle} label="Kritiska avvikelser" value={criticalDeviations} hint={`${urgentTickets} akuta ärenden · ${overdueWorkOrders} försenade AO`} />
        <MetricCard icon={CircleDollarSign} label={`Budget ${year}`} value={money.format(budgetTotal)} hint={`Utfall ${money.format(actualTotal)}`} />
        <MetricCard icon={DoorOpen} label="Vakanta objekt" value={vacantUnits} hint={totalUnits ? `${Math.round((vacantUnits / totalUnits) * 100)} % av beståndet` : "Inga objekt registrerade"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Portföljhälsa" description="Prioriterad ledningsbild utan påhittat hälsotal — endast verkliga avvikelser och operativa signaler.">
          <div className="grid gap-3 sm:grid-cols-2">
            <HealthItem icon={ShieldCheck} label="Övergripande läge" value={stable ? "Stabilt" : "Kräver fokus"} detail={stable ? "Inga kritiska eller otilldelade avvikelser." : "Följ upp riskerna nedan."} />
            <HealthItem icon={AlertTriangle} label="Otilldelade ärenden" value={String(unassignedTickets)} detail={`${openTickets} öppna ärenden totalt`} />
            <HealthItem icon={Hammer} label="Underhåll till nästa år" value={String(maintenanceDue)} detail="Planerade, godkända eller pågående poster" />
            <HealthItem icon={Gauge} label="Vakans" value={`${vacantUnits} / ${totalUnits}`} detail="Objekt utan reserverat/aktivt/pågående uppsägningsavtal" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <SmallLink href="/dashboard/budget">Budget & prognos</SmallLink>
            <SmallLink href="/dashboard/underhall">Underhåll</SmallLink>
            <SmallLink href="/dashboard/skador">Skador & försäkring</SmallLink>
            <SmallLink href="/dashboard/hyresavisering">Hyresavisering</SmallLink>
          </div>
        </Panel>

        <Panel title="Bestånd i fokus" description="De första fastigheterna i den aktuella tenant-scopade portföljen." bodyClassName="p-0">
          {properties.length ? <div className="divide-y divide-sand-100">{properties.map((property) => (
            <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-sand-50/70">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{property.name}</p><p className="mt-1 text-xs text-ink-500">{property.city} · {property._count.units} objekt</p></div>
              <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{property._count.tickets} öppna</span>
            </Link>
          ))}</div> : <p className="p-8 text-center text-sm text-ink-500">Ingen fastighet registrerad ännu.</p>}
        </Panel>
      </section>

      <DashboardSlaOperations />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CalendarClock} label="Öppna ärenden" value={openTickets} />
        <MetricCard icon={AlertTriangle} label="Akuta ärenden" value={urgentTickets} />
        <MetricCard icon={Hammer} label="Underhållsbehov" value={maintenanceDue} />
        <MetricCard icon={Gauge} label="Försenade arbetsordrar" value={overdueWorkOrders} />
      </section>
    </div>
  );
}

function HealthItem({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-sand-200 bg-sand-50/70 p-4"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-petroleum-700" strokeWidth={1.7} /><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p></div><p className="mt-3 text-2xl font-semibold tracking-tight text-ink-950">{value}</p><p className="mt-1 text-xs leading-5 text-ink-500">{detail}</p></div>;
}

function SmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="rounded-lg border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-petroleum-700 transition hover:border-petroleum-200 hover:bg-petroleum-50">{children}</Link>;
}
