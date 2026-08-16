import { notFound } from "next/navigation";
import db from "@/lib/db";
import { tenantWhere, type CurrentUser } from "@/lib/current-user";

function unitTypeLabel(type: string) {
  const labels: Record<string, string> = {
    apartment: "Lägenhet",
    commercial: "Lokal",
    storage: "Förråd",
    garage: "Garage",
    parking: "Parkering",
    technical: "Tekniskt utrymme",
    other: "Övrigt",
  };
  return labels[type] || type;
}

export async function PropertyUnitsSection({ user, propertyId }: { user: CurrentUser; propertyId: string }) {
  const property = await db.property.findFirst({
    where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
    select: {
      address: true,
      buildings: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          construction_year: true,
          floors: true,
          _count: { select: { units: true } },
        },
      },
      units: {
        orderBy: [{ unit_type: "asc" }, { designation: "asc" }],
        select: {
          id: true,
          designation: true,
          unit_type: true,
          floor: true,
          area: true,
          building: { select: { name: true } },
        },
      },
    },
  });

  if (!property) notFound();

  return (
    <section id="enheter" className="scroll-mt-36 space-y-4" aria-labelledby="property-units-title">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Enheter</p>
        <h2 id="property-units-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Byggnader, lägenheter och lokaler</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Fastighetens befintliga struktur visas här utan att skapa ett separat objektsregister.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="property-buildings-title">
          <div className="border-b border-sand-200 px-6 py-5 sm:px-7">
            <h3 id="property-buildings-title" className="text-xl font-semibold text-ink-950">Byggnader</h3>
            <p className="mt-1 text-sm text-ink-500">Struktur, adresser och antal registrerade objekt.</p>
          </div>
          {property.buildings.length ? (
            <div className="divide-y divide-sand-100">
              {property.buildings.map((building) => (
                <div key={building.id} className="flex items-start justify-between gap-4 px-6 py-5 sm:px-7">
                  <div>
                    <p className="font-semibold text-ink-900">{building.name}</p>
                    <p className="mt-1 text-sm text-ink-500">{building.address || property.address}{building.construction_year ? ` · Byggår ${building.construction_year}` : ""}{building.floors != null ? ` · ${building.floors} vån.` : ""}</p>
                  </div>
                  <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">{building._count.units} objekt</span>
                </div>
              ))}
            </div>
          ) : <div className="p-10 text-center text-sm text-ink-500">Ingen byggnad registrerad ännu.</div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm" aria-labelledby="property-units-list-title">
          <div className="border-b border-sand-200 px-6 py-5 sm:px-7">
            <h3 id="property-units-list-title" className="text-xl font-semibold text-ink-950">Lägenheter och lokaler</h3>
            <p className="mt-1 text-sm text-ink-500">Objektsregister för boende, lokaler och tekniska ytor.</p>
          </div>
          {property.units.length ? (
            <div className="max-h-[430px] divide-y divide-sand-100 overflow-y-auto">
              {property.units.map((unit) => (
                <div key={unit.id} className="flex items-start justify-between gap-4 px-6 py-4 sm:px-7">
                  <div>
                    <p className="font-semibold text-ink-900">{unit.designation}</p>
                    <p className="mt-1 text-sm text-ink-500">{unitTypeLabel(unit.unit_type)}{unit.building?.name ? ` · ${unit.building.name}` : ""}{unit.floor ? ` · Våning ${unit.floor}` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink-600">{unit.area ? `${unit.area} m²` : "–"}</span>
                </div>
              ))}
            </div>
          ) : <div className="p-10 text-center text-sm text-ink-500">Inga lägenheter eller lokaler registrerade ännu.</div>}
        </section>
      </div>
    </section>
  );
}
