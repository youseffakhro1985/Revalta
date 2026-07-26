"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, Building2, CalendarClock, CheckCircle2, Clock3, FolderKanban, History, LockKeyhole, MapPin, PauseCircle, RefreshCw, ShieldAlert, UserRound, Wrench } from "lucide-react";
import { InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
import { OperationalActivityPanel } from "@/components/dashboard/operational-activity-panel";
import { WorkOrderExecutionPanel } from "@/components/dashboard/work-order-execution-panel";
import { WorkOrderEconomicsPanel } from "@/components/dashboard/work-order-economics-panel";
import { WorkOrderReportingPanel } from "@/components/dashboard/work-order-reporting-panel";
import { useWorkOrderEditLock } from "@/hooks/use-work-order-edit-lock";
import { readResponseJson } from "@/lib/fetch-json";

type EnterpriseState = {
  work_order_number: string | null; work_type: string; source: string;
  sla_response_due_at: string | null; sla_resolution_due_at: string | null;
  responded_at: string | null; paused_at: string | null; pause_reason: string | null; closed_at: string | null;
  building_id: string | null; building_name: string | null;
  technical_asset_id: string | null; technical_asset_name: string | null;
  technical_asset_category: string | null; technical_asset_location: string | null;
} | null;

type StatusEvent = { id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string; actor_name: string | null; actor_email: string };
type WorkOrder = {
  id: string; title: string; description: string; status: string; priority: string; assigned_to_id: string | null; updated_at: string;
  scheduled_start: string | null; scheduled_end: string | null;
  estimated_cost: string | number | null; actual_cost: string | number | null;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string } | null;
  ticket: { id: string; public_reference: string | null; title: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
  created_by: { id: string; name: string | null; email: string };
  projects: { id: string; name: string; status: string }[];
  enterprise: EnterpriseState; statusEvents: StatusEvent[];
};
type Person = { id: string; name: string | null; email: string; role: string };
type TransitionData = { currentStatus: string; allowedStatuses: string[]; assignedToId: string | null; users: Person[]; canManage: boolean };
type BuildingOption = { id: string; name: string; address: string | null };
type AssetOption = { id: string; name: string; category: string; component_class: string | null; location: string | null; status: string; criticality: string; building_id: string | null; building_name: string | null };

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
  const [transitions, setTransitions] = useState<TransitionData | null>(null);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [technicalAssetId, setTechnicalAssetId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const editLock = useWorkOrderEditLock(id, Boolean(transitions?.canManage));

  const load = useCallback(async () => {
    setError("");
    try {
      const [workOrderResponse, optionsResponse, transitionResponse] = await Promise.all([
        fetch(`/api/work-orders/${id}`, { cache: "no-store" }),
        fetch(`/api/work-orders/${id}/asset-options`, { cache: "no-store" }),
        fetch(`/api/work-orders/${id}/transitions`, { cache: "no-store" }),
      ]);
      if ([workOrderResponse, optionsResponse, transitionResponse].some((response) => response.status === 401)) { router.push("/login"); return; }
      const [workOrderData, optionsData, transitionData] = await Promise.all([workOrderResponse.json(), optionsResponse.json(), transitionResponse.json()]);
      if (!workOrderResponse.ok) throw new Error(workOrderData.error || "Kunde inte hämta arbetsordern");
      if (!optionsResponse.ok) throw new Error(optionsData.error || "Kunde inte hämta komponentregistret");
      if (!transitionResponse.ok) throw new Error(transitionData.error || "Kunde inte hämta styrningsalternativ");
      setWorkOrder(workOrderData.workOrder);
      setTransitions(transitionData);
      setBuildings(optionsData.buildings || []);
      setAssets(optionsData.assets || []);
      setBuildingId(workOrderData.workOrder.enterprise?.building_id || "");
      setTechnicalAssetId(workOrderData.workOrder.enterprise?.technical_asset_id || "");
      setSelectedStatus(transitionData.currentStatus);
      setAssignedToId(transitionData.assignedToId || "");
      setStatusReason("");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordern"); }
    finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function save(formData: FormData) {
    if (editLock.state.status !== "owned") {
      setError("Arbetsordern saknar ett aktivt redigeringslås. Försök låsa den igen.");
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = {
        ...Object.fromEntries(formData.entries()),
        status: selectedStatus,
        statusReason,
        assignedToId,
        buildingId,
        technicalAssetId,
        editToken: editLock.state.token,
        version: editLock.state.version,
      };
      const response = await fetch(`/api/work-orders/${id}/locked-update`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await readResponseJson(response);
      if (!response.ok) {
        if (data.code === "version_conflict") {
          await load();
          await editLock.acquire();
          throw new Error("Arbetsordern ändrades av någon annan. Den senaste versionen har laddats och dina osparade ändringar återställdes.");
        }
        throw new Error(data.error || "Kunde inte uppdatera arbetsordern");
      }
      if (data.workOrder?.updated_at) editLock.setVersion(data.workOrder.updated_at);
      await load();
      setSuccess("Arbetsordern har uppdaterats och ändringen är registrerad i historiken.");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte uppdatera arbetsordern"); }
    finally { setSaving(false); }
  }

  const responseSla = useMemo(() => deadlineState(workOrder?.enterprise?.sla_response_due_at ?? null, workOrder?.enterprise?.responded_at ?? null), [workOrder]);
  const resolutionSla = useMemo(() => deadlineState(workOrder?.enterprise?.sla_resolution_due_at ?? null, workOrder?.enterprise?.closed_at ?? null), [workOrder]);
  const filteredAssets = useMemo(() => assets.filter((asset) => !buildingId || !asset.building_id || asset.building_id === buildingId), [assets, buildingId]);
  const selectedAsset = assets.find((asset) => asset.id === technicalAssetId) || null;
  const requiresReason = selectedStatus === "blocked" || selectedStatus === "cancelled";
  const editable = Boolean(transitions?.canManage) && editLock.state.status === "owned";

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (!workOrder || !transitions) return <InlineAlert>{error || "Arbetsordern hittades inte"}</InlineAlert>;

  const estimated = Number(workOrder.estimated_cost || 0);
  const actual = Number(workOrder.actual_cost || 0);
  const enterprise = workOrder.enterprise;

  async function createProjectFromWorkOrder() {
    if (!window.confirm("Skapa ett projekt från den här arbetsordern?")) return;
    setCreatingProject(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/work-orders/${id}/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa projekt");
      setSuccess("Projektet har skapats från arbetsordern.");
      await load();
      if (data.project?.id) router.push(`/dashboard/projekt/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa projekt");
    } finally {
      setCreatingProject(false);
    }
  }

  async function softDeleteWorkOrder() {
    if (!window.confirm("Ta bort arbetsordern? Den döljs från listor men behålls i historiken.")) return;
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/work-orders/${id}`, { method: "DELETE" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort arbetsordern");
      router.push("/dashboard/arbetsorder");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort arbetsordern");
      setDeleting(false);
    }
  }

  return <div className="space-y-8">
    <Link href="/dashboard/arbetsorder" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-petroleum-800"><ArrowLeft className="h-4 w-4" />Till arbetsordrar</Link>
    <PageHeader eyebrow={enterprise?.work_order_number || "Arbetsorder"} title={workOrder.title} description={workOrder.description} />
    {(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}

    {transitions.canManage ? <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${editable ? "border-emerald-200 bg-emerald-50" : editLock.state.status === "locked" ? "border-amber-200 bg-amber-50" : "border-sand-200 bg-white"}`}>
      <div className="flex items-start gap-3"><LockKeyhole className={`mt-0.5 h-5 w-5 ${editable ? "text-emerald-700" : "text-amber-700"}`} /><div><p className="font-semibold text-ink-900">{editable ? "Säker redigering aktiv" : editLock.state.status === "locked" ? "Arbetsordern redigeras av en annan användare" : editLock.state.status === "acquiring" ? "Låser arbetsordern för redigering…" : "Redigeringslåset är inte aktivt"}</p><p className="mt-1 text-sm text-ink-600">{editable ? `Låset förnyas automatiskt till ${dateTime.format(new Date(editLock.state.expiresAt))}.` : editLock.state.status === "locked" ? `${editLock.state.holder.name || editLock.state.holder.email} har låset till ${dateTime.format(new Date(editLock.state.expiresAt))}.` : editLock.state.status === "lost" || editLock.state.status === "error" ? editLock.state.message : "Vänta medan ett exklusivt redigeringslås skapas."}</p></div></div>
      {!editable && editLock.state.status !== "acquiring" ? <button type="button" onClick={() => void editLock.acquire()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sand-300 bg-white px-4 py-2 text-sm font-semibold text-petroleum-800"><RefreshCw className="h-4 w-4" />Försök igen</button> : null}
    </div> : null}

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

    <Panel title="Teknisk koppling" description="Knyt arbetsordern till rätt byggnad och exakt installation för spårbar drift, kostnad och livscykel.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Byggnad</span><select disabled={!editable} value={buildingId} onChange={(event) => { const next = event.target.value; setBuildingId(next); if (technicalAssetId && !assets.some((asset) => asset.id === technicalAssetId && (!next || !asset.building_id || asset.building_id === next))) setTechnicalAssetId(""); }} className={premiumFieldClass}><option value="">Ingen särskild byggnad</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}{building.address ? ` · ${building.address}` : ""}</option>)}</select></label>
        <label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Teknisk komponent</span><select disabled={!editable} value={technicalAssetId} onChange={(event) => setTechnicalAssetId(event.target.value)} className={premiumFieldClass}><option value="">Ingen särskild komponent</option>{filteredAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.building_name ? ` · ${asset.building_name}` : ""}{asset.location ? ` · ${asset.location}` : ""}</option>)}</select></label>
        <Link href={`/dashboard/fastigheter/${workOrder.property.id}/komponenter`} className="inline-flex h-11 items-center justify-center rounded-xl border border-sand-200 px-4 text-sm font-semibold text-petroleum-800 hover:bg-sand-50">Öppna register</Link>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-sand-200 p-4"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-petroleum-700" /><p className="font-semibold text-ink-900">Vald byggnad</p></div><p className="mt-2 text-sm text-ink-600">{buildings.find((building) => building.id === buildingId)?.name || enterprise?.building_name || "Ingen särskild byggnad kopplad"}</p></div>
        <div className="rounded-xl border border-sand-200 p-4"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-petroleum-700" /><p className="font-semibold text-ink-900">Vald komponent</p></div>{selectedAsset ? <div className="mt-2"><Link href={`/dashboard/fastigheter/${workOrder.property.id}/komponenter/${selectedAsset.id}`} className="font-semibold text-petroleum-800 hover:text-petroleum-950">{selectedAsset.name}</Link><p className="mt-1 text-sm text-ink-500">{selectedAsset.component_class || selectedAsset.category}{selectedAsset.location ? ` · ${selectedAsset.location}` : ""} · {selectedAsset.status}</p></div> : <p className="mt-2 text-sm text-ink-600">Ingen särskild komponent kopplad</p>}</div>
      </div>
    </Panel>

    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel title="Styrning" description="Endast giltiga statusövergångar visas. Alla ändringar kräver ett aktivt redigeringslås och registreras i revisionshistoriken.">
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Nästa status</span><select disabled={!editable} value={selectedStatus} onChange={(event) => { setSelectedStatus(event.target.value); if (!["blocked", "cancelled"].includes(event.target.value)) setStatusReason(""); }} className={premiumFieldClass}>{transitions.allowedStatuses.map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></label>
          <label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Prioritet</span><select name="priority" disabled={!editable} defaultValue={workOrder.priority} className={premiumFieldClass}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-2 sm:col-span-2"><span className="text-sm font-semibold text-ink-700">Ansvarig</span><select disabled={!editable} value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className={premiumFieldClass}><option value="">Ej tilldelad</option>{transitions.users.map((person) => <option key={person.id} value={person.id}>{person.name || person.email} · {person.role}</option>)}</select></label>
          <label className="space-y-2 sm:col-span-2"><span className="text-sm font-semibold text-ink-700">Orsak till statusändring{requiresReason ? " *" : ""}</span><textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} required={requiresReason} maxLength={1000} disabled={!editable} placeholder={requiresReason ? "Beskriv varför arbetsordern blockeras eller avbryts" : "Valfri intern förklaring till statusändringen"} className={`${premiumFieldClass} min-h-24`} /></label>
          <input name="scheduledStart" type="date" disabled={!editable} defaultValue={workOrder.scheduled_start?.slice(0, 10) || ""} className={premiumFieldClass} />
          <input name="scheduledEnd" type="date" disabled={!editable} defaultValue={workOrder.scheduled_end?.slice(0, 10) || ""} className={premiumFieldClass} />
          <input name="estimatedCost" type="number" min="0" step="0.01" disabled={!editable} defaultValue={estimated || ""} placeholder="Beräknad kostnad" className={premiumFieldClass} />
          <input name="actualCost" type="number" min="0" step="0.01" disabled={!editable} defaultValue={actual || ""} placeholder="Faktisk kostnad" className={premiumFieldClass} />
          {transitions.canManage ? <button disabled={!editable || saving || (requiresReason && !statusReason.trim())} className={`${premiumPrimaryButtonClass} sm:col-span-2`}>{saving ? "Sparar…" : editable ? "Spara låst och validerad ändring" : "Väntar på redigeringslås"}</button> : <p className="sm:col-span-2 text-sm text-ink-500">Du har läsbehörighet men kan inte ändra arbetsordern.</p>}
        </form>
        <div className="mt-5 space-y-3 border-t border-sand-100 pt-5 text-sm text-ink-500">
          {workOrder.unit ? <p>Enhet: <strong className="text-ink-800">{workOrder.unit.designation}</strong></p> : null}
          {workOrder.ticket ? <p>Ursprungsärende: <strong className="text-ink-800">{workOrder.ticket.public_reference || workOrder.ticket.title}</strong></p> : null}
          {workOrder.projects.map((project) => <Link key={project.id} href={`/dashboard/projekt/${project.id}`} className="flex items-center gap-2 font-semibold text-petroleum-700 hover:text-petroleum-900"><FolderKanban className="h-4 w-4" />{project.name}</Link>)}
          {transitions.canManage && workOrder.projects.length === 0 ? (
            <button
              type="button"
              disabled={creatingProject}
              onClick={() => void createProjectFromWorkOrder()}
              className="inline-flex items-center gap-2 rounded-xl border border-petroleum-200 bg-petroleum-50 px-3 py-2 text-xs font-semibold text-petroleum-900 hover:bg-petroleum-100"
            >
              <FolderKanban className="h-3.5 w-3.5" />
              {creatingProject ? "Skapar projekt…" : "Skapa projekt från arbetsorder"}
            </button>
          ) : null}
          {transitions.canManage ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void softDeleteWorkOrder()}
              className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60"
            >
              {deleting ? "Tar bort…" : "Ta bort arbetsorder"}
            </button>
          ) : null}
        </div>
      </Panel>
      <OperationalActivityPanel entityType="work_order" entityId={workOrder.id} />
    </section>

    <Panel title="Statushistorik" description="Oföränderligt revisionsspår för alla statusövergångar i arbetsordern.">
      {!workOrder.statusEvents.length ? <div className="rounded-xl border border-dashed border-sand-300 p-8 text-center text-sm text-ink-500">Ingen statushistorik finns för den här äldre arbetsordern ännu.</div> : <div className="space-y-3">{workOrder.statusEvents.map((event, index) => <div key={event.id} className="grid gap-3 rounded-xl border border-sand-200 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><div className={`flex h-9 w-9 items-center justify-center rounded-full ${index === 0 ? "bg-petroleum-100 text-petroleum-800" : "bg-sand-100 text-ink-500"}`}>{event.to_status === "completed" || event.to_status === "invoiced" ? <CheckCircle2 className="h-4 w-4" /> : <History className="h-4 w-4" />}</div><div><p className="font-semibold text-ink-900">{event.from_status ? `${statusLabels[event.from_status] || event.from_status} → ` : "Skapad som "}{statusLabels[event.to_status] || event.to_status}</p><p className="mt-1 text-sm text-ink-500">{event.actor_name || event.actor_email}{event.reason ? ` · ${event.reason}` : ""}</p></div><time className="text-sm text-ink-500">{dateTime.format(new Date(event.created_at))}</time></div>)}</div>}
    </Panel>

    <WorkOrderExecutionPanel workOrderId={workOrder.id} />
    <section id="ekonomi" aria-label="Ekonomi och fakturering" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink-950">Ekonomi och fakturering</h2>
        <p className="mt-1 text-sm text-ink-500">Kanonisk väg för attesterad tid, material, lönsamhet och exportbart fakturaunderlag (Fortnox/Visma). Fältregistreringen ovan är driftunderlag, inte fakturarader.</p>
      </div>
      <WorkOrderEconomicsPanel workOrderId={workOrder.id} />
    </section>
    <WorkOrderReportingPanel workOrderId={workOrder.id} />
    <OperationalDocumentsPanel entityType="work_order" entityId={workOrder.id} />
  </div>;
}
