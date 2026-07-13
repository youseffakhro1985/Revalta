"use client";

import { useEffect, useMemo, useState } from "react";

type Project = {
  id: string;
  property_name?: string;
  name?: string;
  status?: string;
  project_manager?: string;
  contractor?: string;
  start_date?: string | null;
  end_date?: string | null;
  risk?: string;
  budget?: number;
  forecast?: number;
  actual?: number;
  deviation?: number;
};

type Property = { id: string; name: string };

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/projects", { cache: "no-store" });
    const data = await response.json();
    setProjects(data.projects || []);
    setProperties(data.properties || []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => projects.reduce((sum, project) => ({
    budget: sum.budget + Number(project.budget || 0),
    forecast: sum.forecast + Number(project.forecast || 0),
    actual: sum.actual + Number(project.actual || 0),
  }), { budget: 0, forecast: 0, actual: 0 }), [projects]);

  async function createProject(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) await load();
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">Projektstyrning</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900">Projekt och entreprenader</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-500">Samla investeringar, renoveringar, entreprenörer, tidsplaner och ekonomi i en tydlig projektportfölj.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[["Aktiva projekt", projects.filter((p) => p.status !== "completed").length], ["Budget", money.format(totals.budget)], ["Prognos", money.format(totals.forecast)], ["Utfall", money.format(totals.actual)]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-petroleum-800">{value}</p>
          </div>
        ))}
      </div>

      <form action={createProject} className="grid gap-4 rounded-2xl border border-sand-200 bg-white p-6 lg:grid-cols-4">
        <select name="propertyId" required className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm"><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
        <input name="name" required placeholder="Projektnamn" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <input name="projectManager" placeholder="Projektledare" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <input name="contractor" placeholder="Entreprenör" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <input name="startDate" type="date" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <input name="endDate" type="date" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <select name="status" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm"><option value="planned">Planerad</option><option value="active">Pågående</option><option value="paused">Pausad</option><option value="completed">Slutförd</option></select>
        <select name="risk" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm"><option value="low">Låg risk</option><option value="medium">Medelrisk</option><option value="high">Hög risk</option></select>
        <input name="budget" type="number" min="0" placeholder="Budget" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <input name="forecast" type="number" min="0" placeholder="Prognos" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <input name="actual" type="number" min="0" placeholder="Utfall" className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm" />
        <button className="rounded-xl bg-petroleum-800 px-4 py-2.5 text-sm font-semibold text-white">Lägg till projekt</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-4 border-b border-sand-200 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          <span>Projekt</span><span>Ansvar</span><span>Tidsplan</span><span>Ekonomi</span><span>Status</span>
        </div>
        {loading ? <p className="p-6 text-sm text-ink-400">Laddar projekt…</p> : projects.length === 0 ? <p className="p-6 text-sm text-ink-400">Inga projekt registrerade ännu.</p> : projects.map((project) => (
          <div key={project.id} className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-4 border-b border-sand-100 px-5 py-4 text-sm last:border-b-0">
            <div><p className="font-semibold text-ink-900">{project.name}</p><p className="mt-1 text-xs text-ink-400">{project.property_name}</p></div>
            <div><p>{project.project_manager || "Ej tilldelad"}</p><p className="mt-1 text-xs text-ink-400">{project.contractor || "Ingen entreprenör"}</p></div>
            <div><p>{project.start_date || "–"} – {project.end_date || "–"}</p><p className="mt-1 text-xs text-ink-400">Risk: {project.risk || "low"}</p></div>
            <div><p>{money.format(Number(project.forecast || 0))}</p><p className="mt-1 text-xs text-ink-400">Avvikelse {money.format(Number(project.deviation || 0))}</p></div>
            <span className="w-fit rounded-full bg-petroleum-50 px-2.5 py-1 text-xs font-medium text-petroleum-800">{project.status || "planned"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
