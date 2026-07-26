import db from "@/lib/db";
import { auditScopedWhere, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { activePropertyRelationFilter, notDeletedFilter } from "@/lib/schema-readiness";
import { redirect } from "next/navigation";

const closedStatuses = new Set(["done", "closed", "completed", "resolved"]);
const openStatuses = new Set(["new", "received", "assigned", "in_progress", "waiting", "waiting_material", "waiting_resident", "waiting_vendor"]);

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDays(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "–";
  return `${Math.max(1, Math.round(milliseconds / 86_400_000))} dagar`;
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const where = tenantWhere(user);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const [propertyActive, ticketActive, propertyRelation] = await Promise.all([
    notDeletedFilter("Property"),
    notDeletedFilter("Ticket"),
    activePropertyRelationFilter(),
  ]);
  const ticketPropertyScope = "property" in propertyRelation
    ? { OR: [{ property_id: null }, propertyRelation] }
    : {};

  const [properties, tickets, recentAudit] = await Promise.all([
    db.property.findMany({
      where: { ...propertyActive, ...where },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        city: true,
        total_area: true,
        boa: true,
        loa: true,
        _count: { select: { tickets: { where: { ...ticketActive, ...ticketPropertyScope } }, buildings: true, units: true } },
      },
    }),
    db.ticket.findMany({
      where: {
        ...ticketActive,
        ...where,
        created_at: { gte: ninetyDaysAgo },
        ...ticketPropertyScope,
      },
      orderBy: { created_at: "asc" },
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
    db.auditLog.findMany({
      where: { ...auditScopedWhere(user), created_at: { gte: thirtyDaysAgo } },
      orderBy: { created_at: "desc" },
      take: 300,
      select: { action: true, metadata: true, created_at: true },
    }),
  ]);

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => openStatuses.has(ticket.status)).length;
  const closedTickets = tickets.filter((ticket) => closedStatuses.has(ticket.status)).length;
  const urgentTickets = tickets.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "critical").length;
  const assignedTickets = tickets.filter((ticket) => ticket.assigned_to).length;
  const closedWithTime = tickets.filter((ticket) => ticket.closed_at).map((ticket) => ticket.closed_at!.getTime() - ticket.created_at.getTime());
  const averageResolution = closedWithTime.length ? closedWithTime.reduce((sum, value) => sum + value, 0) / closedWithTime.length : 0;

  const monthBuckets = Array.from({ length: 3 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (2 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: new Intl.DateTimeFormat("sv-SE", { month: "long" }).format(date), total: 0, closed: 0 };
  });

  for (const ticket of tickets) {
    const key = `${ticket.created_at.getFullYear()}-${String(ticket.created_at.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthBuckets.find((item) => item.key === key);
    if (bucket) {
      bucket.total += 1;
      if (closedStatuses.has(ticket.status)) bucket.closed += 1;
    }
  }

  const categories = new Map<string, number>();
  const propertyLoad = new Map<string, { name: string; total: number; open: number }>();
  const assigneeLoad = new Map<string, { name: string; total: number; open: number }>();

  for (const ticket of tickets) {
    categories.set(ticket.category, (categories.get(ticket.category) || 0) + 1);
    if (ticket.property) {
      const current = propertyLoad.get(ticket.property.id) || { name: ticket.property.name, total: 0, open: 0 };
      current.total += 1;
      if (openStatuses.has(ticket.status)) current.open += 1;
      propertyLoad.set(ticket.property.id, current);
    }
    if (ticket.assigned_to) {
      const name = ticket.assigned_to.name || ticket.assigned_to.email;
      const current = assigneeLoad.get(ticket.assigned_to.id) || { name, total: 0, open: 0 };
      current.total += 1;
      if (openStatuses.has(ticket.status)) current.open += 1;
      assigneeLoad.set(ticket.assigned_to.id, current);
    }
  }

  const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const busiestProperties = [...propertyLoad.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  const teamRows = [...assigneeLoad.values()].sort((a, b) => b.open - a.open).slice(0, 6);
  const maxCategory = Math.max(1, ...categoryRows.map(([, value]) => value));
  const maintenanceEvents = recentAudit.filter((item) => item.action.includes("maintenance")).length;
  const roundEvents = recentAudit.filter((item) => item.action.includes("round") || item.action.includes("inspection")).length;
  const documentEvents = recentAudit.filter((item) => item.action.includes("document")).length;

  const portfolioArea = properties.reduce((sum, property) => sum + Number(property.total_area || property.boa || 0) + Number(property.loa || 0), 0);
  const portfolioUnits = properties.reduce((sum, property) => sum + property._count.units, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Beslutsstöd</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Rapporter och nyckeltal</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">En samlad bild av drift, ärendeflöde, bestånd och arbetsbelastning de senaste 90 dagarna.</p>
        </div>
        <p className="text-xs text-ink-400">Uppdaterad {new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Fastigheter", properties.length, `${portfolioUnits} objekt`],
          ["Öppna ärenden", openTickets, `${percent(openTickets, totalTickets)} % av perioden`],
          ["Avslutade ärenden", closedTickets, `${percent(closedTickets, totalTickets)} % avslutade`],
          ["Akut prioritet", urgentTickets, "kräver särskild uppföljning"],
          ["Genomsnittlig åtgärdstid", formatDays(averageResolution), `${percent(assignedTickets, totalTickets)} % tilldelade`],
        ].map(([label, value, detail]) => (
          <article key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <p className="text-xs font-medium text-ink-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink-950">{value}</p>
            <p className="mt-2 text-[11px] text-ink-400">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">Utveckling</p><h2 className="mt-1 text-lg font-semibold text-ink-950">Ärenden per månad</h2></div>
            <p className="text-xs text-ink-400">Senaste tre månaderna</p>
          </div>
          <div className="mt-8 grid min-h-56 grid-cols-3 items-end gap-5 border-b border-sand-200 pb-4">
            {monthBuckets.map((bucket) => {
              const max = Math.max(1, ...monthBuckets.map((item) => item.total));
              const height = Math.max(12, Math.round((bucket.total / max) * 150));
              return (
                <div key={bucket.key} className="flex h-full flex-col justify-end">
                  <div className="mb-3 text-center"><p className="text-lg font-semibold text-ink-900">{bucket.total}</p><p className="text-[10px] text-ink-400">{bucket.closed} avslutade</p></div>
                  <div className="mx-auto w-full max-w-24 rounded-t-xl bg-petroleum-700" style={{ height }} />
                  <p className="mt-3 text-center text-xs capitalize text-ink-500">{bucket.label}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">Fördelning</p>
          <h2 className="mt-1 text-lg font-semibold text-ink-950">Vanligaste kategorier</h2>
          <div className="mt-6 space-y-5">
            {categoryRows.length === 0 ? <p className="text-sm text-ink-400">Inga ärenden under perioden.</p> : categoryRows.map(([category, value]) => (
              <div key={category}>
                <div className="mb-2 flex items-center justify-between gap-4"><p className="text-sm font-medium capitalize text-ink-700">{category.replaceAll("_", " ")}</p><p className="text-sm font-semibold text-ink-900">{value}</p></div>
                <div className="h-2 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-600" style={{ width: `${Math.max(5, (value / maxCategory) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">Bestånd</p>
          <h2 className="mt-1 text-lg font-semibold text-ink-950">Belastning per fastighet</h2>
          <div className="mt-5 divide-y divide-sand-200">
            {busiestProperties.length === 0 ? <p className="py-5 text-sm text-ink-400">Ingen fastighetsdata ännu.</p> : busiestProperties.map((property) => (
              <div key={property.name} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium text-ink-800">{property.name}</p><p className="text-[11px] text-ink-400">{property.open} öppna</p></div><p className="text-sm font-semibold text-ink-950">{property.total}</p></div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">Organisation</p>
          <h2 className="mt-1 text-lg font-semibold text-ink-950">Arbetsbelastning</h2>
          <div className="mt-5 divide-y divide-sand-200">
            {teamRows.length === 0 ? <p className="py-5 text-sm text-ink-400">Inga tilldelade ärenden ännu.</p> : teamRows.map((member) => (
              <div key={member.name} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium text-ink-800">{member.name}</p><p className="text-[11px] text-ink-400">{member.open} öppna</p></div><p className="text-sm font-semibold text-ink-950">{member.total}</p></div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">Aktivitet</p>
          <h2 className="mt-1 text-lg font-semibold text-ink-950">Förvaltning senaste 30 dagar</h2>
          <div className="mt-6 space-y-4">
            {[
              ["Underhållshändelser", maintenanceEvents],
              ["Ronder och kontroller", roundEvents],
              ["Dokumenthändelser", documentEvents],
              ["Registrerade aktiviteter", recentAudit.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-xl border border-sand-200 bg-[#FAFAF8] px-4 py-3"><p className="text-sm text-ink-600">{label}</p><p className="text-sm font-semibold text-ink-950">{value}</p></div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-sand-200 bg-[#F1F1EC] p-5"><p className="text-xs text-ink-400">Samlad registrerad area</p><p className="mt-2 text-xl font-semibold text-ink-950">{Math.round(portfolioArea).toLocaleString("sv-SE")} m²</p></div>
        <div className="rounded-2xl border border-sand-200 bg-[#F1F1EC] p-5"><p className="text-xs text-ink-400">Byggnader i beståndet</p><p className="mt-2 text-xl font-semibold text-ink-950">{properties.reduce((sum, property) => sum + property._count.buildings, 0)}</p></div>
        <div className="rounded-2xl border border-sand-200 bg-[#F1F1EC] p-5"><p className="text-xs text-ink-400">Tilldelningsgrad</p><p className="mt-2 text-xl font-semibold text-ink-950">{percent(assignedTickets, totalTickets)} %</p></div>
      </section>
    </div>
  );
}
