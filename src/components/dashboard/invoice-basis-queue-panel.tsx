"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel, premiumCompactButtonClass, premiumFieldClass } from "@/components/dashboard/premium-ui";

type QueueItem = {
  id: string;
  title: string;
  statusLabel: string;
  propertyName: string;
  approvedTime: number;
  approvedMaterial: number;
  draftStatus: "missing" | "empty" | "built";
  draftStatusLabel: string;
  customerName?: string;
  href: string;
};

type QueuePayload = {
  summary?: { workOrders: number; approvedTime: number; approvedMaterial: number };
  workOrders?: QueueItem[];
  error?: string;
};

export function InvoiceBasisQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState({ workOrders: 0, approvedTime: 0, approvedMaterial: 0 });
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");
  const [itemError, setItemError] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("all");

  const applyQueue = useCallback((body: QueuePayload) => {
    const nextItems = body.workOrders || [];
    setItems(nextItems);
    setSummary(body.summary || { workOrders: 0, approvedTime: 0, approvedMaterial: 0 });
    setNames((current) => {
      const next = { ...current };
      for (const item of nextItems) {
        if (next[item.id] === undefined) next[item.id] = item.customerName || "";
      }
      return next;
    });
  }, []);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/work-orders/invoice-basis-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för fakturaunderlag");
    applyQueue(body);
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/work-orders/invoice-basis-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för fakturaunderlag");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta kön för fakturaunderlag");
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
    if (window.location.hash !== "#underlagfilter") return;
    document.getElementById("underlagfilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  async function rebuild(item: QueueItem) {
    setActingId(item.id);
    setItemError("");
    try {
      const response = await fetch(`/api/work-orders/${item.id}/invoice-basis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte bygga fakturaunderlag");
      await loadQueue();
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte bygga fakturaunderlag");
      try {
        await loadQueue();
      } catch {
        // Keep the local error; the list is still the last successful snapshot.
      }
    } finally {
      setActingId("");
    }
  }

  async function markReady(item: QueueItem) {
    const customerName = (names[item.id] || "").trim();
    if (!customerName) {
      setItemError("Kundnamn krävs för att markera fakturaunderlaget som klart.");
      return;
    }
    setActingId(item.id);
    setItemError("");
    try {
      const response = await fetch(`/api/work-orders/${item.id}/invoice-basis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markReady", customerName }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte markera underlaget som klart");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSummary((current) => ({
        workOrders: Math.max(0, current.workOrders - 1),
        approvedTime: Math.max(0, current.approvedTime - item.approvedTime),
        approvedMaterial: Math.max(0, current.approvedMaterial - item.approvedMaterial),
      }));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte markera underlaget som klart");
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

  const visibleItems = statusFilter === "all" ? items : items.filter((item) => item.draftStatus === statusFilter);
  const formLocked = Boolean(actingId) || loading;

  return (
    <Panel
      icon={ReceiptText}
      title="Fakturaunderlag"
      description="Bygg utkast från attesterad tid och material, ange kundnamn och markera underlaget som klart här."
    >
      <div id="underlagfilter" className="scroll-mt-36 space-y-3">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        <form id="underlagfilter-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading} className="contents">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Filtrera underlag</span>
              <select autoFocus value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${premiumFieldClass} text-sm`} aria-label="Filtrera fakturaunderlag">
                <option value="all">Alla utkaststatusar</option>
                <option value="missing">Saknas</option>
                <option value="empty">Tomt</option>
                <option value="built">Byggt</option>
              </select>
            </label>
          </fieldset>
        </form>
        {loading ? <p className="text-sm text-ink-500">Kön hämtas.</p> : null}
      </div>
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inget underlag att bygga" description="När tid eller material är godkänt och utkastet saknas rader, eller utkastet väntar på kundnamn, hamnar arbetsordern här." />
      ) : null}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState title="Inga underlag matchar filtret" description="Ändra utkastfiltret för att visa fler arbetsordrar." />
      ) : null}
      {!loading && !error && visibleItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            {summary.workOrders} arbetsorder · {summary.approvedTime} attesterade tidrader · {summary.approvedMaterial} attesterade materialrader
          </p>
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-950">{item.title}</p>
                    <p className="mt-1 text-sm text-ink-500">
                      {item.propertyName} · {item.statusLabel} · {item.draftStatusLabel} · {item.approvedTime} tid · {item.approvedMaterial} material
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.draftStatus !== "built" ? (
                      <button
                        type="button"
                        disabled={formLocked}
                        onClick={() => void rebuild(item)}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actingId === item.id ? "Bygger…" : "Bygg underlag"}
                      </button>
                    ) : null}
                    <Link href={item.href} className={premiumCompactButtonClass}>
                      Öppna
                    </Link>
                  </div>
                </div>
                {item.draftStatus === "built" ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Kundnamn för {item.title}</span>
                      <input
                        value={names[item.id] ?? ""}
                        onChange={(event) => setNames((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Kundnamn"
                        maxLength={200}
                        className={premiumFieldClass}
                        disabled={formLocked}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={formLocked || !(names[item.id] || "").trim()}
                      onClick={() => void markReady(item)}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-800 px-4 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actingId === item.id ? "Markerar…" : "Markera som klar"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
