import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, ClipboardList, DoorOpen, MapPin, Ruler, UserRound } from "lucide-react";
import db from "@/lib/db";
import {
  canCreateProperties,
  canManageTickets,
  canViewFinanceData,
  canViewLeasingData,
  canViewOperations,
  getCurrentUser,
  tenantWhere,
} from "@/lib/current-user";
import { notDeletedFilter } from "@/lib/schema-readiness";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { PropertyRegistryManager } from "@/components/properties/property-registry-manager";
import { PropertyComponentOverview } from "@/components/properties/property-component-overview";
import { PropertyResidentRegister } from "@/components/properties/property-resident-register";
import { PropertyWorkspaceNavigation, type PropertyWorkspaceNavItem } from "@/components/properties/property-workspace-navigation";
import { PropertyFinanceEnergySummary } from "@/components/properties/property-finance-energy-summary";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { new: "Nytt", assigned: "Tilldelat", in_progress: "Pågår", waiting: "Väntar", closed: "Avslutat" };
  return labels[status] || status;
}

function unitTypeLabel(type: string) {
  const labels: Record<string, string> = { apartment: "Lägenhet", commercial: "Lokal", storage: "Förråd", garage: "Garage", parking: "Parkering", technical: "Tekniskt utrymme", other: "Övrigt" };
  return labels[type] || type;
}

function propertyTypeLabel(type: string) {
  const labels: Record<string, string> = { residential: "Bostäder", commercial: "Kommersiell", mixed: "Blandfastighet", community: "Samhällsfastighet", industrial: "Industri", other: "Övrig" };
  return labels[type] || type;
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [propertyActive, ticketActive] = await Promise.all([
    notDeletedFilter("Property"),
    notDeletedFilter("Ticket"),
  ]);
  const property = await db.property.findFirst({
    where: { id, ...propertyActive, ...tenantWhere(user) },
    include: {
      buildings: { orderBy: { name: "asc" }, include: { _count: { select: { units: true } } } },
      units: { orderBy: [{ unit_type: "asc" }, { designation: "asc" }], include: { building: { select: { name: true } } } },
      tickets: {
        where: ticketActive,
        orderBy: { created_at: "desc" },
        take: 8,
        select: { id: true, title: true, status: true, priority: true, created_at: true, assigned_to: { select: { name: true, email: true } } },
      },
      _count: { select: { tickets: { where: ticketActive }, buildings: true, units: true } },
    },
  });

  if (!property) notFound();

  const openTickets = await db.ticket.count({
    where: { property_id: property.id, ...ticketActive, status: { not: "closed" } },
  });
  const apartmentCount = property.units.filter((unit) => unit.unit_type === "apartment").length;
  const commercialCount = property.units.filter((unit) => unit.unit_type === "commercial").length;
  const totalRegisteredArea = property.units.reduce((sum, unit) => sum + (unit.area || 0), 0);
  const canOperate = canManageTickets(user.role) || canViewOperations(user.role);
  const canLease = canViewLeasingData(user.role);
  const canFinance = canViewFinanceData(user.role);

  const workspaceItems: PropertyWorkspaceNavItem[] = [
    { id: "oversikt", label: "Översikt" },
    { id: "enheter", label: "Enheter" },
    ...(canOperate ? [{ id: "drift", label: "Drift" }, { id: "teknik", label: "Teknik" }] : []),
    ...(canViewOperations(user.role) ? [{ id: "underhall", label: "Underhåll" }] : []),
    ...(canLease ? [{ id: "hyresgaster", label: "Hyresgäster" }] : []),
    ...(canOperate || canLease ? [{ id: "dokument", label: "Dokument" }] : []),
    ...(canFinance ? [{ id: "energi", label: "Energi" }, { id: "ekonomi", label: "Ekonomi" }] : []),
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
                  <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">{property.status === "active" ? "Aktiv" : property.status}</span>
                </div>
                <h1 id="property-title" className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">{property.name}</h1>
                <p className="mt-3 flex items-center gap-2 text-base text-ink-600"><MapPin className="h-4 w-4 text-petroleum-700" aria-hidden="true" />{property.address}{property.postal_code ? `, ${property.postal_code}` : ""} {property.city}</p>
                {property.property_identifier ? <p className="mt-2 text-sm font-medium text-ink-500">Fastighetsbeteckning: {property.property_identifier}</p> : null}
              </div>
              {canManageTickets(user.role) ? <Link href={`/dashboard/felanmalan?property=${property.id}`} className="relative rounded-lg bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-petroleum-800">Skapa ärende</Link> : null}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Öppna ärenden", value: openTickets, icon: ClipboardList },
            { label: "Byggnader", value: property._count.buildings, icon: Building2 },
            { label: "Lägenheter", value: apartmentCount, icon: DoorOpen },
            { label: "Lokaler", value: commercialCount, icon: UserRound },
            { label: "Registrerad area", value: `${Math.round(totalRegisteredArea)} m²`, icon: Ruler },
          ].map((item) => { const Icon = item.icon; return <article key={item.label} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-ink-500">{item.label}</p><p className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-ink-950">{item.value}</p></div><div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></div></div></article>; })}
        </div>

        {canOperate ? <PropertyComponentOverview propertyId={property.id} /> : null}

        <div className={`grid grid-cols-1 gap-6 ${canOperate ? "xl:grid-cols-[0.8fr_1.2fr]" : ""}`}>
          <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
            <h2 className="text-xl font-semibold text-ink-950">Förvaltningsöversikt</h2><p className="mt-1 text-sm text-ink-500">Samlad basinformation för fastigheten.</p>
            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
              {[
                ["Fastighetstyp", propertyTypeLabel(property.property_type)], ["Byggår", property.construction_year?.toString() || "Ej angivet"], ["Total area", property.total_area ? `${property.total_area} m²` : "Ej angivet"], ["BOA / LOA", `${property.boa ? `${property.boa} m²` : "–"} / ${property.loa ? `${property.loa} m²` : "–"}`], ["Ansvarig förvaltare", property.manager_name || "Ej angivet"], ["Kontaktperson", property.contact_name || "Ej angivet"], ["E-post", property.contact_email || "Ej angivet"], ["Registrerad", formatDate(property.created_at)],
              ].map(([label, value]) => <div key={label} className="border-b border-sand-100 pb-4"><dt className="text-ink-500">{label}</dt><dd className="mt-1 font-semibold text-ink-900">{value}</dd></div>)}
            </dl>
          </section>

          {canOperate ? <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
            <div className="flex items-center justify-between border-b border-sand-200 px-6 py-5 sm:px-7"><div><h2 className="text-xl font-semibold text-ink-950">Senaste ärenden</h2><p className="mt-1 text-sm text-ink-500">Arbetsflöde och aktivitet kopplad till fastigheten.</p></div><Link href="/dashboard/felanmalan" className="text-sm font-semibold text-petroleum-700">Visa alla</Link></div>
            {property.tickets.length > 0 ? <div className="divide-y divide-sand-100">{property.tickets.map((ticket) => <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-start justify-between gap-4 px-6 py-5 transition hover:bg-sand-50/70 sm:px-7"><div className="min-w-0"><p className="truncate font-semibold text-ink-900">{ticket.title}</p><p className="mt-1 text-sm text-ink-500">{ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"} · {formatDate(ticket.created_at)}</p></div><span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{statusLabel(ticket.status)}</span></Link>)}</div> : <div className="p-12 text-center"><p className="font-semibold text-ink-800">Inga ärenden kopplade ännu</p><p className="mt-2 text-sm text-ink-500">Nya felanmälningar visas automatiskt här.</p></div>}
          </section> : null}
        </div>
      </section>

      <section id="enheter" className="scroll-mt-36 space-y-4" aria-labelledby="property-units-title">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Enheter</p><h2 id="property-units-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Byggnader, lägenheter och lokaler</h2></div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
            <div className="border-b border-sand-200 px-6 py-5 sm:px-7"><h3 className="text-xl font-semibold text-ink-950">Byggnader</h3><p className="mt-1 text-sm text-ink-500">Struktur, adresser och antal registrerade objekt.</p></div>
            {property.buildings.length ? <div className="divide-y divide-sand-100">{property.buildings.map((building) => <div key={building.id} className="flex items-start justify-between gap-4 px-6 py-5 sm:px-7"><div><p className="font-semibold text-ink-900">{building.name}</p><p className="mt-1 text-sm text-ink-500">{building.address || property.address}{building.construction_year ? ` · Byggår ${building.construction_year}` : ""}{building.floors != null ? ` · ${building.floors} vån.` : ""}</p></div><span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{building._count.units} objekt</span></div>)}</div> : <div className="p-10 text-center text-sm text-ink-500">Ingen byggnad registrerad ännu.</div>}
          </section>

          <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
            <div className="border-b border-sand-200 px-6 py-5 sm:px-7"><h3 className="text-xl font-semibold text-ink-950">Lägenheter och lokaler</h3><p className="mt-1 text-sm text-ink-500">Objektsregister för boende, lokaler och tekniska ytor.</p></div>
            {property.units.length ? <div className="max-h-[430px] divide-y divide-sand-100 overflow-y-auto">{property.units.map((unit) => <div key={unit.id} className="flex items-start justify-between gap-4 px-6 py-4 sm:px-7"><div><p className="font-semibold text-ink-900">{unit.designation}</p><p className="mt-1 text-sm text-ink-500">{unitTypeLabel(unit.unit_type)}{unit.building?.name ? ` · ${unit.building.name}` : ""}{unit.floor ? ` · Våning ${unit.floor}` : ""}</p></div><span className="text-sm font-semibold text-ink-600">{unit.area ? `${unit.area} m²` : "–"}</span></div>)}</div> : <div className="p-10 text-center text-sm text-ink-500">Inga lägenheter eller lokaler registrerade ännu.</div>}
          </section>
        </div>
      </section>

      {canLease ? <section id="hyresgaster" className="scroll-mt-36 space-y-4" aria-labelledby="property-residents-title"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Hyresgäster</p><h2 id="property-residents-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Boende och hyresparter</h2></div><PropertyResidentRegister propertyId={property.id} /></section> : null}

      {canFinance ? <PropertyFinanceEnergySummary user={user} propertyId={property.id} /> : null}

      {canCreateProperties(user.role) ? <PropertyRegistryManager canManage propertyId={property.id} buildings={property.buildings.map(({ id: buildingId, name }) => ({ id: buildingId, name }))} initialValues={{ name: property.name, address: property.address, postalCode: property.postal_code || "", city: property.city, propertyIdentifier: property.property_identifier || "", propertyType: property.property_type, status: property.status, constructionYear: property.construction_year?.toString() || "", totalArea: property.total_area?.toString() || "", boa: property.boa?.toString() || "", loa: property.loa?.toString() || "", managerName: property.manager_name || "", contactName: property.contact_name || "", contactEmail: property.contact_email || "", contactPhone: property.contact_phone || "" }} /> : null}
    </div>
  );
}
