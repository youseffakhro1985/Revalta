"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";

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

const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };

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
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordrar");
        if (mounted) setTickets(data.tickets || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordrar");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
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

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Operativ förvaltning"
      title="Arbetsordrar"
      description="Planera, prioritera och följ upp arbetet i ett tydligt gemensamt flöde från ny anmälan till slutförd åtgärd."
      action={<Link href="/dashboard/felanmalan" className="inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800 focus:outline-none focus:ring-2 focus:ring-petroleum-200">Ny arbetsorder</Link>}
    />

    {error ? <InlineAlert>{error}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={AlertTriangle} label="Akuta" value={urgent} hint="Kräver omedelbar prioritering" />
      <MetricCard icon={CalendarClock} label="Försenade" value={overdue} hint="Har passerat planerad deadline" />
      <MetricCard icon={Clock3} label="Ej tilldelade" value={unassigned} hint="Saknar ansvarig utförare" />
      <MetricCard icon={CheckCircle2} label="Klara för kontroll" value={completed} hint="Redo för slutkontroll och stängning" />
    </section>

    <Panel title="Planeringstavla" description="Sök, prioritera och flytta arbetsordrar mellan statusstegen." bodyClassName="p-4 sm:p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Sök arbetsorder, fastighet eller ansvarig"
          className={`${premiumFieldClass} sm:max-w-md`}
          aria-label="Sök arbetsordrar"
        />
        <p className="text-xs font-medium text-ink-400">{visibleTickets.length} aktiva arbetsordrar</p>
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-5">{columns.map((column) => <div key={column.key} className="h-96 animate-pulse rounded-2xl bg-sand-100" />)}</div>
      ) : visibleTickets.length === 0 ? (
        <EmptyState title="Inga arbetsordrar matchar sökningen" description="Skapa en ny arbetsorder eller justera sökningen för att visa fler resultat." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          {columns.map((column) => {
            const items = visibleTickets.filter((ticket) => ticket.status === column.key || (column.key === "new" && !columns.some((known) => known.key === ticket.status)));
            return <section key={column.key} className="min-h-[420px] rounded-2xl border border-sand-200 bg-[#F1F1EC] p-3">
              <div className="flex items-center justify-between px-2 py-2">
                <div><h2 className="text-sm font-semibold text-ink-900">{column.label}</h2><p className="mt-0.5 text-xs text-ink-400">{items.length} arbetsordrar</p></div>
                <span className="rounded-full border border-sand-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-500">{items.length}</span>
              </div>
              <div className="mt-2 space-y-3">
                {items.map((ticket) => <article key={ticket.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-[0_1px_2px_rgba(17,34,31,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(17,34,31,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/arbetsorder/${ticket.id}`} className="font-semibold leading-5 text-ink-900 transition hover:text-petroleum-800">{ticket.title}</Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ticket.priority === "urgent" ? "bg-red-50 text-red-700" : ticket.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-sand-50 text-ink-500"}`}>{priorityLabels[ticket.priority] || ticket.priority}</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-500">{ticket.property?.name || "Ingen fastighet"}</p>
                  <p className="text-xs leading-5 text-ink-400">{ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"}</p>
                  <div className="mt-4 border-t border-sand-100 pt-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">{formatDate(ticket.due_date)}</p>
                    <select
                      value={ticket.status}
                      disabled={updatingId === ticket.id}
                      onChange={(event) => void changeStatus(ticket.id, event.target.value)}
                      className="h-10 w-full rounded-xl border border-sand-200 bg-sand-50 px-3 text-xs font-semibold text-ink-700 outline-none transition focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Ändra status för ${ticket.title}`}
                    >
                      {columns.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                      <option value="closed">Stängd</option>
                    </select>
                  </div>
                </article>)}
                {items.length === 0 ? <div className="rounded-xl border border-dashed border-sand-300 bg-white/60 p-6 text-center"><ClipboardList className="mx-auto h-5 w-5 text-ink-300" /><p className="mt-2 text-xs text-ink-400">Inga arbetsordrar</p></div> : null}
              </div>
            </section>;
          })}
        </div>
      )}
    </Panel>
  </div>;
}
