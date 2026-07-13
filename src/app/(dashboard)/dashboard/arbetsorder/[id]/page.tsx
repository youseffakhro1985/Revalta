"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, CalendarClock, FolderKanban, MapPin, UserRound } from "lucide-react";
import { InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
import { OperationalActivityPanel } from "@/components/dashboard/operational-activity-panel";
import { WorkOrderExecutionPanel } from "@/components/dashboard/work-order-execution-panel";

type WorkOrder = {
  id: string; title: string; description: string; status: string; priority: string;
  scheduled_start: string | null; scheduled_end: string | null;
  estimated_cost: string | number | null; actual_cost: string | number | null;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string } | null;
  ticket: { id: string; public_reference: string | null; title: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
  created_by: { id: string; name: string | null; email: string };
  projects: { id: string; name: string; status: string }[];
};

const statusLabels: Record<string, string> = { planned: "Planerad", assigned: "Tilldelad", in_progress: "Pågående", waiting: "Väntar", completed: "Slutförd", cancelled: "Avbruten" };
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/work-orders/${id}`, { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordern");
        if (active) setWorkOrder(data.workOrder);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordern");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [id, router]);

  async function save(formData: FormData) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch(`/api/work-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetsordern");
      setWorkOrder(data.workOrder); setSuccess("Arbetsordern har uppdaterats.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte uppdatera arbetsordern"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (!workOrder) return <InlineAlert>{error || "Arbetsordern hittades inte"}</InlineAlert>;

  const estimated = Number(workOrder.estimated_cost || 0);
  const actual = Number(workOrder.actual_cost || 0);
  return <div className="space-y-8">
    <Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till arbetsordrar</Link>
    <PageHeader eyebrow="Arbetsorder" title={workOrder.title} description={workOrder.description} />
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={MapPin} label="Fastighet" value={workOrder.property.name} hint={`${workOrder.property.address}, ${workOrder.property.city}`} />
      <MetricCard icon={UserRound} label="Ansvarig" value={workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"} />
      <MetricCard icon={CalendarClock} label="Planerat slut" value={workOrder.scheduled_end ? date.format(new Date(workOrder.scheduled_end)) : "Ej satt"} />
      <MetricCard icon={Banknote} label="Kostnadsutfall" value={money.format(actual)} hint={`Beräknat ${money.format(estimated)}`} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Styrning" description="Uppdatera status, prioritet, tidsplan och ekonomi.">
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <select name="status" defaultValue={workOrder.status} className={premiumFieldClass}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="priority" defaultValue={workOrder.priority} className={premiumFieldClass}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="scheduledStart" type="date" defaultValue={workOrder.scheduled_start?.slice(0, 10) || ""} className={premiumFieldClass} />
          <input name="scheduledEnd" type="date" defaultValue={workOrder.scheduled_end?.slice(0, 10) || ""} className={premiumFieldClass} />
          <input name="estimatedCost" type="number" min="0" step="0.01" defaultValue={estimated || ""} placeholder="Beräknad kostnad" className={premiumFieldClass} />
          <input name="actualCost" type="number" min="0" step="0.01" defaultValue={actual || ""} placeholder="Faktisk kostnad" className={premiumFieldClass} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{saving ? "Sparar…" : "Spara ändringar"}</button>
        </form>
        <div className="mt-5 space-y-2 border-t border-sand-100 pt-5 text-sm text-ink-500">
          {workOrder.unit ? <p>Enhet: <strong className="text-ink-800">{workOrder.unit.designation}</strong></p> : null}
          {workOrder.ticket ? <p>Ursprungsärende: <strong className="text-ink-800">{workOrder.ticket.public_reference || workOrder.ticket.title}</strong></p> : null}
          {workOrder.projects.map((project) => <Link key={project.id} href={`/dashboard/projekt/${project.id}`} className="flex items-center gap-2 font-semibold text-petroleum-700 hover:text-petroleum-900"><FolderKanban className="h-4 w-4" />{project.name}</Link>)}
        </div>
      </Panel>
      <OperationalActivityPanel entityType="work_order" entityId={workOrder.id} />
    </section>

    <WorkOrderExecutionPanel workOrderId={workOrder.id} />
    <OperationalDocumentsPanel entityType="work_order" entityId={workOrder.id} />
  </div>;
}
