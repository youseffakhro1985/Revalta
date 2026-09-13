import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, ClipboardList, DoorOpen, MapPin, Ruler, UserRound } from "lucide-react";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { isResident } from "@/lib/permissions";
import { residentHomePath } from "@/lib/resident-access";
import { notDeletedFilter } from "@/lib/schema-readiness";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { PropertyRegistryManager } from "@/components/properties/property-registry-manager";
import {
  propertyWorkspaceCapabilities,
  propertyWorkspaceSectionsForRole,
} from "@/components/properties/property-workspace";
import { PropertyWorkspaceNavigation } from "@/components/properties/property-workspace-navigation";

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

function propertyTypeLabel(type: string) {
  const labels: Record<string, string> = {
    residential: "Bostäder",
    commercial: "Kommersiell",
    mixed: "Blandfastighet",
    community: "Samhällsfastighet",
    industrial: "Industri",
    other: "Övrig",
  };
  return labels[type] || type;
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isResident(user.role)) redirect(residentHomePath());

  const { id } = await params;
  const capabilities = propertyWorkspaceCapabilities(user.role);
  const workspaceItems = propertyWorkspaceSectionsForRole(user.role);
  const [propertyActive, ticketActive] = await Promise.all([
    notDeletedFilter("Property"),
    notDeletedFilter("Ticket"),
  ]);

  const property = await db.property.findFirst({
    where: { id, ...propertyActive, ...tenantWhere(user) },
    include: {
      buildings: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
      _count: { select: { buildings: true, units: true } },
    },
  });

  if (!property) notFound();

  // Aggregate object metrics in the database instead of materializing every
  // unit row into the server-rendered page. The result cardinality is bounded
  // by the small set of unit_type values regardless of portfolio size.
  const unitMetrics = await db.unit.groupBy({
    by: ["unit_type"],
    where: { property_id: property.id },
    _count: { _all: true },
    _sum: { area: true },
  });
  const apartmentCount = unitMetrics.find((item) => item.unit_type === "apartment")?._count._all ?? 0;
  const commercialCount = unitMetrics.find((item) => item.unit_type === "commercial")?._count._all ?? 0;
  const totalRegisteredArea = unitMetrics.reduce((sum, item) => sum + Number(item._sum.area || 0), 0);

  const [openTickets, recentTickets] = capabilities.canOperate
    ? await Promise.all([
        db.ticket.count({
          where: {
            property_id: property.id,
            ...ticketActive,
            ...tenantWhere(user),
            status: { not: "closed" },
          },
        }),
        db.ticket.findMany({
          where: {
            property_id: property.id,
            ...ticketActive,
            ...tenantWhere(user),
          },
          orderBy: { created_at: "desc" },
          take: 8,
          select: {
            id: true,
            title: true,
            status: true,
            created_at: true,
            assigned_to: { select: { name: true, email: true } },
          },
        }),
      ])
    : [0, []];

  const metrics = [
    ...(capabilities.canOperate ? [{ label: "Öppna ärenden", value: openTickets, icon: ClipboardList }] : []),
    { label: "Byggnader", value: property._count.buildings, icon: Building2 },
    { label: "Lägenheter", value: apartmentCount, icon: DoorOpen },
    { label: "Lokaler", value: commercialCount, icon: UserRound },
    { label: "Registrerad area", value: `${Math.round(totalRegisteredArea)} m²`, icon: Ruler },
  ];

  return (
    <div className="animate-fade-in-soft space-y-8">
      <DashboardBreadcrumbs items={[{ label: "Fastigheter", href: "/dashboard/fastigheter" }, { label: property.name }]} />
      <PropertyWorkspaceNavigation items={workspaceItems} />

      <section id="oversikt" className="scroll-mt-36 space-y-6" aria-labelledby="property-title">
        <header className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="relative p-7 sm:p-8">
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-sand-50/70 lg:block" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Digital fastighetspärm</p>
                  <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                    {property.status === "active" ? "Aktiv" : property.status}
                  </span>
                </div>
                <h1 id="property-title" className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">{property.name}</h1>
                <p className="mt-3 flex items-center gap-2 text-base text-ink-600">
                  <MapPin className="h-4 w-4 text-petroleum-700" aria-hidden="true" />
                  {property.address}{property.postal_code ? `, ${property.postal_code}` : ""} {property.city}
                </p>
                {property.property_identifier ? <p className="mt-2 text-sm font-medium text-ink-500">Fastighetsbeteckning: {property.property_identifier}</p> : null}
              </div>
              {capabilities.canOperate ? (
                <Link href={`/dashboard/felanmalan?property=${property.id}`} className="relative rounded-lg bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300">
                  Skapa ärende
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${metrics.length >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
          {metrics.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink-500">{item.label}</p>
                    <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-ink-950">{item.value}</p>
                  </div>
                  <div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></div>
                </div>
              </article>
            );
          })}
        </div>

        <div className={`grid grid-cols-1 gap-6 ${capabilities.canOperate ? "xl:grid-cols-[0.8fr_1.2fr]" : ""}`}>
          <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
            <h2 className="text-xl font-semibold text-ink-950">Förvaltningsöversikt</h2>
            <p className="mt-1 text-sm text-ink-500">Samlad basinformation för fastigheten.</p>
            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
              {[
                ["Fastighetstyp", propertyTypeLabel(property.property_type)],
                ["Byggår", property.construction_year?.toString() || "Ej angivet"],
                ["Total area", property.total_area ? `${property.total_area} m²` : "Ej angivet"],
                ["BOA / LOA", `${property.boa ? `${property.boa} m²` : "–"} / ${property.loa ? `${property.loa} m²` : "–"}`],
                ["Ansvarig förvaltare", property.manager_name || "Ej angivet"],
                ["Kontaktperson", property.contact_name || "Ej angivet"],
                ["E-post", property.contact_email || "Ej angivet"],
                ["Registrerad", formatDate(property.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-sand-100 pb-4">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="mt-1 font-semibold text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {capabilities.canOperate ? (
            <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
              <div className="flex items-center justify-between border-b border-sand-200 px-6 py-5 sm:px-7">
                <div><h2 className="text-xl font-semibold text-ink-950">Senaste ärenden</h2><p className="mt-1 text-sm text-ink-500">Arbetsflöde och aktivitet kopplad till fastigheten.</p></div>
                <Link href="/dashboard/felanmalan" className="text-sm font-semibold text-petroleum-700">Visa alla</Link>
              </div>
              {recentTickets.length > 0 ? (
                <div className="divide-y divide-sand-100">
                  {recentTickets.map((ticket) => (
                    <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-start justify-between gap-4 px-6 py-5 transition hover:bg-sand-50/70 sm:px-7">
                      <div className="min-w-0"><p className="truncate font-semibold text-ink-900">{ticket.title}</p><p className="mt-1 text-sm text-ink-500">{ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"} · {formatDate(ticket.created_at)}</p></div>
                      <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{statusLabel(ticket.status)}</span>
                    </Link>
                  ))}
                </div>
              ) : <div className="p-12 text-center"><p className="font-semibold text-ink-800">Inga ärenden kopplade ännu</p><p className="mt-2 text-sm text-ink-500">Nya felanmälningar visas automatiskt här.</p></div>}
            </section>
          ) : null}
        </div>

        {capabilities.canManagePropertyRecords ? (
          <PropertyRegistryManager
            canManage
            propertyId={property.id}
            buildings={property.buildings.map(({ id: buildingId, name }) => ({ id: buildingId, name }))}
            initialValues={{
              name: property.name,
              address: property.address,
              postalCode: property.postal_code || "",
              city: property.city,
              propertyIdentifier: property.property_identifier || "",
              propertyType: property.property_type,
              status: property.status,
              constructionYear: property.construction_year?.toString() || "",
              totalArea: property.total_area?.toString() || "",
              boa: property.boa?.toString() || "",
              loa: property.loa?.toString() || "",
              managerName: property.manager_name || "",
              contactName: property.contact_name || "",
              contactEmail: property.contact_email || "",
              contactPhone: property.contact_phone || "",
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
