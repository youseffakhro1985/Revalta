"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel, premiumCompactButtonClass } from "@/components/dashboard/premium-ui";

type QueueItem = {
  id: string;
  title: string;
  statusLabel: string;
  propertyName: string;
  approvedTime: number;
  approvedMaterial: number;
  draftStatusLabel: string;
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

  const applyQueue = useCallback((body: QueuePayload) => {
    setItems(body.workOrders || []);
    setSummary(body.summary || { workOrders: 0, approvedTime: 0, approvedMaterial: 0 });
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
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSummary((current) => ({
        workOrders: Math.max(0, current.workOrders - 1),
        approvedTime: Math.max(0, current.approvedTime - item.approvedTime),
        approvedMaterial: Math.max(0, current.approvedMaterial - item.approvedMaterial),
      }));
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

  if (hidden) return null;

  return (
    <Panel
      icon={ReceiptText}
      title="Fakturaunderlag"
      description="Bygg utkast från attesterad tid och material. Kundnamn och Markera som klar görs på arbetsordern."
    >
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-sand-100" aria-hidden="true" /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inget underlag att bygga" description="När tid eller material är godkänt och utkastet saknas rader hamnar arbetsordern här." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            {summary.workOrders} arbetsorder · {summary.approvedTime} attesterade tidrader · {summary.approvedMaterial} attesterade materialrader
          </p>
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {item.propertyName} · {item.statusLabel} · {item.draftStatusLabel} · {item.approvedTime} tid · {item.approvedMaterial} material
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(actingId)}
                    onClick={() => void rebuild(item)}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingId === item.id ? "Bygger…" : "Bygg underlag"}
                  </button>
                  <Link href={item.href} className={premiumCompactButtonClass}>
                    Öppna
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
