import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ClipboardList,
  MapPin,
  UserRound,
} from "lucide-react";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

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

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const property = await db.property.findFirst({
    where: { id, ...tenantWhere(user) },
    include: {
      tickets: {
        orderBy: { created_at: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          created_at: true,
          assigned_to: { select: { name: true, email: true } },
        },
      },
      _count: { select: { tickets: true } },
    },
  });

  if (!property) notFound();

  const openTickets = property.tickets.filter((ticket) => ticket.status !== "closed").length;
  const urgentTickets = property.tickets.filter((ticket) => ticket.priority === "urgent" && ticket.status !== "closed").length;

  return (
    <div className="animate-fade-in-soft space-y-6">
      <Link href="/dashboard/fastigheter" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-petroleum-800">
        <ArrowLeft className="h-4 w-4" /> Till fastighetsregistret
      </Link>

      <header className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="relative p-7 sm:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-sand-50/70 lg:block" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Fastighetskort</p>
              <h1 className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">{property.name}</h1>
              <p className="mt-3 flex items-center gap-2 text-base text-ink-600">
                <MapPin className="h-4 w-4 text-petroleum-700" />
                {property.address}{property.postal_code ? `, ${property.postal_code}` : ""} {property.city}
              </p>
            </div>
            <Link href={`/dashboard/felanmalan?property=${property.id}`} className="relative rounded-lg bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-petroleum-800">
              Skapa ärende
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Registrerade ärenden", value: property._count.tickets, icon: ClipboardList },
          { label: "Öppna i senaste listan", value: openTickets, icon: CalendarDays },
          { label: "Akuta i senaste listan", value: urgentTickets, icon: Building2 },
          { label: "Fastighetsstatus", value: "Aktiv", icon: UserRound },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink-500">{item.label}</p>
                  <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-ink-950">{item.value}</p>
                </div>
                <div className="rounded-xl bg-sand-50 p-3 text-petroleum-700">
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm">
          <h2 className="text-xl font-semibold text-ink-950">Grunduppgifter</h2>
          <p className="mt-1 text-sm text-ink-500">Samlad basinformation för fastigheten.</p>
          <dl className="mt-6 space-y-5 text-sm">
            <div className="border-b border-sand-100 pb-4">
              <dt className="text-ink-400">Fastighetsnamn</dt>
              <dd className="mt-1 font-semibold text-ink-900">{property.name}</dd>
            </div>
            <div className="border-b border-sand-100 pb-4">
              <dt className="text-ink-400">Besöksadress</dt>
              <dd className="mt-1 font-semibold text-ink-900">{property.address}</dd>
            </div>
            <div className="border-b border-sand-100 pb-4">
              <dt className="text-ink-400">Postnummer och ort</dt>
              <dd className="mt-1 font-semibold text-ink-900">{property.postal_code || "Ej angivet"} {property.city}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Registrerad</dt>
              <dd className="mt-1 font-semibold text-ink-900">{formatDate(property.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex items-center justify-between border-b border-sand-200 px-6 py-5 sm:px-7">
            <div>
              <h2 className="text-xl font-semibold text-ink-950">Senaste ärenden</h2>
              <p className="mt-1 text-sm text-ink-500">Arbetsflöde och aktivitet kopplad till fastigheten.</p>
            </div>
            <Link href="/dashboard/felanmalan" className="text-sm font-semibold text-petroleum-700">Visa alla</Link>
          </div>
          {property.tickets.length > 0 ? (
            <div className="divide-y divide-sand-100">
              {property.tickets.map((ticket) => (
                <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-start justify-between gap-4 px-6 py-5 transition hover:bg-sand-50/70 sm:px-7">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{ticket.title}</p>
                    <p className="mt-1 text-sm text-ink-500">
                      {ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"} · {formatDate(ticket.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-xs font-semibold text-ink-600">
                    {statusLabel(ticket.status)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <p className="font-semibold text-ink-800">Inga ärenden kopplade ännu</p>
              <p className="mt-2 text-sm text-ink-500">Nya felanmälningar visas automatiskt här.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
