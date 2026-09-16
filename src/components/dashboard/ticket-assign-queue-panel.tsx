"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { OverviewEmpty, OverviewPanel } from "@/components/dashboard/overview-chrome";
import { InlineAlert, premiumCompactButtonClass, premiumFieldClass } from "@/components/dashboard/premium-ui";

type Assignee = { id: string; name: string; role: string };
type QueueItem = {
  id: string;
  title: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  publicReference: string | null;
  propertyName: string;
  href: string;
};

type QueuePayload = {
  summary?: { tickets: number };
  selfId?: string;
  assignees?: Assignee[];
  tickets?: QueueItem[];
  error?: string;
};

export function TicketAssignQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [selfId, setSelfId] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");
  const [itemError, setItemError] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const applyQueue = useCallback((body: QueuePayload) => {
    const nextItems = body.tickets || [];
    setItems(nextItems);
    setAssignees(body.assignees || []);
    setSelfId(body.selfId || "");
    setSelected((current) => {
      const next = { ...current };
      for (const item of nextItems) {
        if (!next[item.id]) next[item.id] = body.selfId || "";
      }
      return next;
    });
  }, []);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/tickets/unassigned-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta otilldelade ärenden");
    applyQueue(body);
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/tickets/unassigned-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta otilldelade ärenden");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta otilldelade ärenden");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyQueue]);

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#arendefilter") return;
    document.getElementById("arendefilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  async function assign(item: QueueItem, assigneeId: string) {
    if (!assigneeId) {
      setItemError("Välj en ansvarig innan du tilldelar.");
      return;
    }
    setActingId(item.id);
    setItemError("");
    try {
      const response = await fetch(`/api/tickets/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: assigneeId }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte tilldela ärendet");
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte tilldela ärendet");
      try {
        await loadQueue();
      } catch {
        // Keep the local error; the list is still the last successful snapshot.
      }
    } finally {
      setActingId("");
    }
  }

  if (hidden) return null;

  const visibleItems = priorityFilter === "all" ? items : items.filter((item) => item.priority === "urgent");
  const formLocked = Boolean(actingId) || loading;

  return (
    <OverviewPanel title="Otilldelade ärenden" description="Tilldela ansvarig här. Samma PATCH som på ärendet — den tilldelade får mejl." bodyClassName="p-0">
      <div id="arendefilter" className="scroll-mt-36 space-y-3 px-5 py-4">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        <form id="arendefilter-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading} className="contents">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Filtrera kön</span>
              <select autoFocus value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className={`${premiumFieldClass} text-sm`} aria-label="Filtrera otilldelade ärenden">
                <option value="all">Alla prioriteringar</option>
                <option value="urgent">Akut</option>
              </select>
            </label>
          </fieldset>
        </form>
        {loading ? <p className="text-sm text-ink-500">Kön hämtas.</p> : null}
      </div>
      {!loading && !error && items.length === 0 ? (
        <OverviewEmpty icon={ClipboardList} title="Inga otilldelade ärenden" description="Kön är tom — alla öppna ärenden har en ansvarig." />
      ) : null}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 ? (
        <OverviewEmpty icon={ClipboardList} title="Inga ärenden matchar filtret" description="Ändra prioriteringsfiltret för att visa fler otilldelade ärenden." />
      ) : null}
      {!loading && !error && visibleItems.length > 0 ? (
        <div className="divide-y divide-sand-100">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink-900">{item.title}</p>
                  {item.priority === "urgent" ? (
                    <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700">Akut</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {item.publicReference || "Ärende"} · {item.propertyName} · {item.statusLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`ticket-assignee-${item.id}`}>Ansvarig</label>
                <select
                  id={`ticket-assignee-${item.id}`}
                  value={selected[item.id] || ""}
                  onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}
                  disabled={formLocked}
                  className={`${premiumFieldClass} h-9 min-w-[10rem] text-sm`}
                >
                  <option value="">Välj ansvarig</option>
                  {assignees.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}{member.id === selfId ? " · jag" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={formLocked}
                  onClick={() => void assign(item, selected[item.id] || "")}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actingId === item.id ? "Tilldelar…" : "Tilldela"}
                </button>
                <Link href={item.href} className={premiumCompactButtonClass}>
                  Öppna
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </OverviewPanel>
  );
}
