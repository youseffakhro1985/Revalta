"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";

type Ticket = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  property: { id: string; name: string; address: string; city: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
};

const columns = [
  { key: "new", label: "Nya" },
  { key: "received", label: "Mottagna" },
  { key: "in_progress", label: "Pågående" },
  { key: "waiting", label: "Väntar" },
  { key: "completed", label: "Klara" },
] as const;

const priorityLabels: Record<string, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
  urgent: "Akut",
};

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/tickets", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordrar");
        if (mounted) setTickets(data.tickets || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordrar");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [router]);

  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (ticket.status === "closed") return false;
      if (!query) return true;
      return [ticket.title, ticket.property?.name, ticket.property?.address, ticket.assigned_to?.name, ticket.assigned_to?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [search, tickets]);

  const urgent = visibleTickets.filter((ticket) => ticket.priority === "urgent").length;
  const overdue = visibleTickets.filter((ticket) => ticket.due_date && new Date(ticket.due_date) < new Date() && !["completed", "closed"].includes(ticket.status)).length;
  const unassigned = visibleTickets.filter((ticket) => !ticket.assigned_to).length;
  const completed = visibleTickets.filter((ticket) => ticket.status === "completed").length;

  async function changeStatus(ticketId: string, status: string) {
    setUpdatingId(ticketId);
    setError("");
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetsordern");
      setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, status: data.ticket.status } : ticket));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera arbetsordern");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="animate-fade-in-soft space-y-6">
      <header className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Operativ förvaltning</p>
            <h1 className="text-[32px] font-semibold tracking-[-0.035em] text-ink-950 sm:text-[36px]">Arbetsordrar</h1>
            <p className="mt-3 max-w-2xl text-ink-600">Planera, prioritera och följ upp arbetet i ett tydligt gemensamt flöde.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök arbetsorder, fastighet eller ansvarig"
              className="min-w-[280px] rounded-lg border border-sand-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
            />
            <Link href="/dashboard/felanmalan" className="rounded-lg bg-petroleum-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-petroleum-800">Ny arbetsorder</Link>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-danger-500 bg-danger-50 p-4 text-sm font-medium text-danger-600">{error}</div>}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Akuta", value: urgent, icon: AlertTriangle },
          { label: "Försenade", value: overdue, icon: CalendarClock },
          { label: "Ej tilldelade", value: unassigned, icon: Clock3 },
          { label: "Klara för kontroll", value: completed, icon: CheckCircle2 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-medium text-ink-500">{item.label}</p><p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-ink-950">{item.value}</p></div>
                <div className="rounded-xl bg-sand-50 p-3 text-petroleum-700"><Icon className="h-5 w-5" strokeWidth={1.7} /></div>
              </div>
            </article>
          );
        })}
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">{columns.map((column) => <div key={column.key} className="h-96 animate-pulse rounded-2xl bg-sand-100" />)}</div>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {columns.map((column) => {
            const items = visibleTickets.filter((ticket) => ticket.status === column.key || (column.key === "new" && !columns.some((known) => known.key === ticket.status)));
            return (
              <div key={column.key} className="min-h-[420px] rounded-2xl border border-sand-200 bg-[#F1F1EC] p-3">
                <div className="flex items-center justify-between px-2 py-2">
                  <div><h2 className="text-sm font-semibold text-ink-900">{column.label}</h2><p className="mt-0.5 text-xs text-ink-400">{items.length} arbetsordrar</p></div>
                  <span className="rounded-full border border-sand-200 bg-white px-2 py-0.5 text-xs font-semibold text-ink-500">{items.length}</span>
                </div>
                <div className="mt-2 space-y-3">
                  {items.map((ticket) => (
                    <article key={ticket.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/dashboard/arbetsorder/${ticket.id}`} className="font-semibold leading-5 text-ink-900 hover:text-petroleum-800">{ticket.title}</Link>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ticket.priority === "urgent" ? "bg-danger-50 text-danger-600" : ticket.priority === "high" ? "bg-warning-50 text-warning-700" : "bg-sand-50 text-ink-500"}`}>{priorityLabels[ticket.priority] || ticket.priority}</span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-ink-500">{ticket.property?.name || "Ingen fastighet"}</p>
                      <p className="text-xs leading-5 text-ink-400">{ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"}</p>
                      <div className="mt-4 border-t border-sand-100 pt-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">{formatDate(ticket.due_date)}</p>
                        <select
                          value={ticket.status}
                          disabled={updatingId === ticket.id}
                          onChange={(event) => changeStatus(ticket.id, event.target.value)}
                          className="w-full rounded-lg border border-sand-200 bg-sand-50 px-2 py-2 text-xs font-semibold text-ink-700 outline-none focus:border-petroleum-500"
                        >
                          {columns.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                          <option value="closed">Stängd</option>
                        </select>
                      </div>
                    </article>
                  ))}
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-sand-300 bg-white/50 p-5 text-center"><ClipboardList className="mx-auto h-5 w-5 text-ink-300" /><p className="mt-2 text-xs text-ink-400">Inga arbetsordrar</p></div>}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
