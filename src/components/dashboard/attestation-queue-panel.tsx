"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel, premiumCompactButtonClass, premiumFieldClass } from "@/components/dashboard/premium-ui";

type QueueItem = {
  id: string;
  title: string;
  statusLabel: string;
  propertyName: string;
  pendingTime: number;
  pendingMaterial: number;
  href: string;
};

type QueuePayload = {
  summary?: { workOrders: number; pendingTime: number; pendingMaterial: number };
  workOrders?: QueueItem[];
  error?: string;
};

type AttestAction = "approveSubmitted" | "rejectSubmitted";

export function AttestationQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState({ workOrders: 0, pendingTime: 0, pendingMaterial: 0 });
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");
  const [itemError, setItemError] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const applyQueue = useCallback((body: QueuePayload) => {
    setItems(body.workOrders || []);
    setSummary(body.summary || { workOrders: 0, pendingTime: 0, pendingMaterial: 0 });
  }, []);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/work-orders/attestation-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return null;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta attesteringskön");
    applyQueue(body);
    return body;
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/work-orders/attestation-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta attesteringskön");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta attesteringskön");
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
    if (window.location.hash !== "#attestfilter") return;
    document.getElementById("attestfilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  async function attest(item: QueueItem, action: AttestAction) {
    if (action === "rejectSubmitted") {
      const confirmed = window.confirm("Avvisa alla inskickade tid- och materialrader på den här arbetsordern?");
      if (!confirmed) return;
    }
    setActingId(item.id);
    setItemError("");
    try {
      const response = await fetch(`/api/work-orders/${item.id}/attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte attestera inskickade rader");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSummary((current) => ({
        workOrders: Math.max(0, current.workOrders - 1),
        pendingTime: Math.max(0, current.pendingTime - item.pendingTime),
        pendingMaterial: Math.max(0, current.pendingMaterial - item.pendingMaterial),
      }));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte attestera inskickade rader");
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

  const visibleItems = kindFilter === "all"
    ? items
    : items.filter((item) => (kindFilter === "time" ? item.pendingTime > 0 : item.pendingMaterial > 0));
  const formLocked = Boolean(actingId) || loading;

  return (
    <Panel
      icon={ClipboardCheck}
      title="Attesteringskö"
      description="Godkänn eller avvisa inskickad tid och material här. Fakturaunderlag kan byggas när raderna är attesterade."
    >
      <div id="attestfilter" className="scroll-mt-36 space-y-3">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        <form id="attestfilter-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading} className="contents">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Filtrera kön</span>
              <select autoFocus value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className={`${premiumFieldClass} text-sm`} aria-label="Filtrera attesteringskön">
                <option value="all">Alla rader</option>
                <option value="time">Tid väntar</option>
                <option value="material">Material väntar</option>
              </select>
            </label>
          </fieldset>
        </form>
        {loading ? <p className="text-sm text-ink-500">Kön hämtas.</p> : null}
      </div>
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inget att attestera" description="När en arbetsorder slutförs med tid eller material hamnar den här." />
      ) : null}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState title="Inga arbetsordrar matchar filtret" description="Ändra radfiltret för att visa fler poster i attesteringskön." />
      ) : null}
      {!loading && !error && visibleItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            {summary.workOrders} arbetsorder · {summary.pendingTime} tidrader · {summary.pendingMaterial} materialrader
          </p>
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {item.propertyName} · {item.statusLabel} · {item.pendingTime} tid · {item.pendingMaterial} material
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={formLocked}
                    onClick={() => void attest(item, "approveSubmitted")}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingId === item.id ? "Godkänner…" : "Godkänn inskickade"}
                  </button>
                  <button
                    type="button"
                    disabled={formLocked}
                    onClick={() => void attest(item, "rejectSubmitted")}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-danger-200 bg-white px-3 text-sm font-semibold text-danger-700 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Avvisa inskickade
                  </button>
                  <Link
                    href={item.href}
                    className={premiumCompactButtonClass}
                  >
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
