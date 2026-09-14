"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel } from "@/components/dashboard/premium-ui";

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

export function AttestationQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState({ workOrders: 0, pendingTime: 0, pendingMaterial: 0 });
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");

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
        setItems(body.workOrders || []);
        setSummary(body.summary || { workOrders: 0, pendingTime: 0, pendingMaterial: 0 });
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta attesteringskön");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (hidden) return null;

  return (
    <Panel
      icon={ClipboardCheck}
      title="Attesteringskö"
      description="Arbetsorder med inskickad tid eller material som väntar på godkännande innan fakturaunderlag kan byggas."
    >
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {loading ? <div className="h-32 animate-pulse rounded-xl bg-sand-100" aria-hidden="true" /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inget att attestera" description="När en arbetsorder slutförs med tid eller material hamnar den här." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            {summary.workOrders} arbetsorder · {summary.pendingTime} tidrader · {summary.pendingMaterial} materialrader
          </p>
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {item.propertyName} · {item.statusLabel} · {item.pendingTime} tid · {item.pendingMaterial} material
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900"
                >
                  Attestera
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

