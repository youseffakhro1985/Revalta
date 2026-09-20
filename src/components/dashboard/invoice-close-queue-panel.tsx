"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel, premiumCompactButtonClass, premiumFieldClass } from "@/components/dashboard/premium-ui";

type QueueItem = {
  id: string;
  title: string;
  statusLabel: string;
  propertyName: string;
  customerName: string;
  total: number;
  draftStatusLabel: string;
  href: string;
};

type QueuePayload = {
  summary?: { workOrders: number };
  workOrders?: QueueItem[];
  error?: string;
};

type LockPayload = {
  error?: string;
  lock?: { token?: string; version?: string };
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

async function releaseLock(workOrderId: string, token: string) {
  try {
    await fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", token }),
    });
  } catch {
    // The status change may already have succeeded; a leftover short lease expires on its own.
  }
}

export function InvoiceCloseQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState({ workOrders: 0 });
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");
  const [itemError, setItemError] = useState("");
  const [query, setQuery] = useState("");

  const applyQueue = useCallback((body: QueuePayload) => {
    setItems(body.workOrders || []);
    setSummary(body.summary || { workOrders: 0 });
  }, []);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/work-orders/invoice-close-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för fakturering");
    applyQueue(body);
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/work-orders/invoice-close-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för fakturering");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta kön för fakturering");
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
    if (window.location.hash !== "#fakturafilter") return;
    document.getElementById("fakturafilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("faktura-sok")?.focus(), 0);
  }, [loading, items]);
  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#fakturako") return;
    document.getElementById("fakturako")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  async function markInvoiced(item: QueueItem) {
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
        body: JSON.stringify({ status: "invoiced", editToken: token, version }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte markera arbetsordern som fakturerad");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSummary((current) => ({ workOrders: Math.max(0, current.workOrders - 1) }));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte markera arbetsordern som fakturerad");
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

  const needle = query.trim().toLowerCase();
  const visibleItems = needle
    ? items.filter((item) => `${item.title} ${item.propertyName} ${item.customerName} ${item.draftStatusLabel}`.toLowerCase().includes(needle))
    : items;
  const formLocked = Boolean(actingId) || loading;

  return (
    <Panel
      icon={BadgeCheck}
      title="Fakturera arbetsorder"
      description="Sätt slutförda arbetsordrar till Fakturerad när underlaget är klart eller exporterat. Samma redigeringslås som under Styrning – inget hopp förbi låset."
    >
      <div id="fakturafilter" className="scroll-mt-36 space-y-3">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        <form id="fakturafilter-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading} className="contents">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Sök i kön</span>
              <input id="faktura-sok" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className={premiumFieldClass} placeholder="Arbetsorder, fastighet eller kund" aria-label="Sök i faktureringskön" />
            </label>
          </fieldset>
        </form>
      </div>
      <div id="fakturako" className="scroll-mt-36">
        {loading ? <p className="text-sm text-ink-500">Kön hämtas.</p> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inget att fakturera" description="När en slutförd arbetsorder har ett klart eller exporterat underlag hamnar den här." />
      ) : null}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState title="Inga arbetsordrar matchar sökningen" description="Ändra sökningen för att visa fler poster i faktureringskön." />
      ) : null}
      {!loading && !error && visibleItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">{summary.workOrders} arbetsorder redo att faktureras</p>
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {item.propertyName} · {item.statusLabel} · {item.draftStatusLabel} · {item.customerName} · {money.format(item.total)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={formLocked}
                    onClick={() => void markInvoiced(item)}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingId === item.id ? "Markerar…" : "Markera som fakturerad"}
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
      </div>
    </Panel>
  );
}
