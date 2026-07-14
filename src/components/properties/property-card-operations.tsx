"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CalendarClock, ClipboardCheck, FileBadge2, Gauge, ShieldCheck, Wrench } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";

type PropertyCardData = {
  property: {
    id: string;
    work_orders: { id: string; title: string; status: string; priority: string; scheduled_end: string | null; actual_cost: string | number | null; updated_at: string }[];
    projects: { id: string; name: string; status: string; risk: string; budget: string | number; forecast: string | number; actual: string | number; end_date: string | null; updated_at: string }[];
  };
  entrances: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  warranties: Record<string, unknown>[];
  inspections: Record<string, unknown>[];
  agreements: Record<string, unknown>[];
  metrics: {
    entrances: number;
    technicalAssets: number;
    criticalAssets: number;
    serviceDue90Days: number;
    warrantiesExpiring180Days: number;
    inspectionsDue90Days: number;
    agreementsEnding180Days: number;
  };
};

type Props = { propertyId: string };

const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const assetLabels: Record<string, string> = { elevator: "Hiss", ventilation: "Ventilation", heating: "Värme", electricity: "El", water: "VA", fire: "Brandskydd", access: "Passersystem", other: "Övrigt" };
const statusLabels: Record<string, string> = { active: "Aktiv", service_due: "Service krävs", out_of_service: "Ur drift", decommissioned: "Avvecklad", planned: "Planerad", completed: "Genomförd", approved: "Godkänd", remark: "Anmärkning", overdue: "Försenad", in_progress: "Pågående", waiting: "Väntar", assigned: "Tilldelad", cancelled: "Avbruten" };

function value(item: Record<string, unknown>, key: string) { return item[key] == null ? null : String(item[key]); }
function formatDate(raw: unknown) { if (!raw) return "Ej satt"; const parsed = new Date(String(raw)); return Number.isNaN(parsed.getTime()) ? "Ej satt" : date.format(parsed); }
function badge(status: unknown) { const raw = String(status || ""); const warning = ["critical", "out_of_service", "service_due", "remark", "overdue", "high"].includes(raw); return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${warning ? "bg-amber-50 text-amber-800" : "bg-petroleum-50 text-petroleum-800"}`}>{statusLabels[raw] || raw || "Aktiv"}</span>; }

export function PropertyCardOperations({ propertyId }: Props) {
  const [data, setData] = useState<PropertyCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/card`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta fastighetskortet");
      setData(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte hämta fastighetskortet"); }
    finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  const annualAgreementCost = useMemo(() => (data?.agreements || []).reduce((sum, item) => {
    const amount = Number(item.cost_amount || 0); const interval = String(item.cost_interval || "yearly");
    if (interval === "monthly") return sum + amount * 12;
    if (interval === "quarterly") return sum + amount * 4;
    return sum + amount;
  }, 0), [data]);

  if (loading) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-2xl bg-sand-100"/><div className="grid gap-4 lg:grid-cols-3">{[1,2,3].map(item=><div key={item} className="h-64 animate-pulse rounded-2xl bg-sand-100"/>)}</div></div>;
  if (!data) return <InlineAlert>{error || "Fastighetskortet kunde inte laddas."}</InlineAlert>;

  return <div className="space-y-6">
    {error ? <InlineAlert>{error}</InlineAlert> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={Wrench} label="Tekniska installationer" value={data.metrics.technicalAssets} hint={`${data.metrics.criticalAssets} kritiska eller ur drift`} />
      <MetricCard icon={CalendarClock} label="Service inom 90 dagar" value={data.metrics.serviceDue90Days} />
      <MetricCard icon={ClipboardCheck} label="Besiktningar inom 90 dagar" value={data.metrics.inspectionsDue90Days} />
      <MetricCard icon={ShieldCheck} label="Garantier inom 180 dagar" value={data.metrics.warrantiesExpiring180Days} hint={`Avtal: ${money.format(annualAgreementCost)}/år`} />
    </section>

    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title="Tekniska installationer" description="Driftstatus, service och kritikalitet." bodyClassName="p-0">
        {data.assets.length === 0 ? <EmptyState title="Inga installationer registrerade" description="Registrera hissar, ventilation, värme, el, VA och brandskydd."/> : <div className="divide-y divide-sand-100">{data.assets.slice(0,8).map((item) => <article key={value(item,"id") || JSON.stringify(item)} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{value(item,"name")}</p><p className="mt-1 text-sm text-ink-500">{assetLabels[value(item,"category") || "other"] || value(item,"category")}{value(item,"building_name") ? ` · ${value(item,"building_name")}` : ""}</p></div>{badge(item.status)}</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="text-ink-400">Nästa service</p><p className="mt-1 font-semibold text-ink-700">{formatDate(item.next_service_at)}</p></div><div><p className="text-ink-400">Placering</p><p className="mt-1 font-semibold text-ink-700">{value(item,"location") || "Ej angiven"}</p></div></div></article>)}</div>}
      </Panel>

      <Panel title="Besiktningar och garantier" description="Kommande myndighetskrav och garantislut." bodyClassName="p-0">
        {data.inspections.length === 0 && data.warranties.length === 0 ? <EmptyState title="Inga poster registrerade" description="Besiktningar och garantier visas här när de läggs till."/> : <div className="divide-y divide-sand-100">{data.inspections.slice(0,5).map(item=><article key={value(item,"id")!} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{value(item,"title")}</p><p className="mt-1 text-sm text-ink-500">Besiktning · {formatDate(item.next_due_at || item.scheduled_at)}</p></div>{badge(item.status)}</div></article>)}{data.warranties.slice(0,5).map(item=><article key={value(item,"id")!} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{value(item,"title")}</p><p className="mt-1 text-sm text-ink-500">Garanti till {formatDate(item.expires_at)}{value(item,"supplier") ? ` · ${value(item,"supplier")}` : ""}</p></div><FileBadge2 className="h-5 w-5 text-petroleum-700"/></div></article>)}</div>}
      </Panel>

      <Panel title="Serviceavtal" description="Leverantörer, avtalsperioder och kostnader." bodyClassName="p-0">
        {data.agreements.length === 0 ? <EmptyState title="Inga serviceavtal registrerade" description="Lägg till avtal för hiss, ventilation, brand, kyla och andra tjänster."/> : <div className="divide-y divide-sand-100">{data.agreements.slice(0,8).map(item=><article key={value(item,"id")!} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{value(item,"supplier")}</p><p className="mt-1 text-sm text-ink-500">{value(item,"service_area")}</p></div>{badge(item.status)}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-ink-400">Slutar {formatDate(item.ends_at)}</span><span className="font-semibold text-ink-800">{Number(item.cost_amount || 0) ? money.format(Number(item.cost_amount)) : "Kostnad saknas"}</span></div></article>)}</div>}
      </Panel>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Arbetsordrar" description="Senaste operativa arbeten på fastigheten." bodyClassName="p-0">
        {data.property.work_orders.length === 0 ? <EmptyState title="Inga arbetsordrar" description="Arbetsordrar kopplade till fastigheten visas här."/> : <div className="divide-y divide-sand-100">{data.property.work_orders.map(item=><Link key={item.id} href={`/dashboard/arbetsorder/${item.id}`} className="block p-5 transition hover:bg-sand-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{item.title}</p><p className="mt-1 text-sm text-ink-500">Planerat slut {formatDate(item.scheduled_end)}</p></div>{badge(item.status)}</div></Link>)}</div>}
      </Panel>
      <Panel title="Projekt" description="Investeringar, budget och risk kopplad till fastigheten." bodyClassName="p-0">
        {data.property.projects.length === 0 ? <EmptyState title="Inga projekt" description="Projekt kopplade till fastigheten visas här."/> : <div className="divide-y divide-sand-100">{data.property.projects.map(item=><Link key={item.id} href={`/dashboard/projekt/${item.id}`} className="block p-5 transition hover:bg-sand-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{item.name}</p><p className="mt-1 text-sm text-ink-500">Utfall {money.format(Number(item.actual || 0))} av budget {money.format(Number(item.budget || 0))}</p></div>{badge(item.risk)}</div></Link>)}</div>}
      </Panel>
    </div>

    {(data.metrics.criticalAssets > 0 || data.metrics.inspectionsDue90Days > 0) ? <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-semibold">Fastigheten kräver uppmärksamhet</p><p className="mt-1">{data.metrics.criticalAssets} kritiska installationer och {data.metrics.inspectionsDue90Days} besiktningar behöver följas upp.</p></div></div> : <div className="flex items-start gap-3 rounded-2xl border border-petroleum-100 bg-petroleum-50 p-5 text-sm text-petroleum-900"><Gauge className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-semibold">Driftläget ser stabilt ut</p><p className="mt-1">Inga kritiska installationer eller nära förestående besiktningar är registrerade.</p></div></div>}
  </div>;
}
