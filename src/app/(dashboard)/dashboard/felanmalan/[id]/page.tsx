import Link from "next/link";
import { notFound } from "next/navigation";
import db from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

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

const categoryLabels: Record<string, string> = {
  vvs: "VVS",
  el: "El",
  ventilation: "Ventilation",
  locks_access: "Lås/passage",
  damage: "Skada",
  cleaning: "Städ",
  outdoor: "Utemiljö",
  laundry: "Tvättstuga",
  elevator: "Hiss",
  security: "Säkerhet",
  other: "Övrigt",
};

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const ticket = await db.ticket.findFirst({
    where: {
      id: params.id,
      companyId: user.activeCompany.id,
      deletedAt: null,
    },
    include: {
      property: true,
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      history: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });

  if (!ticket) notFound();

  const createdAt = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(ticket.createdAt);

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <Link href="/dashboard/felanmalan" className="inline-flex items-center text-sm font-semibold text-brand-700 hover:text-brand-900">
        <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Tillbaka till alla ärenden
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Ärendedetalj</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{ticket.title}</h1>
              <p className="mt-2 text-sm text-slate-500">
                Skapad {createdAt}
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{statusLabels[ticket.status]}</Badge>
              <Badge variant={ticket.priority === "urgent" || ticket.priority === "high" ? "warning" : "secondary"}>
                {ticket.priority === "urgent" ? "Akut" : ticket.priority === "high" ? "Hög" : ticket.priority === "low" ? "Låg" : "Normal"}
              </Badge>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Info label="Kategori" value={categoryLabels[ticket.category]} />
            <Info label="Fastighet" value={ticket.property?.name ?? ticket.propertyText ?? "Ej angiven"} />
            <Info label="Skapad av" value={ticket.createdBy ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}` : "System"} />
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-slate-950">Beskrivning</h2>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-5 leading-7 text-slate-700">
              {ticket.description}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-slate-950">Historik</h2>
            <div className="mt-3 space-y-3">
              {ticket.history.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Ingen historik ännu.</p>
              ) : (
                ticket.history.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-slate-100 p-4 text-sm">
                    <p className="font-semibold text-slate-900">{event.action.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-slate-500">
                      {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(event.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-card">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">AI-förslag</p>
            <h2 className="mt-3 text-2xl font-bold">Risk och nästa steg</h2>
            <div className="mt-5 space-y-4 text-sm">
              <InfoDark label="Föreslagen kategori" value={categoryLabels[ticket.aiCategory ?? ticket.category] ?? "Övrigt"} />
              <InfoDark label="Föreslagen prioritet" value={ticket.aiPriority ?? ticket.priority} />
              <InfoDark label="Risknivå" value={`${ticket.aiRiskLevel ?? "låg"} (${ticket.aiRiskScore ?? 0}/100)`} />
              <InfoDark label="Säkerhet" value={`${ticket.aiConfidence ? Math.round(ticket.aiConfidence * 100) : 0}%`} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="font-bold text-slate-950">AI-sammanfattning</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{ticket.aiSummary ?? "Ingen AI-sammanfattning sparad."}</p>
            <h3 className="mt-6 text-sm font-bold text-slate-950">Rekommenderad åtgärd</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{ticket.aiRecommendedAction ?? "Manuell bedömning rekommenderas."}</p>
            <h3 className="mt-6 text-sm font-bold text-slate-950">Svarsförslag</h3>
            <p className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{ticket.aiReplyDraft ?? "Saknas."}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function InfoDark({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 font-semibold text-white">{value}</p>
    </div>
  );
}
