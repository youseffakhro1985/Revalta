import Link from "next/link";
import db from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

const priorityLabels: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

const statusLabels: Record<string, string> = {
  new: "Ny",
  received: "Mottagen",
  under_review: "Under bedömning",
  planned: "Planerad",
  in_progress: "Pågående",
  waiting_material: "Väntar material",
  waiting_external: "Väntar extern part",
  completed: "Klar",
  closed: "Stängd",
  rejected: "Avvisad",
};

export default async function Dashboard() {
  const user = await requireUser();
  const companyId = user.activeCompany.id;

  const [ticketCount, openTicketCount, propertyCount, latestTickets] = await Promise.all([
    db.ticket.count({ where: { companyId, deletedAt: null } }),
    db.ticket.count({ where: { companyId, deletedAt: null, status: { notIn: ["closed", "rejected"] } } }),
    db.property.count({ where: { companyId, deletedAt: null } }),
    db.ticket.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const highRiskCount = latestTickets.filter((ticket) => (ticket.aiRiskScore ?? 0) >= 70).length;

  return (
    <div className="space-y-8 animate-slide-up">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Dashboard</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950">
            Välkommen, {user.firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            En samlad styrvy för {user.activeCompany.companyName}: ärenden, AI-risker och operativ status.
          </p>
        </div>
        <Link
          href="/dashboard/felanmalan"
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-card hover:bg-slate-800"
        >
          Skapa felanmälan
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Totalt ärenden", ticketCount],
          ["Öppna ärenden", openTicketCount],
          ["Fastigheter", propertyCount],
          ["AI-markerad risk", highRiskCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 p-6">
            <h2 className="text-lg font-bold text-slate-950">Senaste ärenden</h2>
            <p className="mt-1 text-sm text-slate-500">Riktig data från ärendemodulen, sorterad på nyast först.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {latestTickets.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-semibold text-slate-900">Inga felanmälningar ännu</p>
                <p className="mt-1 text-sm text-slate-500">Skapa ditt första ärende för att aktivera AI-analysen.</p>
              </div>
            ) : (
              latestTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/felanmalan/${ticket.id}`}
                  className="flex flex-col gap-3 p-5 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{ticket.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{ticket.aiSummary ?? ticket.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ticket.priority === "urgent" || ticket.priority === "high" ? "warning" : "secondary"}>
                      {priorityLabels[ticket.priority]}
                    </Badge>
                    <Badge variant="outline">{statusLabels[ticket.status] ?? ticket.status}</Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-card">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">AI-insikter</p>
          <h2 className="mt-3 text-2xl font-bold">Beslutsstöd för ärenden</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            AI föreslår kategori, prioritet, risknivå, sammanfattning och nästa steg när nya felanmälningar skapas.
            Förslagen visas som beslutsstöd och kräver mänsklig bedömning.
          </p>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-300">Senaste högriskärenden i listan</p>
            <p className="mt-2 text-3xl font-bold">{highRiskCount}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
