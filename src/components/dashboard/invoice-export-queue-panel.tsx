"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel, premiumCompactButtonClass, premiumFieldClass } from "@/components/dashboard/premium-ui";

type Provider = { id: string; name: string; configured: boolean };

type QueueItem = {
  id: string;
  title: string;
  statusLabel: string;
  propertyName: string;
  customerName: string;
  total: number;
  href: string;
};

type QueuePayload = {
  summary?: { workOrders: number };
  providers?: Provider[];
  workOrders?: QueueItem[];
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export function InvoiceExportQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [summary, setSummary] = useState({ workOrders: 0 });
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState("");
  const [itemError, setItemError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const applyQueue = useCallback((body: QueuePayload) => {
    const nextProviders = body.providers || [];
    const nextItems = body.workOrders || [];
    const fallback = nextProviders.find((provider) => provider.configured)?.id || "";
    setProviders(nextProviders);
    setItems(nextItems);
    setSummary(body.summary || { workOrders: 0 });
    setSelected((current) => {
      const next = { ...current };
      for (const item of nextItems) {
        if (!next[item.id]) next[item.id] = fallback;
      }
      return next;
    });
  }, []);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/work-orders/invoice-export-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för fakturaexport");
    applyQueue(body);
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/work-orders/invoice-export-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för fakturaexport");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta kön för fakturaexport");
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
    if (window.location.hash !== "#exportkofilter") return;
    document.getElementById("exportkofilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  async function queueExport(item: QueueItem) {
    const provider = selected[item.id];
    if (!provider) {
      setItemError("Välj en konfigurerad exportleverantör.");
      return;
    }
    setActingId(item.id);
    setItemError("");
    try {
      const response = await fetch(`/api/work-orders/${item.id}/invoice-integration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue", provider }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte köa fakturaexport");
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSummary((current) => ({ workOrders: Math.max(0, current.workOrders - 1) }));
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte köa fakturaexport");
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

  const anyConfigured = providers.some((provider) => provider.configured);
  const needle = query.trim().toLowerCase();
  const visibleItems = needle
    ? items.filter((item) => `${item.title} ${item.propertyName} ${item.customerName}`.toLowerCase().includes(needle))
    : items;
  const formLocked = Boolean(actingId) || loading;

  return (
    <Panel
      icon={Send}
      title="Fakturaexport"
      description="Köa HTTP-export till Fortnox, Visma eller en webhook när underlaget är markerat som klart. Inga officiella SDK:er – samma endpoint som på arbetsordern."
    >
      <div id="exportkofilter" className="scroll-mt-36 space-y-3">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        <form id="exportkofilter-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading} className="contents">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Sök i kön</span>
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className={premiumFieldClass} placeholder="Arbetsorder, fastighet eller kund" aria-label="Sök i fakturaexportkön" />
            </label>
          </fieldset>
        </form>
        {loading ? <p className="text-sm text-ink-500">Kön hämtas.</p> : null}
      </div>
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inget att exportera" description="När ett fakturaunderlag är klart och saknar aktivt exportjobb hamnar arbetsordern här." />
      ) : null}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState title="Inga arbetsordrar matchar sökningen" description="Ändra sökningen för att visa fler poster i exportkön." />
      ) : null}
      {!loading && !error && visibleItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">{summary.workOrders} arbetsorder redo för export</p>
          {!anyConfigured ? (
            <InlineAlert>Ingen exportleverantör är konfigurerad. Sätt webhook- eller Fortnox/Visma-endpoint i miljön.</InlineAlert>
          ) : null}
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {item.propertyName} · {item.statusLabel} · {item.customerName} · {money.format(item.total)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`export-provider-${item.id}`}>Exportleverantör</label>
                  <select
                    id={`export-provider-${item.id}`}
                    value={selected[item.id] || ""}
                    onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}
                    disabled={formLocked}
                    className={`${premiumFieldClass} h-9 min-w-[12rem] text-sm`}
                  >
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id} disabled={!provider.configured}>
                        {provider.name}{provider.configured ? "" : " · ej konfigurerad"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={formLocked || !anyConfigured}
                    onClick={() => void queueExport(item)}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingId === item.id ? "Köar…" : "Köa export"}
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
