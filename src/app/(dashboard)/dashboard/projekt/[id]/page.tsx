"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CalendarRange, CircleDollarSign, ShieldAlert } from "lucide-react";
import { InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
import { OperationalActivityPanel } from "@/components/dashboard/operational-activity-panel";

type Project = {
  id: string; name: string; description: string | null; contractor: string | null;
  status: string; risk: string; start_date: string | null; end_date: string | null;
  budget: string | number; forecast: string | number; actual: string | number;
  property: { id: string; name: string; address: string; city: string };
  manager: { id: string; name: string | null; email: string } | null;
  created_by: { id: string; name: string | null; email: string };
  source_work_order: { id: string; title: string; status: string } | null;
};

const statusLabels: Record<string, string> = { planned: "Planerad", active: "Pågående", paused: "Pausad", completed: "Slutförd", cancelled: "Avbruten" };
const riskLabels: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta projektet");
        if (active) setProject(data.project);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Kunde inte hämta projektet"); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [id, router]);

  async function save(formData: FormData) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera projektet");
      setProject(data.project); setSuccess("Projektet har uppdaterats.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte uppdatera projektet"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (!project) return <InlineAlert>{error || "Projektet hittades inte"}</InlineAlert>;

  const budget = Number(project.budget || 0);
  const forecast = Number(project.forecast || 0);
  const actual = Number(project.actual || 0);
  const deviation = forecast - budget;

  return <div className="space-y-8">
    <Link href="/dashboard/projekt" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till projektportföljen</Link>
    <PageHeader eyebrow="Projektstyrning" title={project.name} description={project.description || "Samlad projektstyrning för tidsplan, risk, ekonomi, dokument och beslut."} />
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Building2} label="Fastighet" value={project.property.name} hint={`${project.property.address}, ${project.property.city}`} />
      <MetricCard icon={CalendarRange} label="Tidsplan" value={project.end_date ? date.format(new Date(project.end_date)) : "Ej satt"} hint={project.start_date ? `Start ${date.format(new Date(project.start_date))}` : "Start ej satt"} />
      <MetricCard icon={CircleDollarSign} label="Prognos" value={money.format(forecast)} hint={`Budget ${money.format(budget)}`} />
      <MetricCard icon={ShieldAlert} label="Risk och avvikelse" value={riskLabels[project.risk] || project.risk} hint={money.format(deviation)} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Projektstyrning" description="Uppdatera ansvar, status, risk, tidsplan och ekonomi.">
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <input name="name" defaultValue={project.name} className={`${premiumFieldClass} sm:col-span-2`} />
          <input name="contractor" defaultValue={project.contractor || ""} placeholder="Entreprenör" className={premiumFieldClass} />
          <select name="status" defaultValue={project.status} className={premiumFieldClass}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="risk" defaultValue={project.risk} className={premiumFieldClass}>{Object.entries(riskLabels).map(([value, label]) => <option key={value} value={value}>{label} risk</option>)}</select>
          <input name="startDate" type="date" defaultValue={project.start_date?.slice(0, 10) || ""} className={premiumFieldClass} />
          <input name="endDate" type="date" defaultValue={project.end_date?.slice(0, 10) || ""} className={premiumFieldClass} />
          <input name="budget" type="number" min="0" step="0.01" defaultValue={budget} className={premiumFieldClass} />
          <input name="forecast" type="number" min="0" step="0.01" defaultValue={forecast} className={premiumFieldClass} />
          <input name="actual" type="number" min="0" step="0.01" defaultValue={actual} className={premiumFieldClass} />
          <textarea name="description" defaultValue={project.description || ""} placeholder="Projektbeskrivning" className={`${premiumFieldClass} min-h-28 sm:col-span-2`} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{saving ? "Sparar…" : "Spara projekt"}</button>
        </form>
        <div className="mt-5 space-y-2 border-t border-sand-100 pt-5 text-sm text-ink-500">
          <p>Projektledare: <strong className="text-ink-800">{project.manager?.name || project.manager?.email || "Ej tilldelad"}</strong></p>
          <p>Utfall: <strong className="text-ink-800">{money.format(actual)}</strong></p>
          {project.source_work_order ? <Link href={`/dashboard/arbetsorder/${project.source_work_order.id}`} className="font-semibold text-petroleum-700 hover:text-petroleum-900">Från arbetsorder: {project.source_work_order.title}</Link> : null}
        </div>
      </Panel>
      <OperationalActivityPanel entityType="project" entityId={project.id} />
    </section>

    <OperationalDocumentsPanel entityType="project" entityId={project.id} />
  </div>;
}
