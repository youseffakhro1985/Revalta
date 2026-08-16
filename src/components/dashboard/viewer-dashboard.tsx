import Link from "next/link";
import { Building2, CircleDollarSign, DoorOpen, FileText } from "lucide-react";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";
import { MetricCard, PageHeader, Panel } from "@/components/dashboard/premium-ui";

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export async function ViewerDashboard({ user }: { user: CurrentUser }) {
  const year = new Date().getFullYear();
  const propertyScope = { deleted_at: null, ...tenantWhere(user) };
  const [properties, unitCount, leasedUnits, budget] = await Promise.all([
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Läsbehörighet"
        title="Beståndsöversikt"
        description="En lugn, skrivskyddad översikt över fastigheter, objekt och ekonomiskt nuläge. Ändringar görs av behöriga roller."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Building2} label="Fastigheter" value={properties.length} />
        <MetricCard icon={DoorOpen} label="Objekt" value={unitCount} hint={`${vacant} utan aktivt eller pågående hyresavtal`} />
        <MetricCard icon={CircleDollarSign} label={`Budget ${year}`} value={money.format(budgetTotal)} hint={`Utfall ${money.format(actualTotal)}`} />
        <MetricCard icon={FileText} label="Åtkomst" value="Läs" hint="Inga mutationer från denna arbetsyta" />
      </section>

      <Panel title="Fastigheter" description="Öppna ett fastighetskort för att läsa den information din roll har åtkomst till." bodyClassName="p-0">
        {properties.length ? <div className="divide-y divide-sand-100">{properties.map((property) => (
          <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="grid gap-2 px-5 py-4 outline-none transition hover:bg-sand-50/70 focus-visible:bg-petroleum-50/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{property.name}</p><p className="mt-1 truncate text-xs text-ink-500">{property.address}, {property.city}</p></div>
            <span className="text-xs font-semibold text-ink-500">{property._count.units} objekt</span>
          </Link>
        ))}</div> : <p className="p-8 text-center text-sm text-ink-500">Inga fastigheter registrerade.</p>}
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/dokument" className="rounded-lg border border-sand-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-petroleum-700 transition hover:bg-sand-50">Dokument</Link>
        <Link href="/dashboard/budget" className="rounded-lg border border-sand-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-petroleum-700 transition hover:bg-sand-50">Budget & prognos</Link>
        <Link href="/dashboard/energi" className="rounded-lg border border-sand-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-petroleum-700 transition hover:bg-sand-50">Energi</Link>
      </div>
    </div>
  );
}
