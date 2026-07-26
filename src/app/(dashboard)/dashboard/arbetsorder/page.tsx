"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, ClipboardList, Clock3, FolderKanban, Gauge, Search, UserRound } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type SlaRisk = "overdue" | "critical" | "soon" | "normal" | "fulfilled" | "paused" | "not_configured";
type SlaPhase = "response" | "resolution" | "fulfilled" | "paused" | "not_configured";

type SlaEvaluation = {
  phase: SlaPhase;
  risk: SlaRisk;
  label: string;
  dueAt: string | null;
  remainingMinutes: number | null;
  overdueMinutes: number | null;
  pauseReason: string | null;
  response: { dueAt: string | null; achievedAt: string | null; breached: boolean; varianceMinutes: number | null };
  resolution: { dueAt: string | null; achievedAt: string | null; breached: boolean; varianceMinutes: number | null };
};

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

type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  estimated_cost: string | number | null;
  enterprise: EnterpriseState;
  sla: SlaEvaluation;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string } | null;
  ticket: { id: string; public_reference: string | null; title: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
  projects: { id: string; name: string; status: string }[];
};

type SlaSummary = Record<SlaRisk, number> & {
  total: number;
  awaitingResponse: number;
  awaitingResolution: number;
};

type BoardColumn = { key: string; label: string; statuses: readonly string[]; description: string };

const columns: readonly BoardColumn[] = [
  { key: "incoming", label: "Nya", statuses: ["new"], description: "Behöver bedömas och planeras" },
  { key: "planned", label: "Planerade", statuses: ["planned"], description: "Schemalagda eller tilldelade" },
  { key: "active", label: "Pågående", statuses: ["in_progress"], description: "Aktivt arbete utförs" },
  { key: "attention", label: "Kräver åtgärd", statuses: ["waiting_material", "blocked"], description: "Väntar eller är blockerade" },
  { key: "completed", label: "Slutförda", statuses: ["completed", "invoiced"], description: "Kontroll, faktura eller avslut" },
] as const;

const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const typeLabels: Record<string, string> = { corrective: "Avhjälpande", preventive: "Förebyggande", inspection: "Besiktning", emergency: "Akut", project: "Projekt", warranty: "Garanti" };
const sourceLabels: Record<string, string> = { internal: "Internt", ticket: "Ärende", maintenance_plan: "Underhållsplan", inspection: "Besiktning", component: "Komponent", resident: "Boende", supplier: "Leverantör" };
const statusLabels: Record<string, string> = { new: "Ny", planned: "Planerad", in_progress: "Pågående", waiting_material: "Väntar material", blocked: "Blockerad", completed: "Slutförd", invoiced: "Fakturerad", cancelled: "Avbruten" };
const phaseLabels: Record<SlaPhase, string> = { response: "Svarstid", resolution: "Lösningstid", fulfilled: "Hanterad", paused: "Pausad", not_configured: "Saknas" };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

function formatMoney(value: string | number | null) {
  if (value === null || value === undefined) return null;
  return money.format(Number(value));
}

function formatDuration(minutes: number | null) {
  if (minutes === null) return "Ingen aktiv nedräkning";
  const absolute = Math.abs(minutes);
  const days = Math.floor(absolute / 1440);
  const hours = Math.floor((absolute % 1440) / 60);
  const mins = absolute % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

function riskPresentation(risk: SlaRisk) {
  if (risk === "overdue") return { className: "bg-red-50 text-red-700 ring-red-100", timeClass: "text-red-700" };
  if (risk === "critical") return { className: "bg-orange-50 text-orange-700 ring-orange-100", timeClass: "text-orange-700" };
  if (risk === "soon") return { className: "bg-amber-50 text-amber-700 ring-amber-100", timeClass: "text-amber-700" };
  if (risk === "paused") return { className: "bg-sky-50 text-sky-700 ring-sky-100", timeClass: "text-sky-700" };
  if (risk === "fulfilled") return { className: "bg-emerald-50 text-emerald-700 ring-emerald-100", timeClass: "text-emerald-700" };
  if (risk === "not_configured") return { className: "bg-sand-100 text-ink-500 ring-sand-200", timeClass: "text-ink-500" };
  return { className: "bg-petroleum-50 text-petroleum-700 ring-petroleum-100", timeClass: "text-petroleum-700" };
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [slaSummary, setSlaSummary] = useState<SlaSummary | null>(null);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/work-orders", { cache: "no-store" });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await readResponseJson<{
          error?: string;
          workOrders?: WorkOrder[];
          slaSummary?: SlaSummary | null;
          evaluatedAt?: string | null;
        }>(response);
        if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsordrar");
        if (!mounted) return;
        setWorkOrders(data.workOrders || []);
        setSlaSummary(data.slaSummary || null);
        setEvaluatedAt(data.evaluatedAt || null);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Kunde inte hämta arbetsordrar");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  const visibleWorkOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workOrders.filter((workOrder) => {
      if (workOrder.status === "cancelled") return false;
      if (typeFilter !== "all" && workOrder.enterprise?.work_type !== typeFilter) return false;
      if (riskFilter !== "all" && workOrder.sla.risk !== riskFilter) return false;
      if (assignmentFilter === "assigned" && !workOrder.assigned_to) return false;
      if (assignmentFilter === "unassigned" && workOrder.assigned_to) return false;
      if (!query) return true;
      return [workOrder.enterprise?.work_order_number, workOrder.title, workOrder.property.name, workOrder.property.address, workOrder.property.city, workOrder.unit?.designation, workOrder.ticket?.public_reference, workOrder.assigned_to?.name, workOrder.assigned_to?.email, workOrder.projects[0]?.name, typeLabels[workOrder.enterprise?.work_type || ""], sourceLabels[workOrder.enterprise?.source || ""]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [assignmentFilter, riskFilter, search, typeFilter, workOrders]);

  const activeWorkOrders = workOrders.filter((workOrder) => !["completed", "invoiced", "cancelled"].includes(workOrder.status));
  const unassigned = activeWorkOrders.filter((workOrder) => !workOrder.assigned_to).length;
  const completed = workOrders.filter((workOrder) => ["completed", "invoiced"].includes(workOrder.status)).length;
  const hasFilters = Boolean(search.trim()) || typeFilter !== "all" || riskFilter !== "all" || assignmentFilter !== "all";

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setRiskFilter("all");
    setAssignmentFilter("all");
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Operativ förvaltning" title="Arbetsordrar" description="Prioritera efter serverberäknad svarstid, lösningstid, ansvar och verklig SLA-risk." action={<Link href="/dashboard/felanmalan" className="inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800 focus:outline-none focus:ring-2 focus:ring-petroleum-200">Skapa från ärende</Link>} />
    {error ? <InlineAlert>{error}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={AlertTriangle} label="SLA passerad" value={slaSummary?.overdue ?? 0} hint="Aktiva arbetsordrar utanför avtalad tid" />
      <MetricCard icon={Gauge} label="SLA kräver fokus" value={(slaSummary?.critical ?? 0) + (slaSummary?.soon ?? 0)} hint="Kritiska eller inom 24 timmar" />
      <MetricCard icon={UserRound} label="Ej tilldelade" value={unassigned} hint="Saknar ansvarig utförare" />
      <MetricCard icon={BadgeCheck} label="Slutförda" value={completed} hint="Klara eller fakturerade arbetsordrar" />
    </section>

    <Panel title="SLA-läge" description="Servern avgör aktiv fas och tidsavvikelse. Resultatet är gemensamt för alla användare." bodyClassName="p-5 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SlaMini label="Väntar på svar" value={slaSummary?.awaitingResponse ?? 0} />
        <SlaMini label="Väntar på lösning" value={slaSummary?.awaitingResolution ?? 0} />
        <SlaMini label="Pausade" value={slaSummary?.paused ?? 0} />
        <SlaMini label="SLA saknas" value={slaSummary?.not_configured ?? 0} />
        <SlaMini label="Totalt" value={slaSummary?.total ?? workOrders.length} />
      </div>
      {evaluatedAt ? <p className="mt-4 text-xs text-ink-400">SLA beräknad {dateTime.format(new Date(evaluatedAt))}</p> : null}
    </Panel>

    <Panel title="Planeringstavla" description="Sök och filtrera arbetsorderportföljen efter serverns aktuella SLA-bedömning." bodyClassName="p-4 sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px_190px_190px_auto]">
        <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök nummer, arbetsorder, fastighet eller ansvarig" className={`${premiumFieldClass} pl-10`} aria-label="Sök arbetsordrar" /></label>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera arbetstyp"><option value="all">Alla arbetstyper</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera SLA-risk"><option value="all">Alla SLA-lägen</option><option value="overdue">SLA passerad</option><option value="critical">SLA kritisk</option><option value="soon">SLA snart</option><option value="normal">Inom SLA</option><option value="paused">Pausad</option><option value="fulfilled">SLA hanterad</option><option value="not_configured">SLA saknas</option></select>
        <select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} className={premiumFieldClass} aria-label="Filtrera tilldelning"><option value="all">Alla ansvarslägen</option><option value="assigned">Tilldelade</option><option value="unassigned">Ej tilldelade</option></select>
        <button type="button" onClick={clearFilters} disabled={!hasFilters} className="h-11 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-600 transition hover:border-petroleum-200 hover:text-petroleum-800 disabled:cursor-not-allowed disabled:opacity-40">Rensa</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-4"><p className="text-xs font-medium text-ink-400">{visibleWorkOrders.length} arbetsordrar visas</p><p className="text-xs text-ink-400">Status ändras i arbetsorderdetaljen för att bevara orsak och revisionsspår.</p></div>

      {loading ? <div className="mt-5 grid gap-4 xl:grid-cols-5">{columns.map((column) => <div key={column.key} className="h-96 animate-pulse rounded-2xl bg-sand-100" />)}</div> : visibleWorkOrders.length === 0 ? <div className="mt-5"><EmptyState title="Inga arbetsordrar matchar filtreringen" description="Rensa filtren eller skapa en arbetsorder från ett ärende." /></div> : <div className="mt-5 grid gap-4 xl:grid-cols-5">
        {columns.map((column) => {
          const items = visibleWorkOrders.filter((workOrder) => column.statuses.includes(workOrder.status));
          return <section key={column.key} className="min-h-[440px] rounded-2xl border border-sand-200 bg-[#F1F1EC] p-3">
            <div className="flex items-start justify-between gap-3 px-2 py-2"><div><h2 className="text-sm font-semibold text-ink-900">{column.label}</h2><p className="mt-0.5 text-xs leading-4 text-ink-400">{column.description}</p></div><span className="rounded-full border border-sand-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-500">{items.length}</span></div>
            <div className="mt-2 space-y-3">{items.map((workOrder) => <WorkOrderCard key={workOrder.id} workOrder={workOrder} />)}{items.length === 0 ? <div className="rounded-xl border border-dashed border-sand-300 bg-white/60 p-6 text-center"><ClipboardList className="mx-auto h-5 w-5 text-ink-300" /><p className="mt-2 text-xs text-ink-400">Inga arbetsordrar</p></div> : null}</div>
          </section>;
        })}
      </div>}
    </Panel>
  </div>;
}

function SlaMini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4"><p className="text-xs font-medium text-ink-400">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-ink-950">{value}</p></div>;
}

function WorkOrderCard({ workOrder }: { workOrder: WorkOrder }) {
  const enterprise = workOrder.enterprise;
  const sla = workOrder.sla;
  const riskUi = riskPresentation(sla.risk);
  const timeText = sla.overdueMinutes !== null ? `${formatDuration(sla.overdueMinutes)} försenad` : sla.remainingMinutes !== null ? `${formatDuration(sla.remainingMinutes)} kvar` : sla.pauseReason || "Ingen aktiv nedräkning";
  return <article className="rounded-xl border border-sand-200 bg-white p-4 shadow-[0_1px_2px_rgba(17,34,31,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(17,34,31,0.06)]">
    <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] font-semibold tracking-wide text-petroleum-700">{enterprise?.work_order_number || `AO-${workOrder.id.slice(0, 8)}`}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${riskUi.className}`}>{sla.label}</span></div>
    <Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="mt-3 block font-semibold leading-5 text-ink-900 transition hover:text-petroleum-800">{workOrder.title}</Link>
    <div className="mt-2 flex flex-wrap gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${workOrder.priority === "urgent" ? "bg-red-50 text-red-700" : workOrder.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-sand-50 text-ink-500"}`}>{priorityLabels[workOrder.priority] || workOrder.priority}</span><span className="rounded-full bg-sand-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500">{typeLabels[enterprise?.work_type || ""] || "Avhjälpande"}</span><span className="rounded-full bg-sand-50 px-2 py-0.5 text-[10px] font-semibold text-ink-500">{sourceLabels[enterprise?.source || ""] || "Internt"}</span></div>
    <p className="mt-3 text-xs leading-5 text-ink-500">{workOrder.property.name}{workOrder.unit ? ` · ${workOrder.unit.designation}` : ""}</p><p className="text-xs leading-5 text-ink-400">{workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"}</p>
    {workOrder.projects[0] ? <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-petroleum-50 px-2.5 py-2 text-[11px] font-medium text-petroleum-700"><FolderKanban className="h-3.5 w-3.5" />{workOrder.projects[0].name}</div> : null}
    <div className="mt-4 rounded-xl border border-sand-100 bg-sand-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">{phaseLabels[sla.phase]}</span><Clock3 className="h-3.5 w-3.5 text-ink-300" /></div><p className={`mt-1 text-sm font-semibold ${riskUi.timeClass}`}>{timeText}</p>{sla.dueAt ? <p className="mt-1 text-[11px] text-ink-400">Deadline {dateTime.format(new Date(sla.dueAt))}</p> : null}</div>
    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-400"><span>{statusLabels[workOrder.status] || workOrder.status}</span>{formatMoney(workOrder.estimated_cost) ? <span className="font-semibold text-ink-600">{formatMoney(workOrder.estimated_cost)}</span> : null}</div>
    <Link href={`/dashboard/arbetsorder/${workOrder.id}`} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-sand-200 bg-sand-50 text-xs font-semibold text-petroleum-800 transition hover:border-petroleum-200 hover:bg-petroleum-50">Öppna arbetsorder</Link>
  </article>;
}
