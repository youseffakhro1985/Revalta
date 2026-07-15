"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CircleDollarSign, ClipboardList, FolderKanban, Gauge } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, Panel } from "@/components/dashboard/premium-ui";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";

type Row = Record<string, unknown>;
type Data = {
  property: { id: string; name: string };
  component: Row;
  events: Row[];
  costs: Row[];
  linkedWorkOrders: Row[];
  linkedProjects: Row[];
  metrics: { eventCount: number; totalCostExVat: number; nextDueAt: string | null; linkedWorkOrders: number; linkedProjects: number };
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" });
const eventLabels: Record<string, string> = { installation: "Installation", commissioning: "Driftsättning", service: "Service", repair: "Reparation", inspection: "Besiktning", warranty: "Garantiärende", damage: "Skada", replacement: "Komponentbyte", shutdown: "Avställning", restart: "Återstart" };
const costLabels: Record<string, string> = { service: "Service", repair: "Reparation", spare_part: "Reservdel", inspection: "Besiktning", contractor: "Entreprenör", investment: "Investering", replacement: "Komponentbyte", other: "Övrigt" };

function text(row: Row, key: string) { return row[key] == null ? "" : String(row[key]); }
function number(row: Row, key: string) { return Number(row[key] || 0); }
function formatDate(value: unknown) { if (!value) return "Ej satt"; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? "Ej satt" : date.format(parsed); }

export function ComponentDetailView({ propertyId, componentId }: { propertyId: string; componentId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/properties/${propertyId}/components/${componentId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta komponenten");
      setData(payload);
    } catch (value) { setError(value instanceof Error ? value.message : "Kunde inte hämta komponenten"); }
    finally { setLoading(false); }
  }, [propertyId, componentId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;
  if (error || !data) return <InlineAlert>{error || "Komponenten kunde inte laddas."}</InlineAlert>;

  const component = data.component;
  const condition = number(component, "condition_grade");
  const warning = condition >= 4;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/fastigheter/${propertyId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-petroleum-700 hover:text-petroleum-900"><ArrowLeft className="h-4 w-4" /> Till fastighetskortet</Link>
        <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Komponentdetalj</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink-950">{text(component, "name")}</h1>
            <p className="mt-2 text-sm text-ink-500">{data.property.name}{text(component, "building_name") ? ` · ${text(component, "building_name")}` : ""}{text(component, "location") ? ` · ${text(component, "location")}` : ""}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${warning ? "bg-amber-50 text-amber-800" : "bg-petroleum-50 text-petroleum-800"}`}>{condition ? `Skick ${condition}/5` : "Skick ej bedömt"}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Gauge} label="Teknisk livslängd" value={number(component, "technical_lifetime_years") || "–"} hint="År" />
        <MetricCard icon={CalendarClock} label="Beräknat byte" value={number(component, "expected_replacement_year") || "–"} />
        <MetricCard icon={CircleDollarSign} label="Livscykelkostnad" value={money.format(data.metrics.totalCostExVat)} hint="Exklusive moms" />
        <MetricCard icon={ClipboardList} label="Händelser" value={data.metrics.eventCount} hint={`Nästa: ${formatDate(data.metrics.nextDueAt)}`} />
        <MetricCard icon={FolderKanban} label="Kopplade ärenden" value={data.metrics.linkedWorkOrders + data.metrics.linkedProjects} hint={`${data.metrics.linkedWorkOrders} arbetsordrar · ${data.metrics.linkedProjects} projekt`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Teknisk grunddata" description="Identifiering, livslängd och ansvar.">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Komponentklass" value={text(component, "component_class") || text(component, "category") || "Ej angiven"} />
            <Detail label="Status" value={text(component, "status") || "Ej angiven"} />
            <Detail label="Tillverkare" value={text(component, "manufacturer") || "Ej angiven"} />
            <Detail label="Modell" value={text(component, "model") || "Ej angiven"} />
            <Detail label="Serienummer" value={text(component, "serial_number") || "Ej angivet"} />
            <Detail label="Installationsår" value={number(component, "installation_year") || "Ej satt"} />
            <Detail label="Driftsatt" value={formatDate(component.commissioned_at)} />
            <Detail label="Ansvarig leverantör" value={text(component, "responsible_supplier") || "Ej angiven"} />
            <Detail label="Återanskaffningsvärde" value={number(component, "replacement_value") ? money.format(number(component, "replacement_value")) : "Ej satt"} />
            <Detail label="Nästa service" value={formatDate(component.next_service_at)} />
          </dl>
        </Panel>

        <Panel title="Livscykeltidslinje" description="Service, reparationer, besiktningar och andra tekniska händelser." bodyClassName="p-0">
          {data.events.length === 0 ? <EmptyState title="Ingen historik registrerad" description="Registrera service, reparation eller besiktning från komponentregistret." /> : (
            <div className="divide-y divide-sand-100">
              {data.events.map((event) => <article key={text(event, "id")} className="p-5 sm:px-6"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink-900">{text(event, "title")}</h3><span className="rounded-full bg-sand-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{eventLabels[text(event, "event_type")] || text(event, "event_type")}</span></div><p className="mt-1 text-sm text-ink-500">{text(event, "description") || text(event, "result") || "Ingen beskrivning"}</p><p className="mt-2 text-xs text-ink-400">{text(event, "provider") || text(event, "created_by_name") || text(event, "created_by_email")}{text(event, "work_order_title") ? ` · Arbetsorder: ${text(event, "work_order_title")}` : ""}{text(event, "project_name") ? ` · Projekt: ${text(event, "project_name")}` : ""}</p></div><div className="shrink-0 text-sm font-semibold text-ink-700 sm:text-right">{formatDate(event.event_date)}{event.next_due_at ? <p className="mt-1 text-xs font-normal text-ink-400">Nästa {formatDate(event.next_due_at)}</p> : null}</div></div></article>)}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Kostnadshistorik" description="Samlad teknisk kostnad exklusive moms." bodyClassName="p-0">
        {data.costs.length === 0 ? <EmptyState title="Inga kostnader registrerade" /> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-sand-100 text-sm"><thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-400"><tr><th className="px-5 py-3">Datum</th><th className="px-5 py-3">Typ</th><th className="px-5 py-3">Beskrivning</th><th className="px-5 py-3">Leverantör</th><th className="px-5 py-3 text-right">Belopp</th></tr></thead><tbody className="divide-y divide-sand-100">{data.costs.map((cost) => <tr key={text(cost, "id")}><td className="px-5 py-4 text-ink-500">{formatDate(cost.cost_date)}</td><td className="px-5 py-4 font-medium text-ink-700">{costLabels[text(cost, "cost_type")] || text(cost, "cost_type")}</td><td className="px-5 py-4 text-ink-600">{text(cost, "description") || "–"}</td><td className="px-5 py-4 text-ink-500">{text(cost, "supplier") || "–"}</td><td className="px-5 py-4 text-right font-semibold text-ink-900">{money.format(number(cost, "amount_ex_vat"))}</td></tr>)}</tbody></table></div>}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <LinkedPanel title="Kopplade arbetsordrar" rows={data.linkedWorkOrders} kind="work_order" />
        <LinkedPanel title="Kopplade projekt" rows={data.linkedProjects} kind="project" />
      </div>

      <OperationalDocumentsPanel entityType="technical_asset" entityId={componentId} title="Komponentdokument" description="Ladda upp manualer, driftinstruktioner, garantier, protokoll, ritningar och bilder direkt mot komponenten." />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-ink-800">{value}</dd></div>; }

function LinkedPanel({ title, rows, kind }: { title: string; rows: Row[]; kind: "work_order" | "project" }) {
  return <Panel title={title} bodyClassName="p-0">{rows.length === 0 ? <EmptyState title="Inga kopplingar" description="Kopplingar visas när livscykelhändelser registreras mot arbetsorder eller projekt." /> : <div className="divide-y divide-sand-100">{rows.map((row) => { const id = text(row, "id"); const name = kind === "work_order" ? text(row, "title") : text(row, "name"); return <Link key={id} href={kind === "work_order" ? `/dashboard/arbetsorder/${id}` : `/dashboard/projekt/${id}`} className="block p-5 transition hover:bg-sand-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{name}</p><p className="mt-1 text-xs text-ink-500">{text(row, "status") || "Status saknas"}</p></div><span className="text-xs font-semibold text-petroleum-700">Öppna</span></div></Link>; })}</div>}</Panel>;
}
