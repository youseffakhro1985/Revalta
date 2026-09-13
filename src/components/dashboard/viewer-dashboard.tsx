import Link from "next/link";
import { Building2, CircleDollarSign, DoorOpen, FileText } from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";
import { OverviewEmpty, OverviewHero, OverviewMetricLink, OverviewPanel } from "@/components/dashboard/overview-chrome";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export async function ViewerDashboard({ user }: { user: CurrentUser }) {
  const year = new Date().getFullYear();
  const propertyScope = { deleted_at: null, ...tenantWhere(user) };
  const [propertyCount, properties, unitCount, leasedUnits, budget] = await Promise.all([
    db.property.count({ where: propertyScope }),
    db.property.findMany({
      where: propertyScope,
      orderBy: { name: "asc" },
      take: 8,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        _count: { select: { units: true } },
      },
    }),
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
          _sum: { budget: true, actual: true },
        })
      : Promise.resolve({ _sum: { budget: null, actual: null } }),
  ]);

  const vacant = Math.max(0, unitCount - leasedUnits.length);
  const budgetTotal = Number(budget._sum.budget || 0);
  const actualTotal = Number(budget._sum.actual || 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <OverviewHero
        eyebrow="Läsbehörighet"
        title="Beståndsöversikt"
        description="En skrivskyddad bild av fastigheter, objekt och ekonomiskt nuläge. Ändringar görs av behöriga roller."
        userName={user.name}
        userEmail={user.email}
        role={user.role}
        companyName={user.company?.name}
        statusLabel="Endast visning"
        statusTone="neutral"
        actions={[
          { href: "/dashboard/dokument", label: "Dokument" },
          { href: "/dashboard/budget", label: "Budget" },
          { href: "/dashboard/energi", label: "Energi" },
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal">
        <OverviewMetricLink href="/dashboard/fastigheter" icon={Building2} label="Fastigheter" value={propertyCount} hint="Registrerat bestånd" />
        <OverviewMetricLink href="/dashboard/uthyrning" icon={DoorOpen} label="Objekt" value={unitCount} hint={`${vacant} utan aktivt eller pågående hyresavtal`} />
        <OverviewMetricLink href="/dashboard/budget" icon={CircleDollarSign} label={`Budget ${year}`} value={money.format(budgetTotal)} hint={`Utfall ${money.format(actualTotal)}`} />
        <OverviewMetricLink href="/dashboard/dokument" icon={FileText} label="Åtkomst" value="Läs" hint="Inga mutationer från denna arbetsyta" />
      </section>

      <OverviewPanel title="Fastigheter" description="Öppna ett fastighetskort för att läsa den information din roll har åtkomst till." bodyClassName="p-0">
        {properties.length ? <div className="divide-y divide-sand-100">{properties.map((property) => (
          <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="grid gap-2 px-5 py-4 outline-none transition hover:bg-sand-50/70 focus-visible:bg-petroleum-50/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{property.name}</p><p className="mt-1 truncate text-xs text-ink-500">{property.address}, {property.city}</p></div>
            <span className="text-xs font-semibold text-ink-500">{property._count.units} objekt</span>
          </Link>
        ))}</div> : <OverviewEmpty icon={Building2} title="Inga fastigheter registrerade" description="När beståndet är inlagt visas det här för läsning." />}
      </OverviewPanel>
    </div>
  );
}
