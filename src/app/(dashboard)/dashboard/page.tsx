import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { verifyToken } from "@/lib/session";

async function getDashboardData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    redirect("/login");
  }

  const [user, totalTickets, openTickets, latestTickets] = await Promise.all([
    db.user.findUnique({
      where: { id: session.sub },
      select: { name: true, email: true, created_at: true },
    }),
    db.ticket.count({ where: { user_id: session.sub } }),
    db.ticket.count({ where: { user_id: session.sub, status: "ÖPPEN" } }),
    db.ticket.findMany({
      where: { user_id: session.sub },
      orderBy: { created_at: "desc" },
      take: 3,
      select: { id: true, title: true, status: true, created_at: true },
    }),
  ]);

  if (!user) {
    redirect("/login");
  }

  return { user, totalTickets, openTickets, latestTickets };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
  }).format(date);
}

export default async function Dashboard() {
  const { user, totalTickets, openTickets, latestTickets } = await getDashboardData();

  return (
    <div className="animate-slide-up space-y-8">
      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="relative p-8 sm:p-10">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-brand-50 to-transparent lg:block" />
          <div className="relative max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Kontrollpanel</p>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">
              Välkommen{user.name ? `, ${user.name}` : ""}
            </h1>
            <p className="mt-3 text-lg leading-8 text-slate-600">
              Här ser du dina aktiva ärenden, senaste status och nästa tydliga åtgärd.
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="text-sm font-medium text-slate-500">Totalt antal ärenden</p>
          <p className="mt-3 text-4xl font-extrabold text-slate-950">{totalTickets}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="text-sm font-medium text-slate-500">Öppna ärenden</p>
          <p className="mt-3 text-4xl font-extrabold text-warning-600">{openTickets}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="text-sm font-medium text-slate-500">Inloggad som</p>
          <p className="mt-3 truncate text-lg font-bold text-slate-950">{user.email}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Senaste ärenden</h2>
              <p className="mt-1 text-slate-500">Snabb överblick över vad som hänt senast.</p>
            </div>
            <Link href="/dashboard/felanmalan" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-brand-700">
              Ny felanmälan
            </Link>
          </div>

          {latestTickets.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {latestTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/felanmalan/${ticket.id}`}
                  className="block rounded-xl px-4 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-950">{ticket.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(ticket.created_at)}</p>
                    </div>
                    <span className="rounded-full border border-warning-100 bg-warning-50 px-3 py-1 text-xs font-bold text-warning-600">
                      {ticket.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <p className="font-semibold text-slate-800">Inga ärenden ännu</p>
              <p className="mt-2 text-sm text-slate-500">Skapa din första felanmälan för att börja följa status här.</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-950">Mina uppgifter</h2>
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Namn</dt>
              <dd className="mt-1 font-semibold text-slate-950">{user.name || "Ej angivet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">E-post</dt>
              <dd className="mt-1 font-semibold text-slate-950">{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Konto skapat</dt>
              <dd className="mt-1 font-semibold text-slate-950">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
