"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  PlayCircle,
  Route,
  Search,
  Wrench,
} from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/domain-labels";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";

type RangeKey = "30" | "90" | "all";
type FocusKey = "all" | "open" | "urgent" | "active" | "completed";

type SlaEvaluation = {
  risk: "overdue" | "critical" | "soon" | "normal" | "fulfilled" | "paused" | "not_configured";
  label: string;
};

type WorkOrder = {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  scheduled_start: string | null;
  completed_at: string | null;
  enterprise: {
    work_order_number: string | null;
    work_type: string;
    source: string;
  } | null;
  sla: SlaEvaluation;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string; unit_type: string } | null;
  assigned_to: { id: string; name: string | null; email: string } | null;
};

type WorkOrdersResponse = {
  error?: string;
  workOrders?: WorkOrder[];
  permissions?: { canManage?: boolean; scopedToAssigned?: boolean };
};

type WeekPoint = { label: string; created: number; active: number; completed: number; overdue: number };

const statusLabels = WORK_ORDER_STATUS_LABELS;
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const typeLabels: Record<string, string> = {
  corrective: "Avhjälpande",
  preventive: "Förebyggande",
  inspection: "Besiktning",
  emergency: "Akut",
  project: "Projekt",
  warranty: "Garanti",
};
const activeStatuses = new Set(["new", "planned", "in_progress", "waiting_material", "blocked"]);
const completedStatuses = new Set(["completed", "invoiced"]);
const dateFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

function startOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeek(value = new Date()) {
  const date = startOfDay(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function startForRange(range: RangeKey) {
  if (range === "all") return new Date(2000, 0, 1);
  const date = startOfDay();
  date.setDate(date.getDate() - Number(range) + 1);
  return date;
}

function isSameDay(value: string | null | undefined, compare = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === compare.getFullYear() && date.getMonth() === compare.getMonth() && date.getDate() === compare.getDate();
}

function weekKey(value: Date) {
  return startOfWeek(value).toISOString().slice(0, 10);
}

function recentWeeks() {
  const current = startOfWeek();
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(current);
    date.setDate(current.getDate() - (7 - index) * 7);
    return date;
  });
}

function workOrderNumber(order: WorkOrder) {
  return order.enterprise?.work_order_number || `AO-${order.id.slice(0, 6).toUpperCase()}`;
}

function propertyAddress(order: WorkOrder) {
  return [order.property.address, order.property.city, "Sverige"].filter(Boolean).join(", ");
}

function statusTone(status: string) {
  if (status === "completed" || status === "invoiced") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "in_progress") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (status === "waiting_material" || status === "blocked") return "bg-violet-50 text-violet-700 ring-violet-100";
  if (status === "planned") return "bg-blue-50 text-blue-700 ring-blue-100";
  return "bg-sand-100 text-ink-650 ring-sand-200";
}

function priorityTone(priority: string) {
  if (priority === "urgent") return "bg-red-50 text-red-700 ring-red-100";
  if (priority === "high") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (priority === "low") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  return "bg-amber-50 text-amber-700 ring-amber-100";
}

function linePath(values: number[], max: number, width = 620, height = 190) {
  const xPad = 10;
  const yPad = 12;
  return values.map((value, index) => {
    const x = xPad + (index / Math.max(1, values.length - 1)) * (width - xPad * 2);
    const y = height - yPad - (value / Math.max(1, max)) * (height - yPad * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function routeUrl(orders: WorkOrder[]) {
  const addresses = orders.slice(0, 8).map(propertyAddress).filter(Boolean);
  if (!addresses.length) return "https://www.google.com/maps";
  if (addresses.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
  const origin = addresses[0];
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(1, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [scopedToAssigned, setScopedToAssigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("30");
  const [focus, setFocus] = useState<FocusKey>("all");
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/work-orders", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const body = await readResponseJson<WorkOrdersResponse>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta arbetsordrar");
        if (!active) return;
        setOrders(body.workOrders || []);
        setCanManage(Boolean(body.permissions?.canManage));
        setScopedToAssigned(Boolean(body.permissions?.scopedToAssigned));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Kunde inte läsa arbetsordrar");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const queryValue = query.trim().toLocaleLowerCase("sv-SE");
  const rangeOrders = useMemo(() => {
    const start = startForRange(range).getTime();
    return orders.filter((order) => range === "all" || new Date(order.created_at).getTime() >= start || (order.completed_at && new Date(order.completed_at).getTime() >= start));
  }, [orders, range]);

  const filteredOrders = useMemo(() => rangeOrders.filter((order) => {
    if (order.status === "cancelled") return false;
    if (focus === "open" && !activeStatuses.has(order.status)) return false;
    if (focus === "urgent" && !(order.priority === "urgent" || order.enterprise?.work_type === "emergency")) return false;
    if (focus === "active" && order.status !== "in_progress") return false;
    if (focus === "completed" && !completedStatuses.has(order.status)) return false;
    if (!queryValue) return true;
    return [
      workOrderNumber(order),
      order.title,
      order.property.name,
      order.property.address,
      order.property.city,
      order.unit?.designation,
      order.assigned_to?.name,
      order.assigned_to?.email,
      statusLabels[order.status],
      priorityLabels[order.priority],
      typeLabels[order.enterprise?.work_type || ""],
    ].filter(Boolean).some((value) => String(value).toLocaleLowerCase("sv-SE").includes(queryValue));
  }), [focus, queryValue, rangeOrders]);

  const activeOrders = orders.filter((order) => activeStatuses.has(order.status));
  const urgentOrders = activeOrders.filter((order) => order.priority === "urgent" || order.enterprise?.work_type === "emergency");
  const inProgress = activeOrders.filter((order) => order.status === "in_progress");
  const weekStart = startOfWeek().getTime();
  const completedThisWeek = orders.filter((order) => completedStatuses.has(order.status) && order.completed_at && new Date(order.completed_at).getTime() >= weekStart);
  const overdue = activeOrders.filter((order) => order.sla.risk === "overdue" || order.sla.risk === "critical");

  const weekly = useMemo<WeekPoint[]>(() => recentWeeks().map((week) => {
    const key = weekKey(week);
    const created = orders.filter((order) => weekKey(new Date(order.created_at)) === key).length;
    const active = orders.filter((order) => order.scheduled_start && weekKey(new Date(order.scheduled_start)) === key).length;
    const completed = orders.filter((order) => order.completed_at && weekKey(new Date(order.completed_at)) === key).length;
    const overdueCount = orders.filter((order) => (order.sla.risk === "overdue" || order.sla.risk === "critical") && weekKey(new Date(order.created_at)) === key).length;
    const weekNo = Math.ceil((((week.getTime() - new Date(week.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(week.getFullYear(), 0, 1).getDay() + 1) / 7);
    return { label: `v. ${weekNo}`, created, active, completed, overdue: overdueCount };
  }), [orders]);
  const chartMax = Math.max(1, ...weekly.flatMap((point) => [point.created, point.active, point.completed, point.overdue]));

  const statusRows = useMemo(() => {
    const statuses = ["new", "planned", "in_progress", "waiting_material", "completed", "blocked"];
    const total = Math.max(1, orders.filter((order) => order.status !== "cancelled").length);
    return statuses.map((status) => {
      const count = orders.filter((order) => order.status === status || (status === "completed" && order.status === "invoiced")).length;
      return { status, count, percent: Math.round((count / total) * 100) };
    });
  }, [orders]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    orders.filter((order) => order.status !== "cancelled").forEach((order) => {
      const key = order.enterprise?.work_type || "corrective";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [orders]);
  const categoryTotal = Math.max(1, categories.reduce((sum, [, value]) => sum + value, 0));
  const categoryColors = ["#29463f", "#587f73", "#c6b17b", "#7291a8", "#8d6e9f", "#a5c2b7"];
  let categoryCursor = 0;
  const donut = categories.length
    ? `conic-gradient(${categories.map(([, value], index) => {
        const from = categoryCursor;
        categoryCursor += (value / categoryTotal) * 100;
        return `${categoryColors[index % categoryColors.length]} ${from.toFixed(1)}% ${categoryCursor.toFixed(1)}%`;
      }).join(",")})`
    : "conic-gradient(#ece4d8 0 100%)";

  const mapOrders = useMemo(() => filteredOrders.filter((order) => activeStatuses.has(order.status)).slice(0, 12), [filteredOrders]);
  useEffect(() => {
    if (!mapOrders.length) {
      setSelectedMapId(null);
      return;
    }
    if (!selectedMapId || !mapOrders.some((order) => order.id === selectedMapId)) setSelectedMapId(mapOrders[0].id);
  }, [mapOrders, selectedMapId]);
  const selectedMapOrder = mapOrders.find((order) => order.id === selectedMapId) || mapOrders[0] || null;
  const mapAddress = selectedMapOrder ? propertyAddress(selectedMapOrder) : "";
  const mapEmbed = selectedMapOrder ? `https://maps.google.com/maps?q=${encodeURIComponent(mapAddress)}&z=14&output=embed` : "";
  const mapExternal = selectedMapOrder ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}` : "https://www.google.com/maps";

  const recent = useMemo(() => [...filteredOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5), [filteredOrders]);
  const todayPlanning = useMemo(() => orders.filter((order) => activeStatuses.has(order.status) && isSameDay(order.scheduled_start)).sort((a, b) => new Date(a.scheduled_start || 0).getTime() - new Date(b.scheduled_start || 0).getTime()).slice(0, 4), [orders]);

  return <div className="space-y-4 sm:space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Operativ förvaltning / Arbetsorder</p>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Arbetsorder</h1>
        <p className="mt-1 text-sm text-ink-500">Planera, prioritera och följ arbetsordrar, SLA, ansvariga och fastigheter i en samlad arbetsyta.</p>
        {scopedToAssigned ? <p className="mt-2 text-[11px] font-semibold text-petroleum-700">Vyn är begränsad till arbetsordrar som är tilldelade dig.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <select value={range} onChange={(event) => setRange(event.target.value as RangeKey)} aria-label="Period" className="h-10 rounded-xl border border-sand-200 bg-white pl-9 pr-8 text-[11px] font-semibold text-ink-650 shadow-premium-sm">
            <option value="30">Senaste 30 dagarna</option>
            <option value="90">Senaste 90 dagarna</option>
            <option value="all">Alla perioder</option>
          </select>
        </label>
        {canManage ? <Link href="/dashboard/arbetsorder/ny" className="inline-flex h-10 items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[11px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300"><Wrench className="h-4 w-4" />Ny arbetsorder</Link> : null}
      </div>
    </div>

    <section className="rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm">
      <label className="relative block max-w-2xl">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Sök arbetsorder" placeholder="Sök arbetsorder, fastighet, adress, tekniker eller status ..." className="h-11 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] pl-10 pr-4 text-[12px] text-ink-800 outline-none transition focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100" />
      </label>
    </section>

    {error ? <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div> : null}
    <SoftDeleteUndoBanner entityLabel="Arbetsordern" restoreApiPath={(id) => `/api/work-orders/${id}/restore`} detailPath={(id) => `/dashboard/arbetsorder/${id}`} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={AlertTriangle} label="Öppna arbetsorder" value={loading ? "—" : activeOrders.length} helper={`${overdue.length} kräver SLA-fokus`} onClick={() => setFocus("open")} active={focus === "open"} tone="danger" />
      <Kpi icon={Clock3} label="Akuta ärenden" value={loading ? "—" : urgentOrders.length} helper="Akut prioritet eller akut arbetstyp" onClick={() => setFocus("urgent")} active={focus === "urgent"} tone="warning" />
      <Kpi icon={PlayCircle} label="Pågående idag" value={loading ? "—" : inProgress.length} helper={`${todayPlanning.length} schemalagda idag`} onClick={() => setFocus("active")} active={focus === "active"} tone="info" />
      <Kpi icon={CheckCircle2} label="Slutförda denna vecka" value={loading ? "—" : completedThisWeek.length} helper="Klara eller fakturerade" onClick={() => setFocus("completed")} active={focus === "completed"} tone="success" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.68fr_0.82fr]">
      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-[18px] font-semibold text-ink-950">Arbetsorderutveckling</h2><p className="mt-1 text-[10px] text-ink-450">Verkliga arbetsorder grupperade per vecka.</p></div><Link href="/dashboard/arbetsorder/operationsoversikt" className="rounded-lg border border-sand-200 bg-white px-3 py-2 text-[10px] font-semibold text-petroleum-700 hover:bg-petroleum-50">Veckovis</Link></div>
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-ink-500"><Legend color="#29463f" text="Skapade" /><Legend color="#779e90" text="Planerade/pågående" /><Legend color="#c6b17b" text="Slutförda" /><Legend color="#dc2626" text="Försenade nu" /></div>
        <div className="mt-4 rounded-xl bg-[#FCFBF8] px-3 py-4">
          <svg viewBox="0 0 620 190" className="h-[215px] w-full" role="img" aria-label="Arbetsorderutveckling senaste åtta veckorna">
            {[0, 1, 2, 3, 4].map((index) => <line key={index} x1="10" x2="610" y1={12 + index * 41.5} y2={12 + index * 41.5} stroke="#ece4d8" />)}
            <path d={linePath(weekly.map((point) => point.created), chartMax)} fill="none" stroke="#29463f" strokeWidth="3" />
            <path d={linePath(weekly.map((point) => point.active), chartMax)} fill="none" stroke="#779e90" strokeWidth="2.5" />
            <path d={linePath(weekly.map((point) => point.completed), chartMax)} fill="none" stroke="#c6a35b" strokeWidth="2.25" />
            <path d={linePath(weekly.map((point) => point.overdue), chartMax)} fill="none" stroke="#dc2626" strokeWidth="2" />
          </svg>
          <div className="grid grid-cols-8 text-center text-[9px] text-ink-400">{weekly.map((point) => <span key={point.label}>{point.label}</span>)}</div>
        </div>
        <Link href="/dashboard/arbetsorder/operationsoversikt" className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa detaljerad rapport <ArrowRight className="h-3 w-3" /></Link>
      </article>

      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="font-display text-[18px] font-semibold text-ink-950">Statusfördelning</h2><button type="button" onClick={() => setFocus("all")} className="rounded-lg border border-sand-200 bg-white px-3 py-2 text-[10px] font-semibold text-ink-600 hover:bg-sand-50">Alla arbetsorder</button></div>
        <div className="mt-5 divide-y divide-sand-100">{statusRows.map((row) => <div key={row.status} className="grid grid-cols-[minmax(0,1fr)_72px_42px] items-center gap-3 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${row.status === "completed" ? "bg-emerald-500" : row.status === "in_progress" ? "bg-amber-500" : row.status === "waiting_material" || row.status === "blocked" ? "bg-violet-500" : "bg-sky-500"}`} /><span className="truncate text-[10px] font-semibold text-ink-700">{statusLabels[row.status] || row.status}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-100"><div className="h-full rounded-full bg-petroleum-700" style={{ width: `${Math.max(row.count ? 8 : 0, row.percent)}%` }} /></div></div><span className="text-right text-[10px] font-semibold text-ink-700">{row.count}</span><span className="text-right text-[9px] text-ink-400">{row.percent}%</span></div>)}</div>
        <button type="button" onClick={() => setFocus("all")} className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">Visa alla statusar <ArrowRight className="h-3 w-3" /></button>
      </article>

      <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <div className="flex items-center justify-between px-4 py-3.5"><div><h2 className="font-display text-[17px] font-semibold text-ink-950">Arbetsorder på karta</h2><p className="mt-0.5 text-[9px] text-ink-450">Klicka mellan arbetsorder och planera rutt.</p></div><MapPin className="h-4 w-4 text-petroleum-700" /></div>
        <div className="flex gap-1.5 border-y border-sand-100 px-3 py-2"><MapChip label="Akut" dot="bg-red-500" onClick={() => setFocus("urgent")} /><MapChip label="Pågående" dot="bg-amber-500" onClick={() => setFocus("active")} /><MapChip label="Klar" dot="bg-emerald-600" onClick={() => setFocus("completed")} /></div>
        {selectedMapOrder ? <>
          <div className="relative h-[225px] bg-sand-100">
            <iframe key={selectedMapOrder.id} title={`Karta för ${selectedMapOrder.title}`} src={mapEmbed} className="h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            <div className="pointer-events-none absolute left-3 top-3 max-w-[220px] rounded-xl border border-white/80 bg-white/95 px-3 py-2 shadow-premium-sm backdrop-blur-sm"><p className="text-[10px] font-semibold text-ink-900">{workOrderNumber(selectedMapOrder)}</p><p className="mt-0.5 truncate text-[9px] text-ink-500">{selectedMapOrder.property.name} · {selectedMapOrder.property.address}</p><p className="mt-1 text-[9px] font-semibold text-petroleum-700">{priorityLabels[selectedMapOrder.priority] || selectedMapOrder.priority} · {selectedMapOrder.title}</p></div>
          </div>
          <div className="border-t border-sand-100 p-3">
            {mapOrders.length > 1 ? <select value={selectedMapOrder.id} onChange={(event) => setSelectedMapId(event.target.value)} aria-label="Välj arbetsorder på kartan" className="mb-2.5 h-9 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] px-3 text-[10px] font-semibold text-ink-650 outline-none focus:ring-2 focus:ring-petroleum-100">{mapOrders.map((order) => <option key={order.id} value={order.id}>{workOrderNumber(order)} · {order.property.name}</option>)}</select> : null}
            <div className="grid grid-cols-2 gap-2"><a href={mapExternal} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-sand-200 bg-white px-2 text-[9px] font-semibold text-petroleum-700 hover:bg-petroleum-50">Öppna karta <ExternalLink className="h-3 w-3" /></a><a href={routeUrl(mapOrders)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-petroleum-900 px-2 text-[9px] font-semibold text-white hover:bg-petroleum-800"><Route className="h-3.5 w-3.5" />Planera rutt</a></div>
          </div>
        </> : <div className="flex h-[290px] flex-col items-center justify-center px-6 text-center"><MapPin className="h-7 w-7 text-sand-400" /><p className="mt-2 text-[11px] font-semibold text-ink-700">Ingen arbetsorder med plats i filtret.</p><button type="button" onClick={() => { setFocus("all"); setQuery(""); }} className="mt-3 text-[10px] font-semibold text-petroleum-700">Rensa filter</button></div>}
      </article>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.24fr_0.78fr_0.86fr]">
      <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <SectionHead title="Senaste arbetsorder" action={<button type="button" onClick={() => { setFocus("all"); setQuery(""); }} className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3" /></button>} />
        {recent.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="bg-[#FCFBF8] text-[9px] text-ink-400"><th className="px-4 py-2.5">Ärendenr</th><th className="px-3">Fastighet</th><th className="px-3">Kategori</th><th className="px-3">Prioritet</th><th className="px-3">Status</th><th className="px-3">Ansvarig</th><th className="px-3">Datum</th><th className="px-3" /></tr></thead><tbody className="divide-y divide-sand-100">{recent.map((order) => <tr key={order.id} className="text-[9px] text-ink-600 transition hover:bg-petroleum-50/40"><td className="px-4 py-3 font-semibold text-ink-850"><Link href={`/dashboard/arbetsorder/${order.id}`}>{workOrderNumber(order)}</Link></td><td className="px-3"><Link href={`/dashboard/fastigheter/${order.property.id}`} className="hover:text-petroleum-800">{order.property.name}</Link></td><td className="px-3">{typeLabels[order.enterprise?.work_type || ""] || "Arbetsorder"}</td><td className="px-3"><span className={`rounded-full px-2 py-1 font-semibold ring-1 ${priorityTone(order.priority)}`}>{priorityLabels[order.priority] || order.priority}</span></td><td className="px-3"><span className={`rounded-full px-2 py-1 font-semibold ring-1 ${statusTone(order.status)}`}>{statusLabels[order.status] || order.status}</span></td><td className="max-w-[120px] truncate px-3">{order.assigned_to?.name || order.assigned_to?.email || "Ej tilldelad"}</td><td className="px-3">{dateFmt.format(new Date(order.created_at))}</td><td className="px-3"><Link href={`/dashboard/arbetsorder/${order.id}`} aria-label={`Öppna ${workOrderNumber(order)}`}><ArrowRight className="h-3.5 w-3.5 text-petroleum-700" /></Link></td></tr>)}</tbody></table></div> : <Empty title={loading ? "Läser arbetsordrar…" : "Inga arbetsordrar i filtret"} />}
        <div className="border-t border-sand-100 px-4 py-3"><button type="button" onClick={() => { setFocus("all"); setQuery(""); }} className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla arbetsorder <ArrowRight className="h-3 w-3" /></button></div>
      </article>

      <article className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
        <h2 className="font-display text-[18px] font-semibold text-ink-950">Fördelning per kategori</h2>
        <div className="mt-5 flex items-center gap-5"><div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: donut }}><div className="absolute inset-[24px] flex flex-col items-center justify-center rounded-full bg-white"><span className="font-display text-2xl font-semibold text-ink-950">{orders.filter((order) => order.status !== "cancelled").length}</span><span className="text-[9px] text-ink-450">Totalt</span></div></div><div className="min-w-0 flex-1 space-y-2.5">{categories.map(([category, count], index) => <div key={category} className="flex items-center gap-2 text-[9px]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} /><span className="min-w-0 flex-1 truncate text-ink-600">{typeLabels[category] || category}</span><span className="font-semibold text-ink-750">{Math.round((count / categoryTotal) * 100)}%</span></div>)}</div></div>
        <Link href="/dashboard/arbetsorder/operationsoversikt" className="mt-5 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa detaljer <ArrowRight className="h-3 w-3" /></Link>
      </article>

      <article className="rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
        <SectionHead title="Dagens planering" action={<Link href="/dashboard/arbetsorder/planering" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa alla <ArrowRight className="h-3 w-3" /></Link>} />
        {todayPlanning.length ? <div className="divide-y divide-sand-100 px-4">{todayPlanning.map((order) => <Link key={order.id} href={`/dashboard/arbetsorder/${order.id}`} className="grid grid-cols-[44px_32px_minmax(0,1fr)_auto] items-center gap-2 py-3 transition hover:bg-petroleum-50/40"><span className="text-[9px] font-semibold text-ink-500">{timeFmt.format(new Date(order.scheduled_start || ""))}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-petroleum-50 text-[9px] font-semibold text-petroleum-800">{(order.assigned_to?.name || order.assigned_to?.email || "ET").split(/\s|@/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-[10px] font-semibold text-ink-850">{order.assigned_to?.name || order.assigned_to?.email || "Ej tilldelad"}</span><span className="mt-0.5 block truncate text-[9px] text-ink-450">{order.property.name} · {order.title}</span></span><ArrowRight className="h-3.5 w-3.5 text-petroleum-700" /></Link>)}</div> : <Empty title={loading ? "Läser dagens planering…" : "Inga arbetsorder schemalagda idag"} />}
        <div className="border-t border-sand-100 px-4 py-3"><Link href="/dashboard/arbetsorder/planering" className="inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Se hela dagens schema <ArrowRight className="h-3 w-3" /></Link></div>
      </article>
    </section>
  </div>;
}

function Kpi({ icon: Icon, label, value, helper, onClick, active, tone }: { icon: LucideIcon; label: string; value: string | number; helper: string; onClick: () => void; active: boolean; tone: "danger" | "warning" | "info" | "success" }) {
  const iconTone = tone === "danger" ? "bg-red-50 text-red-600" : tone === "warning" ? "bg-amber-50 text-amber-700" : tone === "info" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700";
  return <button type="button" onClick={onClick} className={`group rounded-2xl border bg-white p-5 text-left shadow-premium-sm transition hover:-translate-y-0.5 hover:shadow-premium-md ${active ? "border-petroleum-300 ring-2 ring-petroleum-100" : "border-sand-200"}`}><div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconTone}`}><Icon className="h-5 w-5" strokeWidth={1.7} /></span><div className="min-w-0"><p className="text-[11px] font-medium text-ink-650">{label}</p><p className="mt-1 font-display text-[30px] font-semibold tracking-[-0.04em] text-ink-950">{value}</p><p className="mt-1 text-[9px] text-ink-450">{helper}</p></div></div><span className="mt-5 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 group-hover:text-petroleum-900">Visa {label.toLocaleLowerCase("sv-SE")} <ArrowRight className="h-3 w-3" /></span></button>;
}

function Legend({ color, text }: { color: string; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: color }} />{text}</span>;
}

function MapChip({ label, dot, onClick }: { label: string; dot: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-sand-200 bg-white px-2.5 py-1 text-[9px] font-semibold text-ink-650 hover:bg-sand-50"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</button>;
}

function SectionHead({ title, action }: { title: string; action: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-sand-100 px-4 py-3.5"><h2 className="font-display text-[18px] font-semibold text-ink-950">{title}</h2>{action}</div>;
}

function Empty({ title }: { title: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center px-5 text-center"><BadgeCheck className="h-6 w-6 text-sand-400" /><p className="mt-2 text-[11px] font-semibold text-ink-650">{title}</p></div>;
}
