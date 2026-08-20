"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Download,
  ExternalLink,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { EmptyState, InlineAlert, premiumFieldClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";
import { PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/domain-labels";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type TeamMember = { id: string; name: string | null; email: string };
type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  property_id: string | null;
  assigned_to_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  property: Property | null;
  assigned_to: TeamMember | null;
  _count: { comments: number };
};
type Permissions = { canManage: boolean; canExport: boolean };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type RangeKey = "30" | "90";
type DashboardData = {
  summary: { total: number; open: number; urgent: number; inProgress: number; completedThisMonth: number };
  statusCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  trendRows: { created_at: string; updated_at: string; status: string }[];
  truncatedTrend: boolean;
  permissions: { canManage: boolean; canExport: boolean; scopedToAssigned: boolean };
};

type TrendPoint = { key: string; label: string; created: number; completed: number };

const statusLabels = TICKET_STATUS_LABELS;
const priorityLabels = PRIORITY_LABELS;
const categoryLabels: Record<string, string> = {
  other: "Övrigt",
  vvs: "VVS",
  electricity: "El",
  elevator: "Hiss",
  security: "Lås & säkerhet",
  cleaning: "Städning",
  ventilation: "Ventilation",
  heating: "Värme",
  outdoor: "Utemiljö",
};
const openStatuses = new Set(["new", "received", "in_progress", "waiting"]);
const closedStatuses = new Set(["completed", "closed"]);
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const timeOnly = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });

function startForRange(range: RangeKey) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Number(range) + 1);
  return date;
}

function ticketAddress(ticket: Ticket) {
  if (!ticket.property) return "";
  return [ticket.property.address, ticket.property.city, "Sverige"].filter(Boolean).join(", ");
}

function statusTone(status: string) {
  if (status === "completed" || status === "closed") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "in_progress") return "bg-amber-50 text-amber-800 ring-amber-100";
  if (status === "waiting") return "bg-blue-50 text-blue-700 ring-blue-100";
  return "bg-petroleum-50 text-petroleum-700 ring-petroleum-100";
}

function priorityTone(priority: string) {
  if (priority === "urgent") return "bg-red-50 text-red-700 ring-red-100";
  if (priority === "high") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (priority === "low") return "bg-sand-100 text-ink-600 ring-sand-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
}

function linePath(values: number[], max: number, width = 620, height = 190) {
  const xPad = 10;
  const yPad = 12;
  return values.map((value, index) => {
    const x = xPad + (index / Math.max(1, values.length - 1)) * (width - xPad * 2);
    const y = height - yPad - (value / Math.max(1, max)) * (height - yPad * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function trendPoints(rows: DashboardData["trendRows"], range: RangeKey): TrendPoint[] {
  const start = startForRange(range);
  const days = Number(range);
  const buckets = new Map<string, TrendPoint>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { key, label: dayMonth.format(date), created: 0, completed: 0 });
  }
  rows.forEach((row) => {
    const createdKey = new Date(row.created_at).toISOString().slice(0, 10);
    const createdBucket = buckets.get(createdKey);
    if (createdBucket) createdBucket.created += 1;
    if (closedStatuses.has(row.status)) {
      const completedKey = new Date(row.updated_at).toISOString().slice(0, 10);
      const completedBucket = buckets.get(completedKey);
      if (completedBucket) completedBucket.completed += 1;
    }
  });
  return [...buckets.values()];
}

function KpiCard({ icon: Icon, label, value, hint, tone = "green" }: { icon: LucideIcon; label: string; value: number | string; hint: string; tone?: "green" | "red" | "amber" }) {
  const iconTone = tone === "red" ? "bg-red-50 text-red-600" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-petroleum-700";
  const hintTone = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-emerald-700";
  return <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
    <div className="flex items-start gap-4">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconTone}`}><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
      <div className="min-w-0"><p className="text-[11px] font-medium text-ink-550">{label}</p><p className="mt-1 font-display text-[30px] font-semibold leading-none tracking-[-0.04em] text-ink-950">{value}</p><p className={`mt-3 text-[10px] font-semibold ${hintTone}`}>{hint}</p></div>
    </div>
  </article>;
}

export default function FelanmalanPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [overview, setOverview] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canManage: false, canExport: false });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [range, setRange] = useState<RangeKey>("30");
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("");

  useEffect(() => {
    let active = true;
    async function loadReferenceData() {
      try {
        const [overviewResponse, propertiesResponse, teamResponse] = await Promise.all([
          fetch("/api/tickets/dashboard", { cache: "no-store" }),
          fetch("/api/properties", { cache: "no-store" }),
          fetch("/api/team", { cache: "no-store" }),
        ]);
        if ([overviewResponse, propertiesResponse, teamResponse].some((response) => response.status === 401)) { router.push("/login"); return; }
        const [overviewData, propertiesData, teamData] = await Promise.all([
          readResponseJson<DashboardData & { error?: string }>(overviewResponse),
          readResponseJson<{ properties?: Property[]; error?: string }>(propertiesResponse),
          readResponseJson<{ members?: TeamMember[]; error?: string }>(teamResponse),
        ]);
        if (!overviewResponse.ok) throw new Error(overviewData.error || "Kunde inte hämta ärendeöversikten");
        if (!propertiesResponse.ok) throw new Error(propertiesData.error || "Kunde inte hämta fastigheter");
        if (!teamResponse.ok) throw new Error(teamData.error || "Kunde inte hämta teamet");
        if (!active) return;
        setOverview(overviewData);
        setProperties(propertiesData.properties || []);
        setMembers(teamData.members || []);
        setPermissions({ canManage: overviewData.permissions.canManage, canExport: overviewData.permissions.canExport });
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Kunde inte läsa ärendeöversikten");
      }
    }
    void loadReferenceData();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({ page: String(page), pageSize: "50" });
        if (query.trim()) params.set("q", query.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (priorityFilter) params.set("priority", priorityFilter);
        if (propertyFilter) params.set("propertyId", propertyFilter);
        try {
          const response = await fetch(`/api/tickets?${params.toString()}`, { cache: "no-store" });
          if (response.status === 401) { router.push("/login"); return; }
          const body = await readResponseJson<{ tickets?: Ticket[]; pagination?: Pagination; permissions?: Permissions; error?: string }>(response);
          if (!response.ok) throw new Error(body.error || "Kunde inte hämta ärenden");
          if (!active) return;
          setTickets(body.tickets || []);
          setPagination(body.pagination || { page: 1, pageSize: 50, total: 0, totalPages: 1 });
          if (body.permissions) setPermissions(body.permissions);
        } catch (loadError) {
          if (active) setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta ärenden");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, query ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, priorityFilter, propertyFilter, query, router, statusFilter]);

  const rangeStart = startForRange(range).getTime();
  const visibleTickets = useMemo(() => tickets.filter((ticket) => {
    if (new Date(ticket.created_at).getTime() < rangeStart) return false;
    if (categoryFilter && ticket.category !== categoryFilter) return false;
    if (assignmentFilter === "assigned" && !ticket.assigned_to) return false;
    if (assignmentFilter === "unassigned" && ticket.assigned_to) return false;
    return true;
  }), [assignmentFilter, categoryFilter, rangeStart, tickets]);

  const trend = useMemo(() => trendPoints(overview?.trendRows || [], range), [overview, range]);
  const trendMax = Math.max(1, ...trend.flatMap((point) => [point.created, point.completed]));
  const statusRows = useMemo(() => {
    const counts = overview?.statusCounts || {};
    const rows = ["new", "received", "in_progress", "waiting", "completed", "closed"].map((status) => ({ status, count: Number(counts[status] || 0) }));
    const total = Math.max(1, rows.reduce((sum, row) => sum + row.count, 0));
    return rows.filter((row) => row.count > 0).map((row) => ({ ...row, percent: Math.round((row.count / total) * 100) }));
  }, [overview]);
  const statusColors = ["#1f7a5a", "#76a88f", "#d9a72e", "#5f7fc7", "#aeb5ae", "#29463f"];
  let statusCursor = 0;
  const statusDonut = statusRows.length ? `conic-gradient(${statusRows.map((row, index) => {
    const from = statusCursor;
    statusCursor += row.percent;
    return `${statusColors[index % statusColors.length]} ${from}% ${statusCursor}%`;
  }).join(",")})` : "conic-gradient(#ece4d8 0 100%)";

  const mapTickets = useMemo(() => visibleTickets.filter((ticket) => openStatuses.has(ticket.status) && ticket.property).slice(0, 10), [visibleTickets]);
  useEffect(() => {
    if (!mapTickets.length) { setSelectedMapId(null); return; }
    if (!selectedMapId || !mapTickets.some((ticket) => ticket.id === selectedMapId)) setSelectedMapId(mapTickets[0].id);
  }, [mapTickets, selectedMapId]);
  const selectedMapTicket = mapTickets.find((ticket) => ticket.id === selectedMapId) || mapTickets[0] || null;
  const selectedAddress = selectedMapTicket ? ticketAddress(selectedMapTicket) : "";
  const mapEmbed = selectedMapTicket ? `https://maps.google.com/maps?q=${encodeURIComponent(selectedAddress)}&z=14&output=embed` : "";
  const mapExternal = selectedMapTicket ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAddress)}` : "https://www.google.com/maps";

  const recent = useMemo(() => [...visibleTickets].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5), [visibleTickets]);
  const urgent = useMemo(() => visibleTickets.filter((ticket) => ticket.priority === "urgent" && openStatuses.has(ticket.status)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3), [visibleTickets]);
  const hasFilters = Boolean(query || statusFilter || priorityFilter || categoryFilter || propertyFilter || assignmentFilter || range !== "30");

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
    setPriorityFilter("");
    setCategoryFilter("");
    setPropertyFilter("");
    setAssignmentFilter("");
    setRange("30");
    setPage(1);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, propertyId, category, priority, assignedToId }),
      });
      const body = await readResponseJson<{ ticket?: Ticket; error?: string }>(response);
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok || !body.ticket) throw new Error(body.error || "Kunde inte skapa ärendet");
      setCreateOpen(false);
      setTitle(""); setDescription(""); setPropertyId(""); setCategory("other"); setPriority("normal"); setAssignedToId("");
      router.push(`/dashboard/felanmalan/${body.ticket.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Kunde inte skapa ärendet");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="space-y-4 sm:space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Drift / Ärenden</p>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Ärenden</h1>
        <p className="mt-1 text-sm text-ink-500">Översikt och hantering av kund- och driftärenden.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {permissions.canExport ? <button type="button" onClick={() => window.location.assign("/api/tickets/export")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-[11px] font-semibold text-ink-650 transition hover:bg-sand-50"><Download className="h-4 w-4" />Exportera</button> : null}
        {permissions.canManage ? <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[11px] font-semibold text-white shadow-sm transition hover:bg-petroleum-800"><span className="text-base leading-none">＋</span>Nytt ärende</button> : null}
      </div>
    </div>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    <SoftDeleteUndoBanner entityLabel="Ärendet" restoreApiPath={(id) => `/api/tickets/${id}/restore`} detailPath={(id) => `/dashboard/felanmalan/${id}`} />

    <section className="rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.6fr)_120px_120px_130px_150px_140px_160px_auto]">
        <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-350" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} aria-label="Sök ärenden" placeholder="Sök ärenden, fastighet, adress..." className={`${premiumFieldClass} h-10 pl-10 text-[11px]`} /></label>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="Status" className={`${premiumFieldClass} h-10 text-[11px]`}><option value="">Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Kategori" className={`${premiumFieldClass} h-10 text-[11px]`}><option value="">Kategori</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(1); }} aria-label="Prioritet" className={`${premiumFieldClass} h-10 text-[11px]`}><option value="">Prioritet</option>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={propertyFilter} onChange={(event) => { setPropertyFilter(event.target.value); setPage(1); }} aria-label="Fastighet" className={`${premiumFieldClass} h-10 text-[11px]`}><option value="">Fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} aria-label="Tilldelning" className={`${premiumFieldClass} h-10 text-[11px]`}><option value="">Tilldelad</option><option value="assigned">Tilldelade</option><option value="unassigned">Ej tilldelade</option></select>
        <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" /><select value={range} onChange={(event) => setRange(event.target.value as RangeKey)} aria-label="Period" className={`${premiumFieldClass} h-10 pl-9 text-[11px]`}><option value="30">Senaste 30 dagarna</option><option value="90">Senaste 90 dagarna</option></select></label>
        {hasFilters ? <button type="button" onClick={clearFilters} className="h-10 px-2 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Rensa filter</button> : <span />}
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard icon={ClipboardList} label="Öppna ärenden" value={overview?.summary.open ?? "—"} hint="Aktiva ärenden i organisationen" />
      <KpiCard icon={AlertTriangle} label="Akuta ärenden" value={overview?.summary.urgent ?? "—"} hint="Kräver snabb prioritering" tone="red" />
      <KpiCard icon={CircleDot} label="Pågående" value={overview?.summary.inProgress ?? "—"} hint="Ärenden som hanteras nu" tone="amber" />
      <KpiCard icon={CheckCircle2} label="Slutförda denna månad" value={overview?.summary.completedThisMonth ?? "—"} hint="Avslutade under aktuell månad" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.72fr_1fr]">
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-[17px] font-semibold text-ink-950">Ärendeutveckling</h2><p className="mt-1 text-[10px] text-ink-450">Nya och slutförda ärenden över vald period.</p></div><span className="rounded-lg border border-sand-200 bg-[#FCFBF8] px-2.5 py-1.5 text-[9px] font-semibold text-ink-550">{range} dagar</span></div>
        <div className="mt-4 flex gap-4 text-[9px] text-ink-500"><span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-petroleum-800" />Nya ärenden</span><span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-emerald-300" />Slutförda ärenden</span></div>
        <div className="mt-4 rounded-xl bg-[#FCFBF8] px-3 py-4"><svg viewBox="0 0 640 210" className="h-[205px] w-full" role="img" aria-label="Ärendeutveckling">{[0, 1, 2, 3, 4].map((index) => <line key={index} x1="10" y1={12 + index * 44} x2="630" y2={12 + index * 44} stroke="#ece4d8" />)}<path d={linePath(trend.map((point) => point.created), trendMax)} fill="none" stroke="#29463f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d={linePath(trend.map((point) => point.completed), trendMax)} fill="none" stroke="#93c7ae" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="grid grid-cols-5 text-center text-[8px] text-ink-400">{[0, .25, .5, .75, 1].map((factor) => { const index = Math.min(trend.length - 1, Math.round((trend.length - 1) * factor)); return <span key={factor}>{trend[index]?.label || "—"}</span>; })}</div></div>
      </article>

      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
        <h2 className="font-display text-[17px] font-semibold text-ink-950">Ärenden per status</h2>
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
          <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: statusDonut }}><div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white"><strong className="font-display text-[26px] text-ink-950">{overview?.summary.total ?? 0}</strong><span className="text-[9px] text-ink-450">Totalt</span></div></div>
          <div className="w-full space-y-2.5">{statusRows.slice(0, 5).map((row, index) => <div key={row.status} className="flex items-center gap-2 text-[9px]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColors[index % statusColors.length] }} /><span className="min-w-0 flex-1 truncate text-ink-600">{statusLabels[row.status] || row.status}</span><strong className="text-ink-800">{row.count}</strong><span className="w-8 text-right text-ink-400">{row.percent}%</span></div>)}</div>
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-display text-[17px] font-semibold text-ink-950">Ärenden på karta</h2><p className="mt-0.5 text-[9px] text-ink-450">Välj ett aktivt ärende för plats och fastighet.</p></div><a href={mapExternal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-semibold text-petroleum-700">Visa plats <ExternalLink className="h-3 w-3" /></a></div>
        {selectedMapTicket ? <><div className="relative h-[215px] bg-sand-100"><iframe key={selectedMapTicket.id} title={`Karta för ${selectedMapTicket.title}`} src={mapEmbed} className="h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /><Link href={`/dashboard/felanmalan/${selectedMapTicket.id}`} className="absolute bottom-3 left-3 max-w-[75%] rounded-xl border border-white/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm"><p className="truncate text-[10px] font-semibold text-ink-900">{selectedMapTicket.title}</p><p className="mt-0.5 truncate text-[8px] text-ink-450">{selectedMapTicket.property?.name} · {selectedMapTicket.property?.address}</p></Link></div><div className="flex gap-1.5 overflow-x-auto p-3">{mapTickets.slice(0, 6).map((ticket) => <button key={ticket.id} type="button" onClick={() => setSelectedMapId(ticket.id)} className={`shrink-0 rounded-full px-2.5 py-1.5 text-[8px] font-semibold transition ${ticket.id === selectedMapTicket.id ? "bg-petroleum-900 text-white" : ticket.priority === "urgent" ? "bg-red-50 text-red-700" : "bg-sand-50 text-ink-600 hover:bg-sand-100"}`}>{ticket.property?.name || "Ärende"}</button>)}</div></> : <EmptyState title="Inga kartlagda ärenden" description="När aktiva ärenden är kopplade till en fastighet visas platsen här." />}
      </article>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.65fr_0.75fr]">
      <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-display text-[17px] font-semibold text-ink-950">Senaste ärenden</h2><p className="mt-0.5 text-[9px] text-ink-450">Klicka på ett ärende för historik, kommentarer och handläggning.</p></div><button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-[9px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3" /></button></div>
        {loading ? <div className="space-y-2 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}</div> : recent.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-y border-sand-100 bg-[#FCFBF8] text-[8px] font-semibold uppercase tracking-[0.08em] text-ink-400"><th className="px-5 py-2.5">Ärende</th><th className="px-3">Fastighet</th><th className="px-3">Kategori</th><th className="px-3">Prioritet</th><th className="px-3">Status</th><th className="px-3">Tilldelad</th><th className="px-3">Skapad</th><th className="w-8" /></tr></thead><tbody>{recent.map((ticket) => <tr key={ticket.id} className="border-b border-sand-100 text-[9px] transition hover:bg-sand-50/60"><td className="px-5 py-3"><Link href={`/dashboard/felanmalan/${ticket.id}`} className="block max-w-[180px] truncate font-semibold text-ink-850">{ticket.title}</Link><span className="text-[8px] text-ink-400">#{ticket.id.slice(0, 8).toUpperCase()}</span></td><td className="px-3"><span className="block max-w-[140px] truncate font-medium text-ink-650">{ticket.property?.name || "—"}</span><span className="block max-w-[140px] truncate text-[8px] text-ink-400">{ticket.property?.address || "Ingen fastighet"}</span></td><td className="px-3 text-ink-550">{categoryLabels[ticket.category] || ticket.category}</td><td className="px-3"><span className={`rounded-full px-2 py-1 font-semibold ring-1 ${priorityTone(ticket.priority)}`}>{priorityLabels[ticket.priority] || ticket.priority}</span></td><td className="px-3"><span className={`rounded-full px-2 py-1 font-semibold ring-1 ${statusTone(ticket.status)}`}>{statusLabels[ticket.status] || ticket.status}</span></td><td className="max-w-[120px] truncate px-3 text-ink-550">{ticket.assigned_to?.name || ticket.assigned_to?.email || "Ej tilldelad"}</td><td className="whitespace-nowrap px-3 text-ink-450">{dateTime.format(new Date(ticket.created_at))}</td><td className="pr-3"><Link href={`/dashboard/felanmalan/${ticket.id}`} aria-label={`Öppna ${ticket.title}`}><ChevronRight className="h-4 w-4 text-ink-350" /></Link></td></tr>)}</tbody></table></div> : <EmptyState title="Inga ärenden i urvalet" description="Ändra filtren eller skapa ett nytt ärende." />}
        <div className="flex items-center justify-between gap-4 border-t border-sand-100 px-5 py-3"><p className="text-[9px] text-ink-450">Visar {visibleTickets.length} av {pagination.total.toLocaleString("sv-SE")} träffar</p>{pagination.totalPages > 1 ? <div className="flex gap-1.5"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-sand-200 px-2.5 py-1.5 text-[9px] font-semibold text-ink-600 disabled:opacity-40">Föregående</button><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="rounded-lg border border-sand-200 px-2.5 py-1.5 text-[9px] font-semibold text-ink-600 disabled:opacity-40">Nästa</button></div> : null}</div>
      </article>

      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
        <div className="flex items-center justify-between"><div><h2 className="font-display text-[17px] font-semibold text-ink-950">Akuta ärenden</h2><p className="mt-0.5 text-[9px] text-ink-450">Aktiva ärenden med akut prioritet.</p></div><AlertTriangle className="h-4 w-4 text-red-500" /></div>
        <div className="mt-4 divide-y divide-sand-100">{urgent.length ? urgent.map((ticket) => <Link key={ticket.id} href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-center gap-3 py-3 transition hover:bg-sand-50/60"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-ink-850">{ticket.title}</p><p className="mt-0.5 truncate text-[8px] text-ink-450">{ticket.property?.name || "Ingen fastighet"}</p></div><div className="text-right"><p className="text-[8px] font-semibold text-ink-550">{timeOnly.format(new Date(ticket.created_at))}</p><span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[8px] font-semibold text-red-700">Akut</span></div></Link>) : <p className="py-8 text-center text-[10px] text-ink-450">Inga akuta ärenden i urvalet.</p>}</div>
        <button type="button" onClick={() => { setPriorityFilter("urgent"); setPage(1); }} className="mt-4 inline-flex items-center gap-1 text-[9px] font-semibold text-petroleum-700">Visa alla akuta ärenden <ArrowRight className="h-3 w-3" /></button>
      </article>
    </section>

    {createOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/25 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="new-ticket-title"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-sand-200 bg-[#FFFEFB] shadow-premium-lg"><div className="flex items-start justify-between border-b border-sand-100 px-6 py-5"><div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Drift / Ärenden</p><h2 id="new-ticket-title" className="mt-1 font-display text-[24px] font-semibold text-ink-950">Nytt ärende</h2><p className="mt-1 text-[11px] text-ink-500">Registrera ärendet och gå direkt vidare till handläggningen.</p></div><button type="button" onClick={() => setCreateOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-sand-200 bg-white text-ink-500 hover:bg-sand-50" aria-label="Stäng"><X className="h-4 w-4" /></button></div><form onSubmit={handleCreate} className="space-y-4 p-6"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-ink-650">Fastighet</span><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={premiumFieldClass}><option value="">Ingen vald fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.address}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-ink-650">Kategori</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={premiumFieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-ink-650">Prioritet</span><select value={priority} onChange={(event) => setPriority(event.target.value)} className={premiumFieldClass}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-ink-650">Tilldelad</span><select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className={premiumFieldClass}><option value="">Ej tilldelad</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-ink-650">Titel</span><input required minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className={premiumFieldClass} placeholder="Exempel: Vattenläcka i badrum" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-ink-650">Beskrivning</span><textarea required minLength={10} maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} className={premiumTextareaClass} placeholder="Beskriv problemet, platsen och vad som behöver göras." /></label><div className="flex justify-end gap-2 border-t border-sand-100 pt-4"><button type="button" onClick={() => setCreateOpen(false)} className="h-10 rounded-xl border border-sand-200 bg-white px-4 text-[11px] font-semibold text-ink-600">Avbryt</button><button type="submit" disabled={submitting} className="h-10 rounded-xl bg-petroleum-900 px-5 text-[11px] font-semibold text-white disabled:opacity-60">{submitting ? "Skapar…" : "Skapa ärende"}</button></div></form></div></div> : null}
  </div>;
}
