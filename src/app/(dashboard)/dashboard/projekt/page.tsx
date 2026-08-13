"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, CircleDollarSign, FolderKanban, TrendingUp, WalletCards } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
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

function formatDate(value?: string | null) {
  return value ? date.format(new Date(value)) : "Ej satt";
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

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
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

  async function createProject(formData: FormData) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa projektet");
      setSuccess("Projektet har skapats och kopplats till projektportföljen.");
      if (page === 1) await load(1);
      else setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa projektet");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(projectId: string, status: string) {
    setUpdatingId(projectId); setError(""); setSuccess("");
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

  return <div className="space-y-8">
    <PageHeader eyebrow="Projektstyrning" title="Projekt och entreprenader" description="Samla investeringar, renoveringar, entreprenörer, tidsplaner och ekonomi i en relationell projektportfölj." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={BriefcaseBusiness} label="Aktiva projekt" value={String(summary.active)} />
      <MetricCard icon={WalletCards} label="Budget" value={summary.budget === null ? "Dold" : money.format(summary.budget)} />
      <MetricCard icon={TrendingUp} label="Prognos" value={summary.forecast === null ? "Dold" : money.format(summary.forecast)} />
      <MetricCard icon={CircleDollarSign} label="Utfall" value={summary.actual === null ? "Dold" : money.format(summary.actual)} />
    </section>
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}
    <SoftDeleteUndoBanner
      entityLabel="Projektet"
      restoreApiPath={(id) => `/api/projects/${id}/restore`}
      detailPath={(id) => `/dashboard/projekt/${id}`}
    />

    <Panel title="Nytt projekt" description="Registrera ansvar, entreprenör, tidsplan, risk och ekonomiska ramar.">
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
        <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Lägg till projekt"}</button>
      </form>
    </Panel>

    <Panel title="Projektportfölj" description="Samlad översikt över ansvar, tidsplan, ekonomi, ursprungsarbetsorder och risk." bodyClassName="p-0">
      {loading ? <p className="p-6 text-sm text-ink-500">Laddar projekt…</p> : projects.length === 0 ? <EmptyState title="Inga projekt registrerade" description="Skapa det första projektet eller omvandla en större arbetsorder till projekt." /> : <><div className="divide-y divide-sand-100">{projects.map((project) => <article key={project.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Link href={`/dashboard/projekt/${project.id}`} className="font-semibold text-ink-900 transition hover:text-petroleum-800 focus:outline-none focus:ring-2 focus:ring-petroleum-200 focus:ring-offset-2">{project.name}</Link><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{statusLabels[project.status] || project.status}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${project.risk === "high" ? "bg-red-50 text-red-800" : "bg-sand-100 text-ink-600"}`}>Risk {riskLabels[project.risk] || project.risk}</span></div>
            <p className="mt-1 text-sm text-ink-500">{project.property_name}</p>
            <p className="mt-3 text-xs text-ink-500">{formatDate(project.start_date)} – {formatDate(project.end_date)}</p>
            {project.source_work_order ? <Link href={`/dashboard/arbetsorder/${project.source_work_order.id}`} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sand-50 px-3 py-2 text-xs text-ink-600 transition hover:bg-sand-100 hover:text-petroleum-800"><FolderKanban className="h-4 w-4 text-petroleum-700" />Från arbetsorder: {project.source_work_order.title}</Link> : null}
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-ink-500 sm:grid-cols-4 lg:min-w-[520px]">
            <span>Projektledare<strong className="mt-1 block text-ink-800">{project.project_manager || "Ej tilldelad"}</strong></span>
            <span>Entreprenör<strong className="mt-1 block text-ink-800">{project.contractor || "Ej vald"}</strong></span>
            <span>Prognos<strong className="mt-1 block text-ink-800">{money.format(Number(project.forecast || 0))}</strong></span>
            <span>Avvikelse<strong className={`mt-1 block ${Number(project.deviation || 0) > 0 ? "text-red-700" : "text-petroleum-800"}`}>{money.format(Number(project.deviation || 0))}</strong></span>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-sand-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-xs text-ink-500">Budget {money.format(Number(project.budget || 0))} · Utfall {money.format(Number(project.actual || 0))}</p>
            <Link href={`/dashboard/projekt/${project.id}`} className="text-xs font-semibold text-petroleum-700 transition hover:text-petroleum-900">Öppna projektdetalj</Link>
          </div>
          <select value={project.status} disabled={updatingId === project.id} onChange={(event) => void changeStatus(project.id, event.target.value)} className={`${premiumFieldClass} sm:w-44`} aria-label={`Ändra status för ${project.name}`}><option value="planned">Planerad</option><option value="active">Pågående</option><option value="paused">Pausad</option><option value="completed">Slutförd</option><option value="cancelled">Avbruten</option></select>
        </div>
      </article>)}</div><nav className="flex flex-col gap-3 border-t border-sand-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Projektpaginering"><p className="text-ink-500">Visar sida {pagination.page} av {pagination.totalPages} · {pagination.total} projekt</p><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Föregående</button><button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Nästa</button></div></nav></>}
    </Panel>
  </div>;
}
