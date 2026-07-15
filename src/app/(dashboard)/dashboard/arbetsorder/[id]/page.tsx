"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, FolderKanban, Gauge, MapPin, UserRound, Wrench } from "lucide-react";
import { InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
import { OperationalActivityPanel } from "@/components/dashboard/operational-activity-panel";
import { WorkOrderAccountingSyncPanel } from "@/components/dashboard/work-order-accounting-sync-panel";
import { WorkOrderExecutionPanel } from "@/components/dashboard/work-order-execution-panel";
import { WorkOrderFinancialPanel } from "@/components/dashboard/work-order-financial-panel";
import { WorkOrderMaterialsPanel } from "@/components/dashboard/work-order-materials-panel";
import { WorkOrderReportingPanel } from "@/components/dashboard/work-order-reporting-panel";
import { WorkOrderTechnicianPanel } from "@/components/dashboard/work-order-technician-panel";

type StatusEvent = { id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string; actor: { name: string | null; email: string } };
type WorkOrder = {
  id: string; work_order_number: string | null; title: string; description: string; status: string; priority: string; work_type: string; source: string;
  scheduled_start: string | null; scheduled_end: string | null; estimated_cost: string | number | null; actual_cost: string | number | null;
  sla_response_due_at: string | null; sla_resolution_due_at: string | null; responded_at: string | null; completed_at: string | null; closed_at: string | null;
  paused_at: string | null; pause_reason: string | null; billable: boolean; requires_inspection: boolean;
  property: { id: string; name: string; address: string; city: string }; building: { id: string; name: string } | null;
  technical_asset: { id: string; name: string; category: string } | null; unit: { id: string; designation: string; unit_type: string } | null;
  ticket: { id: string; public_reference: string | null; title: string } | null; assigned_to: { id: string; name: string | null; email: string } | null;
  created_by: { id: string; name: string | null; email: string }; projects: { id: string; name: string; status: string }[];
  status_history: StatusEvent[]; allowed_transitions: string[];
};

const statusLabels: Record<string, string> = { new: "Ny", planned: "Planerad", assigned: "Tilldelad", in_progress: "Pågår", waiting_material: "Väntar material", waiting_resident: "Väntar boende", inspection: "Besiktning", completed: "Slutförd", invoiced: "Fakturerad", closed: "Stängd", cancelled: "Avbruten" };
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const workTypeLabels: Record<string, string> = { corrective: "Avhjälpande", preventive: "Förebyggande", inspection: "Besiktning", emergency: "Akut", project: "Projekt", warranty: "Garanti" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string | null, withTime = false) { if (!value) return "Ej satt"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Ej satt" : (withTime ? dateTime : date).format(parsed); }
function slaState(due: string | null, fulfilled: string | null) { if (!due) return { label: "Ej definierad", late: false }; const dueDate = new Date(due); const reference = fulfilled ? new Date(fulfilled) : new Date(); return { label: fulfilled ? (reference <= dueDate ? "Uppfylld" : "Överskriden") : (reference <= dueDate ? "Inom SLA" : "Försenad"), late: reference > dueDate }; }

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");

  async function load() {
    try { const response = await fetch(`/api/work-orders/${id}`, { cache: "no-store" }); if (response.status === 401) { router.push("/login"); return; }
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordern"); setWorkOrder(data.workOrder); }
    catch (err) { setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordern"); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [id]);

  async function save(formData: FormData) {
    setSaving(true); setError(""); setSuccess("");
    try { const payload = Object.fromEntries(formData.entries()); const response = await fetch(`/api/work-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetsordern"); setWorkOrder(data.workOrder); setSuccess("Arbetsordern har uppdaterats och historiken är sparad."); }
    catch (err) { setError(err instanceof Error ? err.message : "Kunde inte uppdatera arbetsordern"); } finally { setSaving(false); }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (!workOrder) return <InlineAlert>{error || "Arbetsordern hittades inte"}</InlineAlert>;
  const estimated = Number(workOrder.estimated_cost || 0); const actual = Number(workOrder.actual_cost || 0);
  const responseSla = slaState(workOrder.sla_response_due_at, workOrder.responded_at); const resolutionSla = slaState(workOrder.sla_resolution_due_at, workOrder.completed_at || workOrder.closed_at);
  const selectableStatuses = [workOrder.status, ...workOrder.allowed_transitions];

  return <div className="space-y-8">
    <Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till arbetsordrar</Link>
    <PageHeader eyebrow={workOrder.work_order_number || "Arbetsorder"} title={workOrder.title} description={workOrder.description} />
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={MapPin} label="Fastighet" value={workOrder.property.name} hint={`${workOrder.property.address}, ${workOrder.property.city}`} />
      <MetricCard icon={UserRound} label="Ansvarig" value={workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"} />
      <MetricCard icon={Gauge} label="Respons-SLA" value={responseSla.label} hint={`Senast ${formatDate(workOrder.sla_response_due_at, true)}`} />
      <MetricCard icon={responseSla.late || resolutionSla.late ? CircleAlert : CheckCircle2} label="Lösnings-SLA" value={resolutionSla.label} hint={`Senast ${formatDate(workOrder.sla_resolution_due_at, true)}`} />
    </section>

    <WorkOrderTechnicianPanel workOrderId={workOrder.id} />

    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Operativ styrning" description="Validerade nästa steg, tidsplan, SLA och ekonomi.">
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-ink-600">Nästa status<select name="status" defaultValue={workOrder.status} className={premiumFieldClass}>{selectableStatuses.map(value => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></label>
          <label className="space-y-1.5 text-xs font-semibold text-ink-600">Prioritet<select name="priority" defaultValue={workOrder.priority} className={premiumFieldClass}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <input name="scheduledStart" type="date" defaultValue={workOrder.scheduled_start?.slice(0, 10) || ""} className={premiumFieldClass} aria-label="Planerad start" />
          <input name="scheduledEnd" type="date" defaultValue={workOrder.scheduled_end?.slice(0, 10) || ""} className={premiumFieldClass} aria-label="Planerat slut" />
          <input name="estimatedCost" type="number" min="0" step="0.01" defaultValue={estimated || ""} placeholder="Beräknad kostnad" className={premiumFieldClass} />
          <input name="actualCost" type="number" min="0" step="0.01" defaultValue={actual || ""} placeholder="Faktisk kostnad" className={premiumFieldClass} />
          <textarea name="statusReason" rows={3} placeholder="Anledning vid väntan, avbrott eller annan viktig statusändring" className={`${premiumFieldClass} sm:col-span-2`} />
          <button disabled={saving} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{saving ? "Sparar…" : "Spara och logga ändring"}</button>
        </form>
        <div className="mt-5 grid gap-3 border-t border-sand-100 pt-5 text-sm text-ink-500 sm:grid-cols-2">
          <p>Typ: <strong className="text-ink-800">{workTypeLabels[workOrder.work_type] || workOrder.work_type}</strong></p><p>Källa: <strong className="text-ink-800">{workOrder.source}</strong></p>
          {workOrder.building ? <p>Byggnad: <strong className="text-ink-800">{workOrder.building.name}</strong></p> : null}
          {workOrder.unit ? <p>Enhet: <strong className="text-ink-800">{workOrder.unit.designation}</strong></p> : null}
          {workOrder.technical_asset ? <Link href={`/dashboard/fastigheter/${workOrder.property.id}/komponenter/${workOrder.technical_asset.id}`} className="flex items-center gap-2 font-semibold text-petroleum-700"><Wrench className="h-4 w-4" />{workOrder.technical_asset.name}</Link> : null}
          {workOrder.ticket ? <p>Ursprungsärende: <strong className="text-ink-800">{workOrder.ticket.public_reference || workOrder.ticket.title}</strong></p> : null}
          <p>Kostnad: <strong className="text-ink-800">{money.format(actual)} / {money.format(estimated)}</strong></p><p>Besiktning krävs: <strong className="text-ink-800">{workOrder.requires_inspection ? "Ja" : "Nej"}</strong></p>
          {workOrder.projects.map(project => <Link key={project.id} href={`/dashboard/projekt/${project.id}`} className="flex items-center gap-2 font-semibold text-petroleum-700"><FolderKanban className="h-4 w-4" />{project.name}</Link>)}
        </div>
      </Panel>
      <OperationalActivityPanel entityType="work_order" entityId={workOrder.id} />
    </section>

    <Panel title="Statushistorik" description="Oföränderligt revisionsspår för arbetsorderns hela livscykel." bodyClassName="p-0">
      {workOrder.status_history.length === 0 ? <p className="p-6 text-sm text-ink-500">Ingen statushistorik registrerad ännu.</p> : <div className="divide-y divide-sand-100">{workOrder.status_history.map(event => <article key={event.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:px-6"><div><p className="font-semibold text-ink-900">{event.from_status ? `${statusLabels[event.from_status] || event.from_status} → ` : ""}{statusLabels[event.to_status] || event.to_status}</p><p className="mt-1 text-sm text-ink-500">{event.reason || "Ingen särskild anledning angiven"}</p><p className="mt-1 text-xs text-ink-400">{event.actor.name || event.actor.email}</p></div><p className="text-xs font-semibold text-ink-500">{formatDate(event.created_at, true)}</p></article>)}</div>}
    </Panel>

    <WorkOrderExecutionPanel workOrderId={workOrder.id} />
    <WorkOrderMaterialsPanel workOrderId={workOrder.id} />
    <WorkOrderFinancialPanel workOrderId={workOrder.id} />
    <WorkOrderAccountingSyncPanel workOrderId={workOrder.id} />
    <WorkOrderReportingPanel workOrderId={workOrder.id} />
    <OperationalDocumentsPanel entityType="work_order" entityId={workOrder.id} />
  </div>;
}
