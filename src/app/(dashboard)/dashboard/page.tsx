import Link from "next/link";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

async function getDashboardData() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const scope = tenantWhere(user);
  const [totalTickets, openTickets, totalProperties, totalMembers, latestTickets] = await Promise.all([
    db.ticket.count({ where: scope }),
    db.ticket.count({ where: { ...scope, status: { not: "closed" } } }),
    db.property.count({ where: scope }),
    db.user.count({ where: user.company_id ? { company_id: user.company_id } : { id: user.id } }),
    db.ticket.findMany({
      where: scope,
      orderBy: { created_at: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        created_at: true,
        property: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return { user, totalTickets, openTickets, totalProperties, totalMembers, latestTickets };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
  }).format(date);
}

export default async function Dashboard() {
  const { user, totalTickets, openTickets, totalProperties, totalMembers, latestTickets } = await getDashboardData();

  return (
    <div className="animate-fade-in-soft space-y-6">
      <header className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="relative p-7 sm:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-sand-50/70 lg:block" />
          <div className="relative max-w-2xl">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Kontrollpanel</p>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[36px] text-ink-950">
              Välkommen{user.name ? `, ${user.name}` : ""}
            </h1>
            <p className="mt-3 text-lg leading-8 text-ink-600">
              {user.company?.name || "Din organisation"} samlar fastigheter, team och ärenden i en professionell arbetsyta.
            </p>
          </div>
        </div>
      </header>

      {!user.email_verified_at && (
        <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-warning-700 shadow-sm">
          <p className="font-semibold">E-postadressen är inte verifierad ännu.</p>
          <p className="mt-1 text-sm">I mockläge visas verifieringslänken när kontot skapas. Med e-postleverantör skickas länken automatiskt.</p>
        </div>
      )}

      {/* KPI Section */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Totalt antal ärenden', value: totalTickets, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
          { label: 'Öppna ärenden', value: openTickets, icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
          { label: 'Fastigheter', value: totalProperties, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { label: 'Team', value: totalMembers, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-lg border border-sand-200 shadow-premium-sm flex items-center space-x-4">
            <div className="p-3 bg-sand-50 rounded-lg">
              <svg className="w-6 h-6 text-petroleum-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={kpi.icon} />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-ink-600">{kpi.label}</p>
              <p className="text-[22px] font-semibold text-ink-950 mt-1">{kpi.value}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
        
        {/* Senaste Ärenden */}
        <div className="bg-white rounded-2xl border border-sand-200 shadow-premium-sm flex flex-col overflow-hidden">
          <div className="p-8 border-b border-sand-200 flex justify-between items-center bg-white">
            <div>
              <h2 className="text-xl font-semibold text-ink-950">Senaste ärenden</h2>
              <p className="mt-1 text-sm text-ink-500">Snabb överblick över vad som hänt senast.</p>
            </div>
            <Link href="/dashboard/felanmalan" className="rounded-lg bg-petroleum-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-petroleum-700">
              Ny felanmälan
            </Link>
          </div>
          
          <div className="p-0 flex-1">
            {latestTickets.length > 0 ? (
              <ul className="divide-y divide-sand-200">
                {latestTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/dashboard/felanmalan/${ticket.id}`}
                      className="flex items-start justify-between gap-4 p-6 hover:bg-sand-50 transition-colors"
                    >
                      <div>
                        <h3 className="font-semibold text-ink-950">{ticket.title}</h3>
                        <p className="mt-1 text-sm text-ink-500">
                          {ticket.property?.name ? `${ticket.property.name} · ` : ""}
                          {formatDate(ticket.created_at)}
                        </p>
                      </div>
                      <span className="rounded-md border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-700">
                        {ticket.priority}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-10 text-center">
                <p className="font-semibold text-ink-800">Inga ärenden ännu</p>
                <p className="mt-2 text-sm text-ink-500">Skapa din första felanmälan för att börja följa status här.</p>
              </div>
            )}
          </div>
        </div>

        {/* Mina uppgifter / Genvägar */}
        <div className="bg-white p-7 rounded-2xl sm:p-8 border border-sand-200 shadow-premium-sm">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-sand-100 text-petroleum-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink-950">Mina uppgifter</h2>
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-ink-500">Namn</dt>
              <dd className="mt-1 font-semibold text-ink-950">{user.name || "Ej angivet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-500">E-post</dt>
              <dd className="mt-1 font-semibold text-ink-950">{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-500">Konto skapat</dt>
              <dd className="mt-1 font-semibold text-ink-950">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
          <div className="mt-8 pt-6 border-t border-sand-200">
            <p className="text-xs text-ink-400 uppercase tracking-widest font-semibold mb-4">Snabbåtgärder</p>
            <Link href="/dashboard/fastigheter" className="w-full flex justify-center items-center px-4 py-2 border border-sand-200 bg-sand-50 text-ink-800 text-sm font-semibold rounded-lg hover:bg-sand-100 transition-colors">
              Gå till fastighetsregister
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
