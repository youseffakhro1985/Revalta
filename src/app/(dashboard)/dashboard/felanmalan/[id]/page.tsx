import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import db from "@/lib/db";
import { verifyToken } from "@/lib/session";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    redirect("/login");
  }

  const ticket = await db.ticket.findFirst({
    where: {
      id,
      user_id: session.sub,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      property: {
        select: {
          name: true,
          address: true,
          postal_code: true,
          city: true,
        },
      },
      created_at: true,
    },
  });

  if (!ticket) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
      <Link href="/dashboard/felanmalan" className="inline-flex items-center text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700">
        <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Tillbaka till alla ärenden
      </Link>

      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 bg-slate-50/70 p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Ärendedetaljer</p>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">{ticket.title}</h1>
              <p className="mt-3 text-sm font-medium text-slate-500">
                Ärende #{ticket.id.slice(0, 8)} · Skapad {formatDate(ticket.created_at)}
              </p>
            </div>
            <span className="w-fit rounded-full border border-warning-100 bg-warning-50 px-4 py-1.5 text-sm font-bold text-warning-600">
              {ticket.status}
            </span>
          </div>
        </div>

        <div className="p-8">
          {ticket.property && (
            <div className="mb-8 rounded-2xl border border-brand-100 bg-brand-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Fastighet</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">{ticket.property.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {ticket.property.address}
                {ticket.property.postal_code ? `, ${ticket.property.postal_code}` : ""} {ticket.property.city}
              </p>
            </div>
          )}

          <h2 className="text-xl font-bold text-slate-950">Beskrivning</h2>
          <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50 p-6 leading-7 text-slate-700">
            {ticket.description}
          </div>
        </div>
      </article>
    </div>
  );
}
