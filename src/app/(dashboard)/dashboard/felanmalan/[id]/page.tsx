"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
};

type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  assigned_to_id: string | null;
  created_at: string;
  updated_at: string;
  property: {
    name: string;
    address: string;
    city: string;
  } | null;
  assigned_to: TeamMember | null;
  comments: Array<{
    id: string;
    body: string;
    is_internal: boolean;
    created_at: string;
    user: {
      name: string | null;
      email: string;
    };
  }>;
};

const statusLabels: Record<string, string> = {
  new: "Ny",
  received: "Mottagen",
  in_progress: "Pågår",
  waiting: "Väntar",
  completed: "Klar",
  closed: "Stängd",
};

const priorityLabels: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [ticketResponse, teamResponse] = await Promise.all([
          fetch(`/api/tickets/${params.id}`, { cache: "no-store" }),
          fetch("/api/team", { cache: "no-store" }),
        ]);

        if (ticketResponse.status === 401 || teamResponse.status === 401) {
          router.push("/login");
          return;
        }

        const [ticketData, teamData] = await Promise.all([
          ticketResponse.json(),
          teamResponse.json(),
        ]);

        if (!isMounted) return;

        if (!ticketResponse.ok) {
          setError(ticketData.error || "Kunde inte hämta ärendet");
          return;
        }

        setTicket(ticketData.ticket);
        setStatus(ticketData.ticket.status);
        setPriority(ticketData.ticket.priority);
        setAssignedToId(ticketData.ticket.assigned_to_id || "");
        setMembers(teamData.members || []);
      } catch {
        if (isMounted) setError("Kunde inte kontakta servern");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [params.id, router]);

  async function updateTicket(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tickets/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority, assignedToId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte uppdatera ärendet");
        return;
      }

      setTicket((current) =>
        current
          ? {
              ...current,
              status: data.ticket.status,
              priority: data.ticket.priority,
              assigned_to: data.ticket.assigned_to,
              assigned_to_id: data.ticket.assigned_to?.id || null,
            }
          : current
      );
      setSuccess("Ärendet är uppdaterat.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSaving(false);
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tickets/${params.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte lägga till kommentaren");
        return;
      }

      setTicket((current) =>
        current ? { ...current, comments: [...current.comments, data.comment] } : current
      );
      setComment("");
      setSuccess("Kommentaren är tillagd.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />;
  }

  if (!ticket) {
    return <div className="rounded-2xl border border-danger-500 bg-danger-50 p-6 text-danger-600">{error || "Ärendet hittades inte"}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <Link href="/dashboard/felanmalan" className="inline-flex items-center text-sm font-semibold text-brand-600 hover:text-brand-700">
        Tillbaka till alla ärenden
      </Link>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 bg-slate-950 p-8 text-white">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-200">Ärendedetaljer</p>
            <h1 className="text-3xl font-extrabold tracking-tight">{ticket.title}</h1>
            <p className="mt-3 text-sm text-slate-300">
              #{ticket.id.slice(0, 8)} · Skapad {dateFormatter.format(new Date(ticket.created_at))}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{statusLabels[ticket.status] || ticket.status}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{priorityLabels[ticket.priority] || ticket.priority}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{ticket.assigned_to ? `Ansvarig: ${ticket.assigned_to.name || ticket.assigned_to.email}` : "Ej tilldelad"}</span>
            </div>
          </div>

          <div className="space-y-8 p-8">
            {ticket.property && (
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Fastighet</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{ticket.property.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{ticket.property.address}, {ticket.property.city}</p>
              </div>
            )}

            <section>
              <h2 className="text-xl font-bold text-slate-950">Beskrivning</h2>
              <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50 p-6 leading-7 text-slate-700">
                {ticket.description}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Kommentarer</h2>
              <div className="mt-4 space-y-3">
                {ticket.comments.length > 0 ? (
                  ticket.comments.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                      <p className="text-sm leading-6 text-slate-700">{item.body}</p>
                      <p className="mt-3 text-xs font-medium text-slate-400">
                        {item.user.name || item.user.email} · {dateFormatter.format(new Date(item.created_at))}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Inga kommentarer ännu.</p>
                )}
              </div>
            </section>
          </div>
        </article>

        <aside className="space-y-6">
          <form onSubmit={updateTicket} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-slate-950">Styr ärendet</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3">
                  <option value="new">Ny</option>
                  <option value="received">Mottagen</option>
                  <option value="in_progress">Pågår</option>
                  <option value="waiting">Väntar</option>
                  <option value="completed">Klar</option>
                  <option value="closed">Stängd</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Prioritet</label>
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3">
                  <option value="low">Låg</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hög</option>
                  <option value="urgent">Akut</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Ansvarig</label>
                <select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3">
                  <option value="">Ej tilldelad</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email}</option>
                  ))}
                </select>
              </div>
              <button disabled={saving} className="w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-70">
                {saving ? "Sparar..." : "Spara ändringar"}
              </button>
            </div>
          </form>

          <form onSubmit={addComment} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-slate-950">Lägg kommentar</h2>
            <textarea required rows={4} value={comment} onChange={(event) => setComment(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 p-3" placeholder="Skriv nästa åtgärd eller uppdatering..." />
            <button disabled={saving} className="mt-4 w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-70">
              {saving ? "Sparar..." : "Lägg till kommentar"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
