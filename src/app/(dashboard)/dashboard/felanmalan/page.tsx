"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Filter, Inbox, Search } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";
import { PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/domain-labels";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type TeamMember = { id: string; name: string | null; email: string };
type Ticket = {
  id: string; title: string; description: string; status: string; category: string; priority: string;
  property_id: string | null; assigned_to_id: string | null; due_date: string | null; created_at: string; updated_at: string;
  property: Property | null; assigned_to: TeamMember | null; _count: { comments: number };
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const statusLabels = TICKET_STATUS_LABELS;
const priorityLabels = PRIORITY_LABELS;

export default function FelanmalanPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (propertyFilter) params.set("propertyId", propertyFilter);
      try {
        const [ticketsResponse, propertiesResponse, teamResponse] = await Promise.all([
          fetch(`/api/tickets${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" }),
          fetch("/api/properties", { cache: "no-store" }),
          fetch("/api/team", { cache: "no-store" }),
        ]);
        if ([ticketsResponse, propertiesResponse, teamResponse].some((response) => response.status === 401)) { router.push("/login"); return; }
        const [ticketsData, propertiesData, teamData] = await Promise.all([readResponseJson(ticketsResponse), readResponseJson(propertiesResponse), readResponseJson(teamResponse)]);
        if (!mounted) return;
        if (!ticketsResponse.ok) throw new Error(ticketsData.error || "Kunde inte hämta ärenden");
        if (!propertiesResponse.ok) throw new Error(propertiesData.error || "Kunde inte hämta fastigheter");
        if (!teamResponse.ok) throw new Error(teamData.error || "Kunde inte hämta teamet");
        setTickets(ticketsData.tickets || []);
        setProperties(propertiesData.properties || []);
        setMembers(teamData.members || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Kunde inte kontakta servern");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    const timer = window.setTimeout(() => void loadData(), search ? 250 : 0);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [priorityFilter, propertyFilter, router, search, statusFilter]);

  const summary = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((ticket) => !["completed", "closed"].includes(ticket.status)).length,
    urgent: tickets.filter((ticket) => ticket.priority === "urgent" && !["completed", "closed"].includes(ticket.status)).length,
    unassigned: tickets.filter((ticket) => !ticket.assigned_to && !["completed", "closed"].includes(ticket.status)).length,
  }), [tickets]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setSuccess(""); setSubmitting(true);
    try {
      const response = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, propertyId, category, priority, assignedToId }) });
      const data = await readResponseJson(response);
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa ärendet");
      setTickets((current) => [data.ticket, ...current]);
      setTitle(""); setDescription(""); setPropertyId(""); setCategory("other"); setPriority("normal"); setAssignedToId("");
      setSuccess("Ärendet är skapat och redo för handläggning.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Felanmälan och service" title="Ärenden" description="Skapa, prioritera och följ upp felanmälningar i ett gemensamt flöde med tydlig fastighetskoppling och ansvarsfördelning." />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={ClipboardList} label="Totalt" value={summary.total} hint="Ärenden i aktuellt urval" />
      <MetricCard icon={Inbox} label="Öppna" value={summary.open} hint="Pågående handläggning" />
      <MetricCard icon={AlertTriangle} label="Akuta" value={summary.urgent} hint="Kräver omedelbar prioritering" />
      <MetricCard icon={Filter} label="Ej tilldelade" value={summary.unassigned} hint="Saknar ansvarig handläggare" />
    </section>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
    <SoftDeleteUndoBanner
      entityLabel="Ärendet"
      restoreApiPath={(id) => `/api/tickets/${id}/restore`}
      detailPath={(id) => `/dashboard/felanmalan/${id}`}
    />

    <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <Panel title="Nytt ärende" description="Registrera en tydlig felanmälan och fördela den direkt." bodyClassName="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">Fastighet</span><select className={premiumFieldClass} value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Ingen vald fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">Kategori</span><select className={premiumFieldClass} value={category} onChange={(event) => setCategory(event.target.value)}><option value="other">Övrigt</option><option value="vvs">VVS</option><option value="electricity">El</option><option value="elevator">Hiss</option><option value="security">Säkerhet</option><option value="cleaning">Städning</option></select></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">Prioritet</span><select className={premiumFieldClass} value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="urgent">Akut</option></select></label>
          </div>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">Ansvarig</span><select className={premiumFieldClass} value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}><option value="">Ej tilldelad</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">Titel</span><input required minLength={3} className={premiumFieldClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Exempel: Läckande kran i köket" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-ink-600">Beskrivning</span><textarea required minLength={10} className={premiumTextareaClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Beskriv problemet, platsen och hur brådskande det är." /></label>
          <button type="submit" disabled={submitting} className={`${premiumPrimaryButtonClass} w-full`}>{submitting ? "Skapar ärende…" : "Skapa ärende"}</button>
        </form>
      </Panel>

      <Panel title="Ärendelista" description="Filtrera och öppna ett ärende för full historik och uppföljning." bodyClassName="p-0">
        <div className="border-b border-sand-200 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" /><input className={`${premiumFieldClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök ärende" aria-label="Sök ärenden" /></div>
            <select className={premiumFieldClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Alla statusar</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select className={premiumFieldClass} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Alla prioriteter</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select className={premiumFieldClass} value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option value="">Alla fastigheter</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs font-medium text-ink-400">{tickets.length} träffar</p><button type="button" onClick={() => window.location.assign("/api/tickets/export")} className="text-xs font-semibold text-petroleum-700 transition hover:text-petroleum-900">Exportera CSV</button></div>
        </div>

        {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-sand-100" />)}</div> : tickets.length === 0 ? <EmptyState title="Inga ärenden hittades" description="Skapa ett nytt ärende eller ändra filtreringen." /> : <div className="divide-y divide-sand-100">{tickets.map((ticket) => <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="block p-5 transition hover:bg-sand-50/70 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><h3 className="truncate font-semibold text-ink-900">{ticket.title}</h3><p className="mt-1 text-xs font-medium text-ink-400">{ticket.property ? `${ticket.property.name} · ${ticket.property.address}` : "Ingen fastighet vald"}</p><p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-500">{ticket.description}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold"><span className="rounded-full bg-sand-50 px-2.5 py-1 text-ink-600">{statusLabels[ticket.status] || ticket.status}</span><span className={`rounded-full px-2.5 py-1 ${ticket.priority === "urgent" ? "bg-red-50 text-red-700" : ticket.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-petroleum-50 text-petroleum-700"}`}>{priorityLabels[ticket.priority] || ticket.priority}</span><span className="rounded-full bg-sand-50 px-2.5 py-1 text-ink-500">{ticket.assigned_to ? ticket.assigned_to.name || ticket.assigned_to.email : "Ej tilldelad"}</span><span className="rounded-full bg-sand-50 px-2.5 py-1 text-ink-500">{ticket._count.comments} kommentarer</span></div></div>
            <p className="shrink-0 text-xs font-medium text-ink-400">{dateFormatter.format(new Date(ticket.created_at))}</p>
          </div>
        </Link>)}</div>}
      </Panel>
    </section>
  </div>;
}
