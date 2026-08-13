"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MessageSquareText, Send } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  PageHeader,
  Panel,
  premiumPrimaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { OPERATIONS_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/domain-labels";
import { readResponseJson } from "@/lib/fetch-json";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { type: "resident" | "management"; name: string };
};

type Ticket = {
  id: string;
  public_reference: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  reporter_name: string | null;
  reporter_unit: string | null;
  created_at: string;
  updated_at: string;
  property: { name: string; address: string; city: string } | null;
  comments: Comment[];
};

const categoryLabels: Record<string, string> = {
  maintenance: "Underhåll",
  plumbing: "VVS",
  electrical: "El",
  heating: "Värme",
  access: "Passage",
  noise: "Störning",
  other: "Övrigt",
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function ResidentTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id || "";
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/resident-portal/tickets/${ticketId}`, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setTicket(null);
        setError(data.error || "Kunde inte hämta ärendet");
        return;
      }
      setTicket(data.ticket);
      setCanComment(Boolean(data.canComment));
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!ticketId || !commentBody.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/resident-portal/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) {
        setError(data.error || "Kunde inte skicka kommentaren");
        return;
      }
      setCommentBody("");
      setSuccess("Kommentaren är skickad.");
      setTicket((current) => (
        current
          ? { ...current, comments: [...current.comments, data.comment] }
          : current
      ));
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Min boendeservice"
        title={ticket?.title || "Ärende"}
        description="Följ status och läs delade uppdateringar från förvaltningen."
        action={(
          <Link
            href="/dashboard/boendeportal"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 transition hover:bg-sand-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Tillbaka
          </Link>
        )}
      />

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

      {loading ? (
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-2xl bg-sand-100" />
          <div className="h-56 animate-pulse rounded-2xl bg-sand-100" />
        </div>
      ) : !ticket ? (
        <Panel>
          <EmptyState
            title="Ärendet hittades inte"
            description="Det kan ha flyttats eller så saknar du behörighet att se det."
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">
                  {ticket.public_reference || "Utan referens"}
                  {ticket.property ? ` · ${ticket.property.name}` : ""}
                  {ticket.reporter_unit ? ` · ${ticket.reporter_unit}` : ""}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink-900">
                  {ticket.title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600">{ticket.description}</p>
                <p className="mt-3 text-xs text-ink-500">
                  {categoryLabels[ticket.category] || ticket.category}
                  {" · "}
                  Skapad {dateFormatter.format(new Date(ticket.created_at))}
                  {" · "}
                  Uppdaterad {dateFormatter.format(new Date(ticket.updated_at))}
                </p>
                {ticket.property ? (
                  <p className="mt-1 text-xs text-ink-500">
                    {ticket.property.address}, {ticket.property.city}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-petroleum-50 px-3 py-1 text-xs font-semibold text-petroleum-800">
                  {OPERATIONS_STATUS_LABELS[ticket.status] || ticket.status}
                </span>
                <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-700">
                  {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                </span>
              </div>
            </div>
          </Panel>

          <Panel
            title="Uppdateringar"
            description="Delade meddelanden mellan dig och förvaltningen. Interna anteckningar visas inte."
          >
            {ticket.comments.length === 0 ? (
              <EmptyState
                title="Inga uppdateringar ännu"
                description="När förvaltningen svarar syns det här. Du kan också skicka en egen kommentar."
              />
            ) : (
              <ul className="space-y-3">
                {ticket.comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-xl border border-sand-200 bg-sand-50/70 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        comment.author.type === "resident"
                          ? "bg-white text-ink-600"
                          : "bg-petroleum-50 text-petroleum-800"
                      }`}
                      >
                        {comment.author.type === "resident" ? "Du / boende" : "Förvaltningen"}
                      </span>
                      <span className="text-xs font-medium text-ink-700">{comment.author.name}</span>
                      <span className="text-xs text-ink-500">
                        {dateFormatter.format(new Date(comment.created_at))}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {canComment ? (
              <form onSubmit={submitComment} className="mt-6 space-y-3 border-t border-sand-200 pt-6">
                <label htmlFor="resident-ticket-comment" className="flex items-center gap-2 text-sm font-medium text-ink-700">
                  <MessageSquareText className="h-4 w-4 text-petroleum-700" aria-hidden="true" />
                  Skicka kommentar
                </label>
                <textarea
                  id="resident-ticket-comment"
                  required
                  minLength={2}
                  maxLength={5000}
                  rows={4}
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Beskriv till exempel om felet kvarstår eller om du har kompletterande information…"
                  className={premiumTextareaClass}
                />
                <button type="submit" disabled={saving || !commentBody.trim()} className={premiumPrimaryButtonClass}>
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                  {saving ? "Skickar…" : "Skicka kommentar"}
                </button>
              </form>
            ) : null}
          </Panel>
        </>
      )}
    </div>
  );
}
