"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, ClipboardPlus, Pencil, Plus, WalletCards } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type Item = {
  id: string;
  property_id: string;
  property_name: string;
  component: string;
  measure: string;
  planned_year: number;
  estimated_cost: number;
  priority: string;
  interval_years: number;
  status: string;
  work_order_id?: string | null;
  work_order_number?: string | null;
  source?: "table" | "legacy";
};
type Permissions = { canManage: boolean; canManageFinance: boolean; canViewFinance: boolean };

const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const priorityLabel: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", critical: "Kritisk" };
const statusLabel: Record<string, string> = { planned: "Planerad", approved: "Godkänd", in_progress: "Pågår", completed: "Slutförd", cancelled: "Avbruten" };

function priorityClass(priority: string) {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
  if (priority === "low") return "border-sand-200 bg-sand-50 text-ink-500";
  return "border-petroleum-100 bg-petroleum-50 text-petroleum-800";
}

function statusClass(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "in_progress" || status === "approved") return "border-petroleum-100 bg-petroleum-50 text-petroleum-800";
  if (status === "cancelled") return "border-sand-200 bg-sand-100 text-ink-500";
  return "border-sand-200 bg-sand-50 text-ink-600";
}

export default function MaintenancePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canManage: false, canManageFinance: false, canViewFinance: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ component: "", measure: "", plannedYear: "", estimatedCost: "", priority: "normal", intervalYears: "0" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ propertyId: "", component: "", measure: "", plannedYear: String(new Date().getFullYear() + 1), estimatedCost: "", priority: "normal", intervalYears: "0" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/maintenance", { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta underhållsplanen");
      setItems(body.items || []);
      setProperties(body.properties || []);
      setPermissions(body.permissions || { canManage: false, canManageFinance: false, canViewFinance: false });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta underhållsplanen");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const year = new Date().getFullYear();
  const debt = useMemo(() => items.filter((item) => item.planned_year < year && !["completed", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0), [items, year]);
  const tenYear = useMemo(() => items.filter((item) => item.planned_year >= year && item.planned_year <= year + 10 && item.status !== "cancelled").reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0), [items, year]);
  const critical = items.filter((item) => ["critical", "high"].includes(item.priority) && !["completed", "cancelled"].includes(item.status)).length;
  const completed = items.filter((item) => item.status === "completed").length;
  const grouped = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const item of items) map.set(item.planned_year, [...(map.get(item.planned_year) || []), item]);
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plannedYear: Number(form.plannedYear), estimatedCost: Number(form.estimatedCost), intervalYears: Number(form.intervalYears) }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte lägga till åtgärden");
      setForm({ ...form, component: "", measure: "", estimatedCost: "" });
      setMessage("Åtgärden har lagts till i underhållsplanen.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte lägga till åtgärden");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditForm({
      component: item.component || "",
      measure: item.measure || "",
      plannedYear: String(item.planned_year || new Date().getFullYear()),
      estimatedCost: String(item.estimated_cost ?? ""),
      priority: item.priority || "normal",
      intervalYears: String(item.interval_years ?? 0),
    });
  }

  async function updateStatus(item: Item, status: string, workOrderId?: string) {
    if (item.source === "legacy") {
      setError("Underhållsåtgärden finns i äldre lagring. Kör backfill till PortfolioMaintenanceItem innan status ändras.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/maintenance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, status, workOrderId }) });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte uppdatera åtgärden");
      setMessage("Underhållsåtgärden har uppdaterats.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera åtgärden");
    } finally {
      setBusyId("");
    }
  }

  async function saveEdit(item: Item) {
    if (item.source === "legacy") {
      setError("Underhållsåtgärden finns i äldre lagring. Kör backfill till PortfolioMaintenanceItem innan den kan uppdateras.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          component: editForm.component,
          measure: editForm.measure,
          plannedYear: Number(editForm.plannedYear),
          estimatedCost: Number(editForm.estimatedCost),
          priority: editForm.priority,
          intervalYears: Number(editForm.intervalYears),
        }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte uppdatera åtgärden");
      setMessage("Underhållsåtgärden har uppdaterats.");
      setEditingId("");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera åtgärden");
    } finally {
      setBusyId("");
    }
  }

  async function createWorkOrder(item: Item) {
    if (item.source === "legacy") {
      setError("Underhållsåtgärden finns i äldre lagring. Kör backfill till PortfolioMaintenanceItem innan arbetsorder skapas.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const scheduledStart = new Date(item.planned_year, 0, 15, 8, 0).toISOString();
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: item.property_id, title: `${item.component} – förebyggande underhåll`, description: item.measure, status: "planned", priority: item.priority, workType: "preventive", source: "internal", scheduledStart, estimatedCost: item.estimated_cost }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte skapa arbetsordern");
      await updateStatus(item, "approved", body.workOrder.id);
      setMessage("Arbetsorder skapad och kopplad till underhållsåtgärden.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte skapa arbetsordern");
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8 animate-fade-in-soft">
      <PageHeader
        eyebrow="Drift · Teknisk förvaltning"
        title="Underhållsplan"
        description="Planera, prioritera och genomför förebyggande underhåll med flerårig kostnadsbild och direkt koppling till arbetsorder."
        action={permissions.canManage ? (
          <a href="#ny-underhallsatgard" className={premiumPrimaryButtonClass}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Ny åtgärd
          </a>
        ) : undefined}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={WalletCards} label="10-årsplan" value={permissions.canViewFinance ? currency.format(tenYear) : "Begränsad"} hint="Planerat underhåll innevarande år till +10 år" />
        <MetricCard icon={CalendarRange} label="Underhållsskuld" value={permissions.canViewFinance ? currency.format(debt) : "Begränsad"} hint="Ej slutförda åtgärder vars planerade år passerat" />
        <MetricCard icon={AlertTriangle} label="Hög prioritet" value={critical} hint="Kritiska och högt prioriterade öppna åtgärder" />
        <MetricCard icon={CheckCircle2} label="Slutförda" value={completed} hint={`${items.length} åtgärder totalt i planen`} />
      </section>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {!permissions.canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet till underhållsplanen. Förvaltare eller administratör kan planera och ändra åtgärder.</InlineAlert> : null}

      <section className={`grid items-start gap-6 ${permissions.canManage ? "xl:grid-cols-[390px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {permissions.canManage ? (
          <Panel title="Ny planerad åtgärd" description="Koppla åtgärden till rätt fastighet, år, kostnad och prioritet." className="xl:sticky xl:top-[118px]">
            <form id="ny-underhallsatgard" onSubmit={submit} className="space-y-4">
              <Field label="Fastighet"><select required className={premiumFieldClass} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></Field>
              <Field label="Byggnadsdel"><input required className={premiumFieldClass} value={form.component} onChange={(event) => setForm({ ...form, component: event.target.value })} placeholder="Ex. Tak, fasad eller ventilation" /></Field>
              <Field label="Åtgärd"><textarea required className={premiumTextareaClass} value={form.measure} onChange={(event) => setForm({ ...form, measure: event.target.value })} placeholder="Beskriv planerad åtgärd" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Planerat år"><input required type="number" className={premiumFieldClass} value={form.plannedYear} onChange={(event) => setForm({ ...form, plannedYear: event.target.value })} /></Field>
                <Field label="Intervall, år"><input type="number" min="0" className={premiumFieldClass} value={form.intervalYears} onChange={(event) => setForm({ ...form, intervalYears: event.target.value })} /></Field>
              </div>
              <Field label="Beräknad kostnad exkl. moms"><input required type="number" min="0" className={premiumFieldClass} value={form.estimatedCost} onChange={(event) => setForm({ ...form, estimatedCost: event.target.value })} placeholder="0" /></Field>
              <Field label="Prioritet"><select className={premiumFieldClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="critical">Kritisk</option></select></Field>
              <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Lägg till i planen"}</button>
            </form>
          </Panel>
        ) : null}

        <Panel title="Flerårsplan" description={`${items.length} åtgärder grupperade efter planerat år.`} bodyClassName="p-0">
          {loading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : grouped.length === 0 ? (
            <EmptyState title="Inga planerade åtgärder" description="Lägg till en åtgärd för att bygga en långsiktig underhållsplan." />
          ) : (
            <div className="divide-y divide-sand-200">
              {grouped.map(([plannedYear, rows]) => {
                const yearCost = rows.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0);
                return (
                  <section key={plannedYear} aria-labelledby={`maintenance-year-${plannedYear}`}>
                    <div className="flex items-center justify-between gap-4 bg-[#FCFBF8] px-5 py-4 sm:px-6">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Planår</p>
                        <h3 id={`maintenance-year-${plannedYear}`} className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] text-petroleum-900">{plannedYear}</h3>
                      </div>
                      {permissions.canViewFinance ? <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">Planerad kostnad</p><p className="mt-1 text-sm font-semibold text-ink-900">{currency.format(yearCost)}</p></div> : null}
                    </div>
                    <div className="divide-y divide-sand-100">
                      {rows.map((item) => (
                        <article key={item.id} className="p-5 transition hover:bg-sand-50/45 sm:p-6">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">{item.property_name}</p>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(item.status)}`}>{statusLabel[item.status] || item.status}</span>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${priorityClass(item.priority)}`}>{priorityLabel[item.priority] || item.priority}</span>
                              </div>
                              <h4 className="mt-2 font-display text-lg font-semibold tracking-[-0.02em] text-ink-900">{item.component}</h4>
                              <p className="mt-1 text-sm leading-6 text-ink-500">{item.measure}</p>
                              {item.source === "legacy" ? <InlineAlert tone="warning">Äldre rad – kör backfill innan status kan ändras.</InlineAlert> : null}
                              {item.work_order_id ? <Link className={`${premiumSecondaryButtonClass} mt-3 h-9 px-3 text-xs`} href={`/dashboard/arbetsorder/${item.work_order_id}`}>{item.work_order_number || "Öppna arbetsorder"}</Link> : null}
                            </div>
                            <div className="shrink-0 lg:text-right">
                              {permissions.canViewFinance ? <p className="font-semibold text-ink-900">{currency.format(item.estimated_cost)}</p> : <p className="text-xs font-medium text-ink-500">Kostnad begränsad</p>}
                              <p className="mt-1 text-xs text-ink-500">{item.interval_years ? `Intervall vart ${item.interval_years}:e år` : "Ingen återkommande intervall"}</p>
                              {permissions.canManage && item.source !== "legacy" ? (
                                <button type="button" onClick={() => (editingId === item.id ? setEditingId("") : startEdit(item))} className={`${premiumSecondaryButtonClass} mt-3 h-9 px-3 text-xs lg:ml-auto`}>
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{editingId === item.id ? "Stäng" : "Ändra"}
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {permissions.canManage && item.source !== "legacy" ? (
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <select aria-label={`Status för ${item.component}`} disabled={busyId === item.id} value={item.status} onChange={(event) => void updateStatus(item, event.target.value)} className="h-10 rounded-xl border border-sand-200 bg-white px-3 text-sm font-medium text-ink-700 outline-none focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:opacity-50">
                                <option value="planned">Planerad</option><option value="approved">Godkänd</option><option value="in_progress">Pågår</option><option value="completed">Slutförd</option><option value="cancelled">Avbruten</option>
                              </select>
                              {!item.work_order_id && !["completed", "cancelled"].includes(item.status) ? (
                                <button type="button" disabled={busyId === item.id} onClick={() => void createWorkOrder(item)} className={`${premiumPrimaryButtonClass} h-10 px-4 text-xs`}>
                                  <ClipboardPlus className="mr-2 h-4 w-4" aria-hidden="true" />{busyId === item.id ? "Skapar…" : "Skapa arbetsorder"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}

                          {permissions.canManage && editingId === item.id && item.source !== "legacy" ? (
                            <div className="mt-4 space-y-3 rounded-xl border border-sand-200 bg-[#FCFBF8] p-4">
                              <input className={premiumFieldClass} placeholder="Byggnadsdel" aria-label="Byggnadsdel" value={editForm.component} onChange={(e) => setEditForm({ ...editForm, component: e.target.value })} />
                              <textarea className={premiumTextareaClass} placeholder="Åtgärd" aria-label="Åtgärd" value={editForm.measure} onChange={(e) => setEditForm({ ...editForm, measure: e.target.value })} />
                              <div className="grid grid-cols-2 gap-3"><input className={premiumFieldClass} type="number" placeholder="Planerat år" aria-label="Planerat år" value={editForm.plannedYear} onChange={(e) => setEditForm({ ...editForm, plannedYear: e.target.value })} /><input className={premiumFieldClass} type="number" min="0" placeholder="Intervall, år" aria-label="Intervall, år" value={editForm.intervalYears} onChange={(e) => setEditForm({ ...editForm, intervalYears: e.target.value })} /></div>
                              <input className={premiumFieldClass} type="number" min="0" placeholder="Beräknad kostnad" aria-label="Beräknad kostnad" value={editForm.estimatedCost} onChange={(e) => setEditForm({ ...editForm, estimatedCost: e.target.value })} />
                              <select className={premiumFieldClass} aria-label="Prioritet" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}><option value="low">Låg</option><option value="normal">Normal</option><option value="high">Hög</option><option value="critical">Kritisk</option></select>
                              <button type="button" disabled={busyId === item.id} onClick={() => void saveEdit(item)} className={premiumPrimaryButtonClass}>{busyId === item.id ? "Sparar…" : "Spara ändringar"}</button>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>;
}
