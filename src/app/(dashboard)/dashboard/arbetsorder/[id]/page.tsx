"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, CalendarClock, CheckCircle2, Clock3, FolderKanban, History, MapPin, PauseCircle, ShieldAlert, UserRound } from "lucide-react";
import { InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
import { OperationalActivityPanel } from "@/components/dashboard/operational-activity-panel";
import { WorkOrderExecutionPanel } from "@/components/dashboard/work-order-execution-panel";
import { WorkOrderReportingPanel } from "@/components/dashboard/work-order-reporting-panel";

type EnterpriseState = {
  work_order_number: string | null;
  work_type: string;
  source: string;
  sla_response_due_at: string | null;
  sla_resolution_due_at: string | null;
  responded_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  closed_at: string | null;
} | null;

type StatusEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string;
};

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
  enterprise: EnterpriseState;
  statusEvents: StatusEvent[];
};

const statusLabels: Record<string, string> = { new: "Ny", planned: "Planerad", in_progress: "Pågående", waiting_material: "Väntar material", blocked: "Blockerad", completed: "Slutförd", invoiced: "Fakturerad", cancelled: "Avbruten" };
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const typeLabels: Record<string, string> = { corrective: "Avhjälpande", preventive: "Förebyggande", inspection: "Besiktning", emergency: "Akut", project: "Projekt", warranty: "Garanti" };
const sourceLabels: Record<string, string> = { internal: "Internt", ticket: "Ärende", maintenance_plan: "Underhållsplan", inspection: "Besiktning", component: "Komponent", resident: "Boende", supplier: "Leverantör" };
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function deadlineState(value: string | null, completed: string | null) {
  if (!value) return { label: "Ej satt", tone: "text-ink-600", detail: "Ingen tidsgräns" };
  if (completed) return { label: "Uppfyllt", tone: "text-emerald-800", detail: dateTime.format(new Date(completed)) };
  const remaining = new Date(value).getTime() - Date.now();
  if (remaining < 0) return { label: "Försenat", tone: "text-red-700", detail: dateTime.format(new Date(value)) };
  if (remaining <= 4 * 60 * 60 * 1000) return { label: "Kritiskt", tone: "text-red-700", detail: dateTime.format(new Date(value)) };
  if (remaining <= 24 * 60 * 60 * 1000) return { label: "Snart", tone: "text-amber-800", detail: dateTime.format(new Date(value)) };
  return { label: "Inom SLA", tone: "text-emerald-800", detail: dateTime.format(new Date(value)) };
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setError("");
    try {
      const response = await fetch(`/api/work-orders/${id}`, { cache: "no-store" });
      if (response.status === 401) { router.push("/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordern");
      setWorkOrder(data.workOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordern");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  async function save(formData: FormData) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch(`/api/work-orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera arbetsordern");
      await load();
      setSuccess("Arbetsordern har uppdaterats.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte uppdatera arbetsordern"); }
    finally { setSaving(false); }
  }

  const responseSla = useMemo(() => deadlineState(workOrder?.enterprise?.sla_response_due_at ?? null, workOrder?.enterprise?.responded_at ?? null), [workOrder]);
  const resolutionSla = useMemo(() => deadlineState(workOrder?.enterprise?.sla_resolution_due_at ?? null, workOrder?.enterprise?.closed_at ?? null), [workOrder]);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (!workOrder) return <InlineAlert>{error || "Arbetsordern hittades inte"}</InlineAlert>;

  const estimated = Number(workOrder.estimated_cost || 0);
  const actual = Number(workOrder.actual_cost || 0);
  const enterprise = workOrder.enterprise;

  return <div className="space-y-8">
    <Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till arbetsordrar</Link>
    <PageHeader eyebrow={enterprise?.work_order_number || "Arbetsorder"} title={workOrder.title} description={workOrder.description} />
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={MapPin} label="Fastighet" value={workOrder.property.name} hint={`${workOrder.property.address}, ${workOrder.property.city}`} />
      <MetricCard icon={UserRound} label="Ansvarig" value={workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"} />
      <MetricCard icon={CalendarClock} label="Planerat slut" value={workOrder.scheduled_end ? date.format(new Date(workOrder.scheduled_end)) : "Ej satt"} />
      <MetricCard icon={Banknote} label="Kostnadsutfall" value={money.format(actual)} hint={`Beräknat ${money.format(estimated)}`} />
    </section>

    <Panel title="Work Orders 2.0" description="Operativ identifiering, SLA och oföränderligt revisionsspår för arbetsordern.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Arbetsordernummer</p><p className="mt-2 font-semibold text-ink-950">{enterprise?.work_order_number || "Äldre arbetsorder"}</p></div>
        <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Arbetstyp</p><p className="mt-2 font-semibold text-ink-950">{typeLabels[enterprise?.work_type || ""] || enterprise?.work_type || "Ej angiven"}</p></div>
        <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Ursprung</p><p className="mt-2 font-semibold text-ink-950">{sourceLabels[enterprise?.source || ""] || enterprise?.source || "Ej angivet"}</p></div>
        <div className="rounded-xl border border-sand-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Driftläge</p><p className={`mt-2 font-semibold ${enterprise?.paused_at ? "text-amber-800" : enterprise?.closed_at ? "text-emerald-800" : "text-petroleum-800"}`}>{enterprise?.paused_at ? "Pausad" : enterprise?.closed_at ? "Formellt stängd" : "Aktiv"}</p>{enterprise?.pause_reason ? <p className="mt-1 text-sm text-ink-500">{enterprise.pause_reason}</p> : null}</div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-sand-200 p-5"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-petroleum-700" /><p className="font-semibold text-ink-900">SLA första respons</p></div><p className={`mt-3 text-lg font-semibold ${responseSla.tone}`}>{responseSla.label}</p><p className="mt-1 text-sm text-ink-500">{responseSla.detail}</p></div>
        <div className="rounded-xl border border-sand-200 p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-petroleum-700" /><p className="font-semibold text-ink-900">SLA lösning</p></div><p className={`mt-3 text-lg font-semibold ${resolutionSla.tone}`}>{resolutionSla.label}</p><p className="mt-1 text-sm text-ink-500">{resolutionSla.detail}</p></div>
      </div>
      {enterprise?.paused_at ? <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><PauseCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Arbetsordern är pausad sedan {dateTime.format(new Date(enterprise.paused_at))}</p><p className="mt-1">{enterprise.pause_reason || "Ingen pausorsak angiven."}</p></div></div> : null}
    </Panel>

    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Styrning" description="Uppdatera status, prioritet, tidsplan och ekonomi.">
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <select name="status" defaultValue={workOrder.status} className={premiumFieldClass}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select name="priority" defaultValue={workOrder.priority} className={premiumFieldClass}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="statusReason" placeholder="Orsak vid blockering eller avbrott" className={`${premiumFieldClass} sm:col-span-2`} />
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

    <Panel title="Statushistorik" description="Oföränderligt revisionsspår för alla statusövergångar i arbetsordern.">
      {!workOrder.statusEvents.length ? <div className="rounded-xl border border-dashed border-sand-300 p-8 text-center text-sm text-ink-500">Ingen statushistorik finns för den här äldre arbetsordern ännu.</div> : <div className="space-y-3">{workOrder.statusEvents.map((event, index) => <div key={event.id} className="grid gap-3 rounded-xl border border-sand-200 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><div className={`flex h-9 w-9 items-center justify-center rounded-full ${index === 0 ? "bg-petroleum-100 text-petroleum-800" : "bg-sand-100 text-ink-500"}`}>{event.to_status === "completed" || event.to_status === "invoiced" ? <CheckCircle2 className="h-4 w-4" /> : <History className="h-4 w-4" />}</div><div><p className="font-semibold text-ink-900">{event.from_status ? `${statusLabels[event.from_status] || event.from_status} → ` : "Skapad som "}{statusLabels[event.to_status] || event.to_status}</p><p className="mt-1 text-sm text-ink-500">{event.actor_name || event.actor_email}{event.reason ? ` · ${event.reason}` : ""}</p></div><time className="text-sm text-ink-500">{dateTime.format(new Date(event.created_at))}</time></div>)}</div>}
    </Panel>

    <WorkOrderExecutionPanel workOrderId={workOrder.id} />
    <WorkOrderReportingPanel workOrderId={workOrder.id} />
    <OperationalDocumentsPanel entityType="work_order" entityId={workOrder.id} />
  </div>;
}
