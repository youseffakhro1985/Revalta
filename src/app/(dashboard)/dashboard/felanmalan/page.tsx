import Link from "next/link";
import db from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { TicketCreateForm } from "./ticket-create-form";

export const dynamic = "force-dynamic";

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

const priorityLabels: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

export default async function FelanmalanPage() {
  const user = await requireUser();
  const tickets = await db.ticket.findMany({
    where: {
      companyId: user.activeCompany.id,
      deletedAt: null,
    },
    include: {
      property: true,
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Felanmälan</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Ärenden</h1>
          <p className="mt-2 text-slate-600">
            Skapa, följ upp och prioritera ärenden med AI-beslutsstöd.
          </p>
        </div>
        <Badge variant="outline">{tickets.length} ärenden</Badge>
      </div>
      
      <TicketCreateForm />

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card animate-slide-up">
        <div className="border-b border-slate-100 bg-slate-50/60 p-6">
          <h2 className="text-lg font-bold text-slate-950">Pågående ärenden</h2>
          <p className="mt-1 text-sm text-slate-500">Alla ärenden visas inom ditt företag och är skyddade med tenant-scope.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {tickets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <p className="font-semibold text-slate-900">Inga felanmälningar ännu.</p>
              <p className="mt-1 text-sm text-slate-500">När du skapar ett ärende visas AI-förslag direkt här.</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/felanmalan/${ticket.id}`}
                className="grid gap-4 p-5 transition hover:bg-slate-50 md:grid-cols-[1fr_180px_160px]"
              >
                <div>
                  <p className="font-semibold text-slate-950">{ticket.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{ticket.aiSummary ?? ticket.description}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {ticket.property?.name ?? ticket.propertyText ?? "Ingen fastighet angiven"} - {new Intl.DateTimeFormat("sv-SE").format(ticket.createdAt)}
                  </p>
                </div>
                <div className="flex items-start gap-2 md:justify-end">
                  <Badge variant={ticket.priority === "urgent" || ticket.priority === "high" ? "warning" : "secondary"}>
                    {priorityLabels[ticket.priority]}
                  </Badge>
                  <Badge variant="outline">{statusLabels[ticket.status]}</Badge>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-900">AI-förslag</p>
                  <p className="mt-1 text-slate-500">
                    {ticket.aiRiskLevel ?? "låg"} risk - {ticket.aiConfidence ? Math.round(ticket.aiConfidence * 100) : 0}% säkerhet
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
