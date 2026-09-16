"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { EmptyState, InlineAlert, Panel, premiumCompactButtonClass, premiumFieldClass } from "@/components/dashboard/premium-ui";

type QueueItem = {
  id: string;
  tenantName: string;
  propertyName: string;
  unit: string;
  period: string;
  dueDate: string;
  statusLabel: string;
  total: number;
  nextStatus: "sent" | "paid";
  nextStatusLabel: string;
  canMarkOverdue: boolean;
  href: string;
};

type QueuePayload = {
  summary?: { notices: number; overdue: number };
  notices?: QueueItem[];
  error?: string;
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });

export function RentNoticeStatusQueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState({ notices: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [actingKey, setActingKey] = useState("");
  const [itemError, setItemError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const applyQueue = useCallback((body: QueuePayload) => {
    setItems(body.notices || []);
    setSummary(body.summary || { notices: 0, overdue: 0 });
  }, []);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/rent-notices/status-queue", { cache: "no-store" });
    if (response.status === 403) {
      setHidden(true);
      return;
    }
    const body = await readResponseJson<QueuePayload>(response);
    if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för aviestatus");
    applyQueue(body);
  }, [applyQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/rent-notices/status-queue", { cache: "no-store" });
        if (response.status === 403) {
          if (active) setHidden(true);
          return;
        }
        const body = await readResponseJson<QueuePayload>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta kön för aviestatus");
        if (!active) return;
        applyQueue(body);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Kunde inte hämta kön för aviestatus");
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
    if (window.location.hash !== "#avikofilter") return;
    document.getElementById("avikofilter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, items]);

  async function updateStatus(item: QueueItem, status: string) {
    setActingKey(`${item.id}:${status}`);
    setItemError("");
    try {
      const response = await fetch("/api/rent-notices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticeId: item.id, status }),
      });
      const body = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte uppdatera aviestatus");
      await loadQueue();
    } catch (caught) {
      setItemError(caught instanceof Error ? caught.message : "Kunde inte uppdatera aviestatus");
      try {
        await loadQueue();
      } catch {
        // Keep the local error; the list is still the last successful snapshot.
      }
    } finally {
      setActingKey("");
    }
  }

  if (hidden) return null;

  const visibleItems = statusFilter === "all"
    ? items
    : statusFilter === "overdue"
      ? items.filter((item) => item.canMarkOverdue)
      : items.filter((item) => item.nextStatus === statusFilter);
  const formLocked = Boolean(actingKey) || loading;

  return (
    <Panel
      icon={CalendarClock}
      title="Hyresavier"
      description="Sätt manuell aviestatus här. Inbetalning mot bank eller autogiro sker utanför Revalta. Samma åtgärd som på Hyresavisering — ingen ny meny."
    >
      <div id="avikofilter" className="scroll-mt-36 space-y-3">
        {error ? <InlineAlert>{error}</InlineAlert> : null}
        {itemError ? <InlineAlert>{itemError}</InlineAlert> : null}
        <form id="avikofilter-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading} className="contents">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Filtrera kön</span>
              <select autoFocus value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${premiumFieldClass} text-sm`} aria-label="Filtrera hyresavier i kön">
                <option value="all">Alla avier</option>
                <option value="sent">Nästa: skickad</option>
                <option value="paid">Nästa: betald</option>
                <option value="overdue">Kan markeras förfallen</option>
              </select>
            </label>
          </fieldset>
        </form>
        {loading ? <p className="text-sm text-ink-500">Kön hämtas.</p> : null}
      </div>
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Inga avier att hantera" description="När ett utkast, en skickad avi eller en förfallen avi väntar på nästa status hamnar den här." />
      ) : null}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 ? (
        <EmptyState title="Inga avier matchar filtret" description="Ändra statusfiltret för att visa fler poster i aviekön." />
      ) : null}
      {!loading && !error && visibleItems.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            {summary.notices} avier i kön{summary.overdue ? ` · ${summary.overdue} förfallna eller förfallodatum passerat` : ""}
          </p>
          <div className="divide-y divide-sand-100 overflow-hidden rounded-xl border border-sand-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-950">{item.tenantName}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {item.propertyName}{item.unit ? ` · ${item.unit}` : ""} · {item.period} · {item.statusLabel} · förfaller {dateFmt.format(new Date(item.dueDate))} · {money.format(item.total)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={formLocked}
                    onClick={() => void updateStatus(item, item.nextStatus)}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-petroleum-800 px-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingKey === `${item.id}:${item.nextStatus}` ? "Sparar…" : item.nextStatusLabel}
                  </button>
                  {item.canMarkOverdue ? (
                    <button
                      type="button"
                      disabled={formLocked}
                      onClick={() => void updateStatus(item, "overdue")}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-sand-200 bg-white px-3 text-sm font-semibold text-ink-800 hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actingKey === `${item.id}:overdue` ? "Sparar…" : "Markera som förfallen"}
                    </button>
                  ) : null}
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
