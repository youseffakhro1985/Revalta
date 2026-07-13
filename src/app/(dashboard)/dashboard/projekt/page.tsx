"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CircleDollarSign, TrendingUp, WalletCards } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Project = { id: string; property_name?: string; name?: string; status?: string; project_manager?: string; contractor?: string; start_date?: string | null; end_date?: string | null; risk?: string; budget?: number; forecast?: number; actual?: number; deviation?: number };
type Property = { id: string; name: string };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const statusLabels: Record<string, string> = { planned: "Planerad", active: "Pågående", paused: "Pausad", completed: "Slutförd" };
const riskLabels: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög" };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/projects", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) { setProjects(data.projects || []); setProperties(data.properties || []); }
    else setError(data.error || "Kunde inte hämta projekt");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => projects.reduce((sum, project) => ({ budget: sum.budget + Number(project.budget || 0), forecast: sum.forecast + Number(project.forecast || 0), actual: sum.actual + Number(project.actual || 0) }), { budget: 0, forecast: 0, actual: 0 }), [projects]);

  async function createProject(formData: FormData) {
    setSaving(true); setError(""); setSuccess("");
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Kunde inte skapa projektet");
    else { setSuccess("Projektet har skapats."); await load(); }
    setSaving(false);
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Projektstyrning" title="Projekt och entreprenader" description="Samla investeringar, renoveringar, entreprenörer, tidsplaner och ekonomi i en tydlig projektportfölj." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={BriefcaseBusiness} label="Aktiva projekt" value={String(projects.filter((p) => p.status !== "completed").length)} /><MetricCard icon={WalletCards} label="Budget" value={money.format(totals.budget)} /><MetricCard icon={TrendingUp} label="Prognos" value={money.format(totals.forecast)} /><MetricCard icon={CircleDollarSign} label="Utfall" value={money.format(totals.actual)} /></section>
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <Panel title="Nytt projekt" description="Registrera ansvar, entreprenör, tidsplan, risk och ekonomiska ramar.">
      <form action={createProject} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <select name="propertyId" required className={premiumFieldClass}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input name="name" required placeholder="Projektnamn" className={premiumFieldClass} />
        <input name="projectManager" placeholder="Projektledare" className={premiumFieldClass} />
        <input name="contractor" placeholder="Entreprenör" className={premiumFieldClass} />
        <input name="startDate" type="date" className={premiumFieldClass} />
        <input name="endDate" type="date" className={premiumFieldClass} />
        <select name="status" className={premiumFieldClass}><option value="planned">Planerad</option><option value="active">Pågående</option><option value="paused">Pausad</option><option value="completed">Slutförd</option></select>
        <select name="risk" className={premiumFieldClass}><option value="low">Låg risk</option><option value="medium">Medelrisk</option><option value="high">Hög risk</option></select>
        <input name="budget" type="number" min="0" placeholder="Budget" className={premiumFieldClass} />
        <input name="forecast" type="number" min="0" placeholder="Prognos" className={premiumFieldClass} />
        <input name="actual" type="number" min="0" placeholder="Utfall" className={premiumFieldClass} />
        <button disabled={saving} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Lägg till projekt"}</button>
      </form>
    </Panel>

    <Panel title="Projektportfölj" description="Samlad översikt över ansvar, tidsplan, ekonomi och risk." bodyClassName="p-0">
      {loading ? <p className="p-6 text-sm text-ink-500">Laddar projekt…</p> : projects.length === 0 ? <EmptyState title="Inga projekt registrerade" description="Skapa det första projektet för att börja följa tidsplan och ekonomi." /> : <div className="divide-y divide-sand-100">{projects.map((project) => <article key={project.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{project.name}</h3><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-petroleum-800">{statusLabels[project.status || "planned"]}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${project.risk === "high" ? "bg-red-50 text-red-800" : "bg-sand-100 text-ink-600"}`}>Risk {riskLabels[project.risk || "low"]}</span></div><p className="mt-1 text-sm text-ink-500">{project.property_name}</p><p className="mt-3 text-xs text-ink-400">{project.start_date || "Ej satt"} – {project.end_date || "Ej satt"}</p></div><div className="grid grid-cols-2 gap-4 text-xs text-ink-500 sm:grid-cols-4"><span>Projektledare<strong className="mt-1 block text-ink-800">{project.project_manager || "Ej tilldelad"}</strong></span><span>Entreprenör<strong className="mt-1 block text-ink-800">{project.contractor || "Ej vald"}</strong></span><span>Prognos<strong className="mt-1 block text-ink-800">{money.format(Number(project.forecast || 0))}</strong></span><span>Avvikelse<strong className={`mt-1 block ${Number(project.deviation || 0) > 0 ? "text-red-700" : "text-petroleum-800"}`}>{money.format(Number(project.deviation || 0))}</strong></span></div></div></article>)}</div>}
    </Panel>
  </div>;
}
