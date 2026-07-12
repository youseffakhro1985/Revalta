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
  public_reference: string | null;
  source: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  reporter_unit: string | null;
  assigned_to_id: string | null;
  ai_summary: string | null;
  ai_recommended_action: string | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
  due_date: string | null;
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
  attachments: Array<{
    id: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
    data_url: string;
    created_at: string;
  }>;
};

type TimelineItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
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
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [ticketResponse, teamResponse, timelineResponse] = await Promise.all([
          fetch(`/api/tickets/${params.id}`, { cache: "no-store" }),
          fetch("/api/team", { cache: "no-store" }),
          fetch(`/api/tickets/${params.id}/timeline`, { cache: "no-store" }),
        ]);

        if (ticketResponse.status === 401 || teamResponse.status === 401 || timelineResponse.status === 401) {
          router.push("/login");
          return;
        }

        const [ticketData, teamData, timelineData] = await Promise.all([
          ticketResponse.json(),
          teamResponse.json(),
          timelineResponse.json(),
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
        setTimeline(timelineData.timeline || []);
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
      setTimeline((current) => [
        {
          id: data.comment.id,
          type: "comment",
          title: "Kommentar",
          description: data.comment.body,
          created_at: data.comment.created_at,
        },
        ...current,
      ]);
      setComment("");
      setSuccess("Kommentaren är tillagd.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAttachment(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/tickets/${params.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte ladda upp bilagan");
        return;
      }

      setTicket((current) =>
        current ? { ...current, attachments: [data.attachment, ...current.attachments] } : current
      );
      setTimeline((current) => [
        {
          id: data.attachment.id,
          type: "attachment",
          title: "Bilaga uppladdad",
          description: data.attachment.file_name,
          created_at: data.attachment.created_at,
        },
        ...current,
      ]);
      setFile(null);
      setSuccess("Bilagan är uppladdad och storage-händelsen är loggad.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSaving(false);
    }
  }

  async function runAiAnalysis() {
    setError("");
    setSuccess("");
    setAnalyzing(true);

    try {
      const response = await fetch(`/api/tickets/${params.id}/ai`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Kunde inte AI-analysera ärendet");
        return;
      }

      setTicket((current) =>
        current
          ? {
              ...current,
              category: data.ticket.category,
              priority: data.ticket.priority,
              ai_summary: data.ticket.ai_summary,
              ai_recommended_action: data.ticket.ai_recommended_action,
              ai_confidence: data.ticket.ai_confidence,
              ai_processed_at: data.ticket.ai_processed_at,
            }
          : current
      );
      setPriority(data.ticket.priority);
      setSuccess("AI-analysen är klar och ärendet är uppdaterat.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-sand-100" />;
  }

  if (!ticket) {
    return <div className="rounded-2xl border border-danger-500 bg-danger-50 p-6 text-danger-600">{error || "Ärendet hittades inte"}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
      <Link href="/dashboard/felanmalan" className="inline-flex items-center text-sm font-semibold text-petroleum-600 hover:text-petroleum-700">
        Tillbaka till alla ärenden
      </Link>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-card">
          <div className="border-b border-sand-100 bg-ink-950 p-8 text-white">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-petroleum-700">Ärendedetaljer</p>
            <h1 className="text-3xl font-semibold tracking-tight">{ticket.title}</h1>
            <p className="mt-3 text-sm text-ink-500">
              #{ticket.id.slice(0, 8)} · Skapad {dateFormatter.format(new Date(ticket.created_at))}
              {ticket.due_date ? ` · SLA ${dateFormatter.format(new Date(ticket.due_date))}` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{statusLabels[ticket.status] || ticket.status}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{priorityLabels[ticket.priority] || ticket.priority}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{ticket.assigned_to ? `Ansvarig: ${ticket.assigned_to.name || ticket.assigned_to.email}` : "Ej tilldelad"}</span>
            </div>
          </div>

          <div className="space-y-8 p-8">
            {ticket.property && (
              <div className="rounded-2xl border border-petroleum-100 bg-petroleum-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-petroleum-600">Fastighet</p>
                <h2 className="mt-2 text-xl font-bold text-ink-950">{ticket.property.name}</h2>
                <p className="mt-1 text-sm text-ink-600">{ticket.property.address}, {ticket.property.city}</p>
              </div>
            )}

            {ticket.source === "public_portal" && (
              <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-card">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-400">Boendeportal</p>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Referens</p>
                    <p className="mt-1 font-bold text-ink-950">{ticket.public_reference}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Rapportör</p>
                    <p className="mt-1 font-bold text-ink-950">{ticket.reporter_name || "Ej angivet"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-400">E-post</p>
                    <p className="mt-1 text-sm text-ink-700">{ticket.reporter_email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Telefon / lägenhet</p>
                    <p className="mt-1 text-sm text-ink-700">{ticket.reporter_phone || "Ej angivet"} · {ticket.reporter_unit || "Ej angivet"}</p>
                  </div>
                </div>
              </div>
            )}

            <section>
              <h2 className="text-xl font-bold text-ink-950">Beskrivning</h2>
              <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-sand-100 bg-sand-50 p-6 leading-7 text-ink-700">
                {ticket.description}
              </div>
            </section>

            <section className="rounded-2xl border border-petroleum-100 bg-petroleum-50 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-ink-950">AI-insikt</h2>
                  <p className="mt-2 text-sm text-ink-600">
                    Kör en deterministisk dev-analys nu, och koppla riktig AI med `AI_PROVIDER_API_KEY` senare.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runAiAnalysis}
                  disabled={analyzing}
                  className="rounded-xl bg-petroleum-600 px-4 py-2 text-sm font-semibold text-white hover:bg-petroleum-700 disabled:opacity-70"
                >
                  {analyzing ? "Analyserar..." : "AI-analysera"}
                </button>
              </div>
              {ticket.ai_summary ? (
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-petroleum-600">Sammanfattning</p>
                    <p className="mt-2 text-sm text-ink-700">{ticket.ai_summary}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-petroleum-600">Rekommenderad åtgärd</p>
                    <p className="mt-2 text-sm text-ink-700">{ticket.ai_recommended_action}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-petroleum-600">Konfidens</p>
                    <p className="mt-2 text-2xl font-semibold text-ink-950">
                      {Math.round((ticket.ai_confidence || 0) * 100)}%
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            <section>
              <h2 className="text-xl font-bold text-ink-950">Bilagor</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ticket.attachments.length > 0 ? (
                  ticket.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.data_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-sand-100 bg-white p-4 shadow-card transition-colors hover:bg-sand-50"
                    >
                      <p className="font-bold text-ink-950">{attachment.file_name}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        {attachment.content_type} · {Math.ceil(attachment.size_bytes / 1024)} KB
                      </p>
                    </a>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-sand-200 bg-sand-50 p-6 text-sm text-ink-500">
                    Inga bilagor ännu.
                  </p>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-ink-950">Kommentarer</h2>
              <div className="mt-4 space-y-3">
                {ticket.comments.length > 0 ? (
                  ticket.comments.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-sand-100 bg-white p-4 shadow-card">
                      <p className="text-sm leading-6 text-ink-700">{item.body}</p>
                      <p className="mt-3 text-xs font-medium text-ink-400">
                        {item.user.name || item.user.email} · {dateFormatter.format(new Date(item.created_at))}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-sand-200 bg-sand-50 p-6 text-sm text-ink-500">Inga kommentarer ännu.</p>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-ink-950">Tidslinje</h2>
              <div className="mt-4 space-y-3">
                {timeline.length > 0 ? (
                  timeline.map((item) => (
                    <div key={`${item.type}-${item.id}`} className="rounded-2xl border border-sand-100 bg-white p-4 shadow-card">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold text-ink-950">{item.title}</p>
                          <p className="mt-1 text-sm text-ink-600">{item.description}</p>
                        </div>
                        <span className="text-xs font-medium text-ink-400">
                          {dateFormatter.format(new Date(item.created_at))}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-sand-200 bg-sand-50 p-6 text-sm text-ink-500">Ingen historik ännu.</p>
                )}
              </div>
            </section>
          </div>
        </article>

        <aside className="space-y-6">
          <form onSubmit={updateTicket} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-ink-950">Styr ärendet</h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Status</label>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border border-sand-200 bg-white p-3">
                  <option value="new">Ny</option>
                  <option value="received">Mottagen</option>
                  <option value="in_progress">Pågår</option>
                  <option value="waiting">Väntar</option>
                  <option value="completed">Klar</option>
                  <option value="closed">Stängd</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Prioritet</label>
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-xl border border-sand-200 bg-white p-3">
                  <option value="low">Låg</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hög</option>
                  <option value="urgent">Akut</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Ansvarig</label>
                <select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className="w-full rounded-xl border border-sand-200 bg-white p-3">
                  <option value="">Ej tilldelad</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email}</option>
                  ))}
                </select>
              </div>
              <button disabled={saving} className="w-full rounded-xl bg-petroleum-600 px-5 py-3 font-semibold text-white hover:bg-petroleum-700 disabled:opacity-70">
                {saving ? "Sparar..." : "Spara ändringar"}
              </button>
            </div>
          </form>

          <form onSubmit={addComment} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-ink-950">Lägg kommentar</h2>
            <textarea required rows={4} value={comment} onChange={(event) => setComment(event.target.value)} className="mt-4 w-full rounded-xl border border-sand-200 p-3" placeholder="Skriv nästa åtgärd eller uppdatering..." />
            <button disabled={saving} className="mt-4 w-full rounded-xl bg-ink-950 px-5 py-3 font-semibold text-white hover:bg-ink-800 disabled:opacity-70">
              {saving ? "Sparar..." : "Lägg till kommentar"}
            </button>
          </form>

          <form onSubmit={uploadAttachment} className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-ink-950">Ladda upp bilaga</h2>
            <p className="mt-2 text-sm text-ink-500">PNG, JPG, WebP, PDF eller TXT upp till 1 MB i dev-läge.</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="mt-4 block w-full rounded-xl border border-sand-200 p-3 text-sm"
            />
            <button disabled={saving || !file} className="mt-4 w-full rounded-xl bg-ink-950 px-5 py-3 font-semibold text-white hover:bg-ink-800 disabled:opacity-70">
              {saving ? "Laddar upp..." : "Ladda upp"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
