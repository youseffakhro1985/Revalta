"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { Clock3, MessageSquareText, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, InlineAlert, Panel, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Actor = { id: string; name: string | null; email: string };
type CommentItem = {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  user: Actor;
};
type HistoryItem = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: Actor | null;
};

type Props = {
  entityType: "work_order" | "project";
  entityId: string;
};

const actionLabels: Record<string, string> = {
  "work_order.created": "Arbetsordern skapades",
  "work_order.updated": "Arbetsordern uppdaterades",
  "work_order.comment_added": "Kommentar lades till",
  "project.created": "Projektet skapades",
  "project.updated": "Projektet uppdaterades",
  "project.comment_added": "Kommentar lades till",
  "document.uploaded": "Dokument laddades upp",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function actorName(actor: Actor | null) {
  return actor?.name || actor?.email || "Systemet";
}

export function OperationalActivityPanel({ entityType, entityId }: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(true);

  const endpoint = useMemo(
    () => entityType === "work_order" ? `/api/work-orders/${entityId}/comments` : `/api/projects/${entityId}/comments`,
    [entityId, entityType],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta aktivitet");
      setComments(data.comments || []);
      setHistory(data.history || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta aktivitet");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, isInternal }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara kommentaren");
      setBody("");
      setSuccess("Kommentaren har sparats.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara kommentaren");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Kommentarer" description="Samla beslut, intern dialog och information som kan delas vidare.">
        <div className="space-y-5">
          {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

          <form onSubmit={submit} className="space-y-3 rounded-2xl border border-sand-200 bg-sand-50/70 p-4">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={5000}
              required
              placeholder="Skriv en tydlig kommentar eller ett beslut…"
              aria-label="Skriv en kommentar"
              className="min-h-28 w-full resize-y rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-ink-600">
                <input type="checkbox" checked={isInternal} onChange={(event) => setIsInternal(event.target.checked)} className="h-4 w-4 rounded border-sand-300 text-petroleum-700 focus:ring-petroleum-500" />
                Endast internt
              </label>
              <button disabled={saving || !body.trim()} className={`${premiumPrimaryButtonClass} inline-flex items-center justify-center gap-2`}>
                <Send className="h-4 w-4" />
                {saving ? "Sparar…" : "Spara kommentar"}
              </button>
            </div>
          </form>

          {loading ? (
            <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-sand-100" />)}</div>
          ) : comments.length === 0 ? (
            <EmptyState title="Inga kommentarer ännu" description="Lägg till den första kommentaren för att samla dialog och beslut på objektet." />
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <article key={comment.id} className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl bg-petroleum-50 p-2 text-petroleum-700"><MessageSquareText className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{actorName(comment.user)}</p>
                        <p className="text-xs text-ink-400">{formatDate(comment.created_at)}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${comment.is_internal ? "bg-sand-100 text-ink-600" : "bg-petroleum-50 text-petroleum-800"}`}>
                      {comment.is_internal ? "Internt" : "Delat"}
                    </span>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-700">{comment.body}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Aktivitet och historik" description="Spårbar tidslinje över viktiga ändringar, kommentarer och dokument.">
        {loading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-sand-100" />)}</div>
        ) : history.length === 0 ? (
          <EmptyState title="Ingen historik ännu" description="När objektet uppdateras visas händelserna här i kronologisk ordning." />
        ) : (
          <ol className="relative space-y-0 border-l border-sand-200 pl-6">
            {history.map((item) => (
              <li key={item.id} className="relative pb-6 last:pb-0">
                <span className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-4 border-white bg-petroleum-700" />
                <div className="rounded-2xl border border-sand-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-petroleum-700" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{actionLabels[item.action] || item.action.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs text-ink-500">{actorName(item.actor)} · {formatDate(item.created_at)}</p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
