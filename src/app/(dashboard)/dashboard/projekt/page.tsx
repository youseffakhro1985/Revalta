"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, CalendarDays, CircleDollarSign, FolderKanban, Plus, Search, TrendingUp, WalletCards } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
} from "@/components/dashboard/premium-ui";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";
import { readResponseJson } from "@/lib/fetch-json";

type Project = {
  id: string;
  property_name?: string;
  name: string;
  status: string;
  project_manager?: string;
  contractor?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  risk: string;
  budget: number;
  forecast: number;
  actual: number;
  deviation: number;
  source_work_order?: { id: string; title: string; status: string } | null;
};
type Property = { id: string; name: string };
type Member = { id: string; name: string | null; email: string };
type ProjectSummary = { active: number; budget: number | null; forecast: number | null; actual: number | null };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const statusLabels: Record<string, string> = { planned: "Planerad", active: "Pågående", paused: "Pausad", completed: "Slutförd", cancelled: "Avbruten" };
const riskLabels: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög" };
const statusTone: Record<string, string> = {
  planned: "border-sand-200 bg-sand-50 text-ink-600",
  active: "border-petroleum-100 bg-petroleum-50 text-petroleum-800",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-sand-200 bg-sand-100 text-ink-500",
};

function formatDate(value?: string | null) {
  return value ? date.format(new Date(value)) : "Ej satt";
}

function timelinePercent(project: Project) {
  if (!project.start_date || !project.end_date) return null;
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.end_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summary, setSummary] = useState<ProjectSummary>({ active: 0, budget: 0, forecast: 0, actual: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects?page=${requestedPage}&pageSize=50`, { cache: "no-store" });
      const data = await readResponseJson<{ error?: string; projects?: Project[]; properties?: Property[]; members?: Member[]; summary?: ProjectSummary; pagination?: Pagination }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta projekt");
      setProjects(data.projects || []);
      setProperties(data.properties || []);
      setMembers(data.members || []);
      setSummary(data.summary || { active: 0, budget: 0, forecast: 0, actual: 0 });
      setPagination(data.pagination || { page: requestedPage, pageSize: 50, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta projekt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (riskFilter !== "all" && project.risk !== riskFilter) return false;
      if (!needle) return true;
      return `${project.name} ${project.property_name || ""} ${project.project_manager || ""} ${project.contractor || ""}`.toLowerCase().includes(needle);
    });
  }, [projects, query, statusFilter, riskFilter]);

  const attentionProjects = useMemo(() => projects.filter((project) => {
    if (["completed", "cancelled"].includes(project.status)) return false;
    if (project.risk === "high" || Number(project.deviation || 0) > 0) return true;
    return Boolean(project.end_date && new Date(project.end_date).getTime() < Date.now());
  }).slice(0, 5), [projects]);

  async function createProject(formData: FormData) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa projektet");
      setSuccess("Projektet har skapats och kopplats till projektportföljen.");
      setShowCreate(false);
      if (page === 1) await load(1);
      else setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa projektet");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(projectId: string, status: string) {
    setUpdatingId(projectId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera projektet");
      setProjects((current) => current.map((project) => project.id === projectId ? {
        ...project,
        ...data.project,
        property_name: data.project.property?.name || project.property_name,
        project_manager: data.project.manager?.name || data.project.manager?.email || "",
        budget: Number(data.project.budget),
        forecast: Number(data.project.forecast),
        actual: Number(data.project.actual),
        deviation: Number(data.project.forecast) - Number(data.project.budget),
      } : project));
      setSuccess("Projektstatusen har uppdaterats.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera projektet");
    } finally {
      setUpdatingId(null);
    }
  }

  const summaryDeviation = summary.budget === null || summary.forecast === null ? null : summary.forecast - summary.budget;
  const hasFilters = Boolean(query || statusFilter !== "all" || riskFilter !== "all");

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Projektstyrning"
      title="Projekt och entreprenader"
      description="En samlad portfölj för investeringar, renoveringar och entreprenader – med ansvar, tidslinje, risk och ekonomi i samma beslutsbild."
      action={<button type="button" onClick={() => setShowCreate((value) => !value)} className={showCreate ? premiumSecondaryButtonClass : premiumPrimaryButtonClass}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{showCreate ? "Stäng" : "Nytt projekt"}</button>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={BriefcaseBusiness} label="Aktiva projekt" value={String(summary.active)} hint={`${pagination.total} projekt i portföljen`} />
      <MetricCard icon={WalletCards} label="Budget" value={summary.budget === null ? "Dold" : money.format(summary.budget)} />
      <MetricCard icon={TrendingUp} label="Prognos" value={summary.forecast === null ? "Dold" : money.format(summary.forecast)} hint={summaryDeviation === null ? "Ekonomidata begränsad" : `${summaryDeviation > 0 ? "+" : ""}${money.format(summaryDeviation)} mot budget`} />
      <MetricCard icon={CircleDollarSign} label="Utfall" value={summary.actual === null ? "Dold" : money.format(summary.actual)} />
    </section>

    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    <SoftDeleteUndoBanner entityLabel="Projektet" restoreApiPath={(id) => `/api/projects/${id}/restore`} detailPath={(id) => `/dashboard/projekt/${id}`} />

    {showCreate ? <Panel title="Nytt projekt" description="Registrera ansvar, entreprenör, tidsplan, risk och ekonomiska ramar. Projektet kan därefter öppnas för mer detaljerad styrning.">
      <form action={createProject} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <select name="propertyId" required className={premiumFieldClass} aria-label="Välj fastighet"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input name="name" required placeholder="Projektnamn" className={premiumFieldClass} aria-label="Projektnamn" />
        <select name="managerId" className={premiumFieldClass} aria-label="Välj projektledare"><option value="">Välj projektledare</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}</select>
        <input name="contractor" placeholder="Entreprenör" className={premiumFieldClass} aria-label="Entreprenör" />
        <input name="startDate" type="date" className={premiumFieldClass} aria-label="Startdatum" />
        <input name="endDate" type="date" className={premiumFieldClass} aria-label="Slutdatum" />
        <select name="status" className={premiumFieldClass} aria-label="Status"><option value="planned">Planerad</option><option value="active">Pågående</option><option value="paused">Pausad</option><option value="completed">Slutförd</option></select>
        <select name="risk" className={premiumFieldClass} aria-label="Risk"><option value="low">Låg risk</option><option value="medium">Medelrisk</option><option value="high">Hög risk</option></select>
        <input name="budget" type="number" min="0" step="0.01" placeholder="Budget" className={premiumFieldClass} aria-label="Budget" />
        <input name="forecast" type="number" min="0" step="0.01" placeholder="Prognos" className={premiumFieldClass} aria-label="Prognos" />
        <input name="actual" type="number" min="0" step="0.01" placeholder="Utfall" className={premiumFieldClass} aria-label="Utfall" />
        <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Skapa projekt"}</button>
      </form>
    </Panel> : null}

    <section className="grid gap-6 xl:grid-cols-[1fr_0.7fr]">
      <Panel title="Portföljfilter" description="Filtrerar den aktuella projektsidan. Serverpagineringen ligger kvar för stora bestånd.">
        <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-400" aria-hidden="true" /><input className={`${premiumFieldClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök projekt, fastighet eller entreprenör" aria-label="Sök projekt" /></label>
          <select className={premiumFieldClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrera projektstatus"><option value="all">Alla statusar</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className={premiumFieldClass} value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} aria-label="Filtrera risk"><option value="all">Alla risker</option>{Object.entries(riskLabels).map(([value, label]) => <option key={value} value={value}>{label} risk</option>)}</select>
          <button type="button" disabled={!hasFilters} onClick={() => { setQuery(""); setStatusFilter("all"); setRiskFilter("all"); }} className={premiumSecondaryButtonClass}>Rensa</button>
        </div>
      </Panel>

      <Panel title="Behöver uppmärksamhet" description="Hög risk, budgetavvikelse eller passerat slutdatum." bodyClassName="p-0">
        {attentionProjects.length === 0 ? <EmptyState title="Inga kritiska signaler på sidan" /> : <div className="divide-y divide-sand-100">{attentionProjects.map((project) => <Link key={project.id} href={`/dashboard/projekt/${project.id}`} className="flex items-start gap-3 px-5 py-4 transition hover:bg-sand-50/70"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-800"><AlertTriangle className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink-800">{project.name}</span><span className="mt-1 block truncate text-xs text-ink-500">{project.property_name} · {riskLabels[project.risk]} risk{Number(project.deviation || 0) > 0 ? ` · +${money.format(project.deviation)}` : ""}</span></span></Link>)}</div>}
      </Panel>
    </section>

    <Panel title="Projektportfölj" description={`${visibleProjects.length} projekt visas på sida ${pagination.page} av ${pagination.totalPages}`} bodyClassName="p-0">
      {loading ? <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-sand-100" />)}</div> : visibleProjects.length === 0 ? <EmptyState title="Inga projekt matchar urvalet" description="Justera filtren, byt sida eller skapa ett nytt projekt." /> : <>
        <div className="divide-y divide-sand-100">{visibleProjects.map((project) => {
          const timeline = timelinePercent(project);
          return <article key={project.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/projekt/${project.id}`} className="font-display text-lg font-semibold text-ink-900 transition hover:text-petroleum-800 focus:outline-none focus:ring-2 focus:ring-petroleum-200 focus:ring-offset-2">{project.name}</Link>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone[project.status] || statusTone.planned}`}>{statusLabels[project.status] || project.status}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${project.risk === "high" ? "bg-red-50 text-red-800" : project.risk === "medium" ? "bg-amber-50 text-amber-800" : "bg-sand-100 text-ink-600"}`}>Risk {riskLabels[project.risk] || project.risk}</span>
                </div>
                <p className="mt-1 text-sm text-ink-500">{project.property_name}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-500"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(project.start_date)} – {formatDate(project.end_date)}</span><span>Projektledare <strong className="font-semibold text-ink-700">{project.project_manager || "Ej tilldelad"}</strong></span><span>Entreprenör <strong className="font-semibold text-ink-700">{project.contractor || "Ej vald"}</strong></span></div>
                {timeline != null ? <div className="mt-4 max-w-xl"><div className="flex items-center justify-between text-[10px] font-medium text-ink-500"><span>Tidslinje</span><span>{Math.round(timeline)} % av planerad tid</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-700" style={{ width: `${timeline}%` }} /></div></div> : null}
                {project.source_work_order ? <Link href={`/dashboard/arbetsorder/${project.source_work_order.id}`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-sand-50 px-3 py-2 text-xs text-ink-600 transition hover:border-petroleum-200 hover:text-petroleum-800"><FolderKanban className="h-4 w-4 text-petroleum-700" />Från arbetsorder: {project.source_work_order.title}</Link> : null}
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-4 text-xs text-ink-500 sm:grid-cols-4 lg:min-w-[520px] lg:self-start">
                <span>Budget<strong className="mt-1 block text-ink-800">{money.format(Number(project.budget || 0))}</strong></span>
                <span>Prognos<strong className="mt-1 block text-ink-800">{money.format(Number(project.forecast || 0))}</strong></span>
                <span>Utfall<strong className="mt-1 block text-ink-800">{money.format(Number(project.actual || 0))}</strong></span>
                <span>Avvikelse<strong className={`mt-1 block ${Number(project.deviation || 0) > 0 ? "text-red-700" : "text-petroleum-800"}`}>{Number(project.deviation || 0) > 0 ? "+" : ""}{money.format(Number(project.deviation || 0))}</strong></span>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 border-t border-sand-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/dashboard/projekt/${project.id}`} className="text-sm font-semibold text-petroleum-700 transition hover:text-petroleum-900">Öppna projektet</Link>
              <select value={project.status} disabled={updatingId === project.id} onChange={(event) => void changeStatus(project.id, event.target.value)} className={`${premiumFieldClass} sm:w-44`} aria-label={`Ändra status för ${project.name}`}><option value="planned">Planerad</option><option value="active">Pågående</option><option value="paused">Pausad</option><option value="completed">Slutförd</option><option value="cancelled">Avbruten</option></select>
            </div>
          </article>;
        })}</div>
        <nav className="flex flex-col gap-3 border-t border-sand-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Projektpaginering"><p className="text-ink-500">Visar sida {pagination.page} av {pagination.totalPages} · {pagination.total} projekt totalt</p><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className={premiumSecondaryButtonClass}>Föregående</button><button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className={premiumSecondaryButtonClass}>Nästa</button></div></nav>
      </>}
    </Panel>
  </div>;
}
