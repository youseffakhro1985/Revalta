import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardList,
  UserRoundX,
  Users,
} from "lucide-react";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { DashboardSlaOperations } from "@/components/dashboard/dashboard-sla-operations";

async function getDashboardData() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const scope = tenantWhere(user);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalTickets,
    openTickets,
    urgentTickets,
    unassignedTickets,
    overdueTickets,
    closedThisMonth,
    totalProperties,
    totalMembers,
    latestTickets,
    propertyWorkload,
  ] = await Promise.all([
    db.ticket.count({ where: scope }),
    db.ticket.count({ where: { ...scope, status: { not: "closed" } } }),
    db.ticket.count({ where: { ...scope, priority: "urgent", status: { not: "closed" } } }),
    db.ticket.count({ where: { ...scope, assigned_to_id: null, status: { not: "closed" } } }),
    db.ticket.count({ where: { ...scope, due_date: { lt: now }, status: { not: "closed" } } }),
    db.ticket.count({ where: { ...scope, closed_at: { gte: monthStart } } }),
    db.property.count({ where: { deleted_at: null, ...scope } }),
    db.user.count({ where: user.company_id ? { company_id: user.company_id } : { id: user.id } }),
    db.ticket.findMany({
      where: scope,
      orderBy: { created_at: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        created_at: true,
        property: { select: { name: true } },
      },
    }),
    db.property.findMany({
      where: { deleted_at: null, ...scope },
      orderBy: { created_at: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        city: true,
        _count: { select: { tickets: true } },
      },
    }),
  ]);

  return {
    user,
    totalTickets,
    openTickets,
    urgentTickets,
    unassignedTickets,
    overdueTickets,
    closedThisMonth,
    totalProperties,
    totalMembers,
    latestTickets,
    propertyWorkload,
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "Nytt",
    assigned: "Tilldelat",
    in_progress: "Pågår",
    waiting: "Väntar",
    closed: "Avslutat",
  };
  return labels[status] || status;
}

export default async function Dashboard() {
  const data = await getDashboardData();

  const kpis = [
    { label: "Öppna ärenden", value: data.openTickets, hint: `${data.totalTickets} totalt`, icon: ClipboardList },
    { label: "Akuta ärenden", value: data.urgentTickets, hint: "Kräver snabb bedömning", icon: AlertTriangle },
    { label: "Ej tilldelade", value: data.unassignedTickets, hint: "Saknar ansvarig", icon: UserRoundX },
    { label: "Avslutade i månaden", value: data.closedThisMonth, hint: "Genomförda åtgärder", icon: CheckCircle2 },
  ];

  const attentionItems = [
    { label: "Försenade ärenden", value: data.overdueTickets, href: "/dashboard/felanmalan", icon: Clock3 },
    { label: "Akuta ärenden", value: data.urgentTickets, href: "/dashboard/felanmalan", icon: AlertTriangle },
    { label: "Saknar ansvarig", value: data.unassignedTickets, href: "/dashboard/felanmalan", icon: UserRoundX },
  ];

  return (
    <div className="animate-fade-in-soft space-y-6">
      <header className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="relative p-7 sm:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-sand-50/70 lg:block" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Operativ översikt</p>
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] text-ink-950 sm:text-[36px]">
                Välkommen{data.user.name ? `, ${data.user.name}` : ""}
              </h1>
              <p className="mt-3 text-lg leading-8 text-ink-600">
                {data.user.company?.name || "Din organisation"} samlar fastigheter, team och ärenden i en tydlig svensk förvaltningsyta.
              </p>
            </div>
            <div className="relative flex flex-wrap gap-3">
              <Link href="/dashboard/fastigheter" className="rounded-lg border border-sand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 transition hover:bg-sand-50">
                Visa bestånd
              </Link>
              <Link href="/dashboard/felanmalan" className="rounded-lg bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-petroleum-800">
                Ny felanmälan
              </Link>
            </div>
          </div>
        </div>
      </header>

      {!data.user.email_verified_at && (
        <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-warning-700 shadow-sm">
          <p className="font-semibold">E-postadressen är inte verifierad ännu.</p>
          <p className="mt-1 text-sm">Verifiera adressen för säkrare kontoåterställning och framtida systemnotiser.</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.label} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink-500">{kpi.label}</p>
                  <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-ink-950">{kpi.value}</p>
                  <p className="mt-1 text-xs text-ink-400">{kpi.hint}</p>
                </div>
                <div className="rounded-xl bg-sand-50 p-3 text-petroleum-700">
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <DashboardSlaOperations />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex items-center justify-between border-b border-sand-200 px-6 py-5 sm:px-7">
            <div>
              <h2 className="text-xl font-semibold text-ink-950">Senaste ärenden</h2>
              <p className="mt-1 text-sm text-ink-500">Senaste aktivitet i organisationens arbetsflöde.</p>
            </div>
            <Link href="/dashboard/felanmalan" className="text-sm font-semibold text-petroleum-700 hover:text-petroleum-900">Visa alla</Link>
          </div>

          {data.latestTickets.length > 0 ? (
            <div className="divide-y divide-sand-100">
              {data.latestTickets.map((ticket) => (
                <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-center justify-between gap-4 px-6 py-5 transition hover:bg-sand-50/70 sm:px-7">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{ticket.title}</p>
                    <p className="mt-1 text-sm text-ink-500">
                      {ticket.property?.name || "Ingen fastighet"} · {formatDate(ticket.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600 sm:inline-flex">
                      {statusLabel(ticket.status)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-ink-300" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center">
              <p className="font-semibold text-ink-800">Inga ärenden ännu</p>
              <p className="mt-2 text-sm text-ink-500">När första ärendet skapas visas det här.</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink-950">Kräver uppmärksamhet</h2>
              <p className="mt-1 text-sm text-ink-500">Prioriterade avvikelser i driften.</p>
            </div>
            <div className="rounded-xl bg-sand-50 p-3 text-petroleum-700">
              <AlertTriangle className="h-5 w-5" strokeWidth={1.7} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {attentionItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-xl border border-sand-200 px-4 py-3.5 transition hover:bg-sand-50">
                  <span className="flex items-center gap-3 text-sm font-medium text-ink-700">
                    <Icon className="h-4 w-4 text-petroleum-700" />
                    {item.label}
                  </span>
                  <span className="min-w-8 rounded-full bg-petroleum-50 px-2.5 py-1 text-center text-xs font-semibold text-petroleum-800">{item.value}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="flex flex-col gap-4 border-b border-sand-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <h2 className="text-xl font-semibold text-ink-950">Beståndsöversikt</h2>
            <p className="mt-1 text-sm text-ink-500">Fastigheter och registrerad ärendebelastning.</p>
          </div>
          <div className="flex gap-4 text-sm text-ink-500">
            <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" /> {data.totalProperties} fastigheter</span>
            <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> {data.totalMembers} i teamet</span>
          </div>
        </div>
        {data.propertyWorkload.length > 0 ? (
          <div className="grid grid-cols-1 divide-y divide-sand-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
            {data.propertyWorkload.map((property) => (
              <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="p-5 transition hover:bg-sand-50/70">
                <p className="truncate font-semibold text-ink-900">{property.name}</p>
                <p className="mt-1 text-sm text-ink-500">{property.city}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-petroleum-700">{property._count.tickets} ärenden</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <p className="font-semibold text-ink-800">Inga fastigheter registrerade</p>
            <Link href="/dashboard/fastigheter" className="mt-3 inline-flex text-sm font-semibold text-petroleum-700">Lägg till första fastigheten</Link>
          </div>
        )}
      </section>
    </div>
  );
}
