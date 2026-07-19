"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, ExternalLink, RefreshCw, Wrench } from "lucide-react";
import { InlineAlert, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
import type { LeaseHandoverPayload } from "@/lib/lease-handover";

type Assignee = { id: string; name: string | null; email: string; role: string };
type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  created_at: string;
  assigned_to: { id: string; name: string | null; email: string } | null;
};

type Props = {
  leaseId: string;
  handover: LeaseHandoverPayload;
};

const statusLabels: Record<string, string> = {
  new: "Ny",
  planned: "Planerad",
  in_progress: "Pågår",
  waiting_material: "Väntar material",
  blocked: "Blockerad",
  completed: "Slutförd",
  invoiced: "Fakturerad",
  cancelled: "Makulerad",
};
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function HandoverWorkOrderPanel({ leaseId, handover }: Props) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ priority: handover.inspection.condition === "action_required" ? "high" : "normal", assignedToId: "", scheduledStart: "", scheduledEnd: "", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/leases/${leaseId}/handover/work-orders`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta arbetsorder");
      setWorkOrders(data.workOrders || []);
      setAssignees(data.assignees || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte hämta arbetsorder");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [leaseId]);

  const actionable = ["remarks", "action_required"].includes(handover.inspection.condition) && Boolean(handover.inspection.note.trim());

  async function createWorkOrder(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/leases/${leaseId}/handover/work-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, handoverVersion: handover.version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsordern");
      setSuccess(`Arbetsordern ${data.workOrder.workOrderNumber} har skapats och kopplats till besiktningen.`);
      setForm((current) => ({ ...current, note: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte skapa arbetsordern");
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-petroleum-700" /><h3 className="font-semibold text-ink-900">Åtgärder från besiktning</h3></div>
        <p className="mt-1 text-sm text-ink-500">Skapa och följ arbetsorder direkt från registrerade besiktningsanmärkningar.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center rounded-xl border border-sand-200 px-3 text-sm font-semibold text-ink-700"><RefreshCw className="mr-2 h-4 w-4" />Uppdatera</button>
    </div>

    <div className="mt-5 space-y-4">
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {!actionable ? <InlineAlert tone="info">Markera besiktningen med anmärkningar eller åtgärdsbehov och skriv en besiktningsanteckning för att skapa arbetsorder.</InlineAlert> : null}

      {canManage && actionable ? <form onSubmit={createWorkOrder} className="rounded-xl border border-sand-200 bg-sand-50/60 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Prioritet</span><select className={premiumFieldClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Ansvarig</span><select className={premiumFieldClass} value={form.assignedToId} onChange={(event) => setForm({ ...form, assignedToId: event.target.value })}><option value="">Ej tilldelad</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name || assignee.email}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Planerad start</span><input type="datetime-local" className={premiumFieldClass} value={form.scheduledStart} onChange={(event) => setForm({ ...form, scheduledStart: event.target.value })} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Planerat slut</span><input type="datetime-local" className={premiumFieldClass} value={form.scheduledEnd} onChange={(event) => setForm({ ...form, scheduledEnd: event.target.value })} /></label>
        </div>
        <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Kompletterande instruktion</span><textarea className={premiumTextareaClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Exempel: fotografera före och efter åtgärd, kontakta hyrespart före besök." /></label>
        <div className="mt-4 flex justify-end"><button disabled={saving} className={premiumPrimaryButtonClass}><ClipboardCheck className="mr-2 h-4 w-4" />{saving ? "Skapar arbetsorder…" : "Skapa arbetsorder"}</button></div>
      </form> : null}

      {loading ? <div className="h-24 animate-pulse rounded-xl bg-sand-100" /> : workOrders.length === 0 ? <p className="rounded-xl border border-dashed border-sand-200 p-5 text-sm text-ink-500">Ingen arbetsorder är kopplad till överlämningen ännu.</p> : <div className="divide-y divide-sand-100 rounded-xl border border-sand-200">{workOrders.map((workOrder) => <article key={workOrder.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="font-semibold text-ink-900">{workOrder.title}</p><p className="mt-1 text-sm text-ink-500">{priorityLabels[workOrder.priority] || workOrder.priority} prioritet · {workOrder.assigned_to?.name || workOrder.assigned_to?.email || "Ej tilldelad"}</p><p className="mt-1 text-xs text-ink-400">Skapad {date.format(new Date(workOrder.created_at))}{workOrder.scheduled_start ? ` · planerad ${date.format(new Date(workOrder.scheduled_start))}` : ""}</p></div>
        <div className="flex items-center gap-3"><span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{statusLabels[workOrder.status] || workOrder.status}</span><a href={`/dashboard/arbetsorder/${workOrder.id}`} className="inline-flex h-9 items-center rounded-lg border border-sand-200 px-3 text-sm font-semibold text-petroleum-800">Öppna<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></div>
      </article>)}</div>}
    </div>
  </section>;
}
