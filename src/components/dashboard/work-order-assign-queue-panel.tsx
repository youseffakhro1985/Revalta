"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
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
  workOrderNumber: string | null;
  propertyName: string;
  href: string;
};

type QueuePayload = {
  summary?: { workOrders: number };
  selfId?: string;
  assignees?: Assignee[];
  workOrders?: QueueItem[];
  error?: string;
};

type LockPayload = {
  error?: string;
  lock?: { token?: string; version?: string };
};

async function releaseLock(workOrderId: string, token: string) {
  try {
    await fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", token }),
    });
  } catch {
    // The assignment may already have succeeded; a leftover short lease expires on its own.
  }
}

export function WorkOrderAssignQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [selfId, setSelfId] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");
  const [itemError, setItemError] = useState("");

  const applyQueue = useCallback((body: QueuePayload) => {
    const nextItems = body.workOrders || [];
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
    const response = await fetch("/api/work-orders/unassigned-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta otilldelade arbetsordrar");
    applyQueue(body);
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/work-orders/unassigned-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta otilldelade arbetsordrar");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta otilldelade arbetsordrar");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyQueue]);

  async function assign(item: QueueItem, assigneeId: string) {
    if (!assigneeId) {
      setItemError("Välj en ansvarig innan du tilldelar.");
      return;
    }
    setActingId(item.id);
    setItemError("");
    let token = "";
    try {
      const lockResponse = await fetch(`/api/work-orders/${item.id}/edit-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acquire", leaseSeconds: 120 }),
      });
      const lockBody = await readResponseJson<LockPayload>(lockResponse);
      if (lockResponse.status === 423) {
        throw new Error(lockBody.error || "Arbetsordern redigeras av någon annan.");
      }
      if (!lockResponse.ok) throw new Error(lockBody.error || "Kunde inte låsa arbetsordern för redigering");
      token = String(lockBody.lock?.token || "");
      const version = typeof lockBody.lock?.version === "string" ? lockBody.lock.version : "";
      if (!token || !version) throw new Error("Redigeringslåset saknar token eller version");

      const response = await fetch(`/api/work-orders/${item.id}/locked-update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: assigneeId, editToken: token, version }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte tilldela arbetsordern");
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte tilldela arbetsordern");
      try {
        await loadQueue();
      } catch {
        // Keep the local error; the list is still the last successful snapshot.
      }
    } finally {
      if (token) await releaseLock(item.id, token);
      setActingId("");
    }
  }

  if (hidden) return null;

  return (
    <OverviewPanel title="Otilldelade arbetsordrar" description="Tilldela tekniker här. Samma redigeringslås som i Planering." bodyClassName="p-0">
      <div className="space-y-3 px-5 py-4">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        {loading ? <div className="h-32 animate-pulse rounded-xl bg-sand-100" aria-hidden="true" /> : null}
      </div>
      {!loading && !error && items.length === 0 ? (
        <OverviewEmpty icon={Wrench} title="Inga otilldelade arbetsordrar" description="Kön är tom — alla aktiva arbetsordrar har en ansvarig." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="divide-y divide-sand-100">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink-900">{item.title}</p>
                  {item.priority === "urgent" ? (
                    <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700">Akut</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {item.workOrderNumber || "Arbetsorder"} · {item.propertyName} · {item.statusLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`work-order-assignee-${item.id}`}>Ansvarig</label>
                <select
                  id={`work-order-assignee-${item.id}`}
                  value={selected[item.id] || ""}
                  onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}
                  disabled={Boolean(actingId)}
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
                  disabled={Boolean(actingId)}
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
