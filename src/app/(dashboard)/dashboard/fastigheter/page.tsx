"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  DoorOpen,
  KeyRound,
  Plus,
  Search,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { readResponseJson } from "@/lib/fetch-json";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";

type Property = {
  id: string;
  name: string;
  address: string;
  postal_code: string | null;
  city: string;
  property_identifier: string | null;
  property_type: string;
  status: string;
  manager_name: string | null;
  created_at: string;
  updated_at: string;
  _count: { tickets: number; buildings: number; units: number };
};

type PropertyResponse = {
  properties?: Property[];
  permissions?: { canCreate?: boolean };
  error?: string;
};

type LeasingProperty = {
  id: string;
  units: Array<{ id: string }>;
};

type OccupyingLease = {
  property_id: string;
  unit_id: string;
};

type LeasingResponse = {
  properties?: LeasingProperty[];
  occupyingLeases?: OccupyingLease[];
};

type MaintenanceItem = {
  id: string;
  property_id?: string | null;
  property_name?: string;
  measure?: string;
  component?: string;
  planned_year?: number;
  status?: string;
  updated_at?: string;
};

type MaintenanceResponse = {
  items?: MaintenanceItem[];
};

type ColumnKey = "city" | "units" | "occupancy" | "status" | "nextAction" | "manager";

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const activeMaintenanceStatuses = new Set(["planned", "approved", "in_progress"]);
const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [leasingProperties, setLeasingProperties] = useState<LeasingProperty[]>([]);
  const [occupyingLeases, setOccupyingLeases] = useState<OccupyingLease[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [leasingAvailable, setLeasingAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [status, setStatus] = useState("all");
  const [manager, setManager] = useState("all");
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>({
    city: true,
    units: true,
    occupancy: true,
    status: true,
    nextAction: true,
    manager: true,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [propertyResponse, leaseResponse, maintenanceResponse] = await Promise.all([
          fetch("/api/properties", { cache: "no-store" }),
          fetch("/api/leases?page=1&pageSize=100", { cache: "no-store" }),
          fetch("/api/maintenance", { cache: "no-store" }),
        ]);

        if (propertyResponse.status === 401) {
          router.push("/login");
          return;
        }

        const propertyBody = await readResponseJson<PropertyResponse>(propertyResponse);
        if (!propertyResponse.ok) throw new Error(propertyBody.error || "Kunde inte hämta fastigheter");
        if (!active) return;

        setProperties(propertyBody.properties || []);
        setCanCreate(Boolean(propertyBody.permissions?.canCreate));

        if (leaseResponse.ok) {
          const leaseBody = await readResponseJson<LeasingResponse>(leaseResponse);
          if (active) {
            setLeasingProperties(leaseBody.properties || []);
            setOccupyingLeases(leaseBody.occupyingLeases || []);
            setLeasingAvailable(true);
          }
        }

        if (maintenanceResponse.ok) {
          const maintenanceBody = await readResponseJson<MaintenanceResponse>(maintenanceResponse);
          if (active) setMaintenanceItems(maintenanceBody.items || []);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Kunde inte kontakta servern");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [router]);

  const occupancyByProperty = useMemo(() => {
    const occupiedUnitIds = new Set(occupyingLeases.map((lease) => lease.unit_id));
    return new Map(leasingProperties.map((property) => {
      const total = property.units.length;
      const occupied = property.units.reduce((sum, unit) => sum + (occupiedUnitIds.has(unit.id) ? 1 : 0), 0);
      return [property.id, { total, occupied, percent: total ? Math.round((occupied / total) * 1000) / 10 : null }] as const;
    }));
  }, [leasingProperties, occupyingLeases]);

  const summary = useMemo(() => {
    const occupiedUnitIds = new Set(occupyingLeases.map((lease) => lease.unit_id));
    const leasableUnits = leasingProperties.reduce((sum, property) => sum + property.units.length, 0);
    const occupiedUnits = leasingProperties.reduce(
      (sum, property) => sum + property.units.filter((unit) => occupiedUnitIds.has(unit.id)).length,
      0,
    );
    const occupancy = leasableUnits ? Math.round((occupiedUnits / leasableUnits) * 1000) / 10 : null;
    const vacantUnits = leasableUnits ? Math.max(0, leasableUnits - occupiedUnits) : 0;
    const currentYear = new Date().getFullYear();
    const plannedMaintenance = maintenanceItems.filter((item) =>
      activeMaintenanceStatuses.has(item.status || "")
      && (item.planned_year ?? currentYear) <= currentYear + 1,
    ).length;

    return { occupancy, vacantUnits, plannedMaintenance };
  }, [leasingProperties, occupyingLeases, maintenanceItems]);

  const nextMaintenanceByProperty = useMemo(() => {
    const active = maintenanceItems
      .filter((item) => item.property_id && activeMaintenanceStatuses.has(item.status || ""))
      .sort((a, b) => (a.planned_year ?? 9999) - (b.planned_year ?? 9999));
    const map = new Map<string, MaintenanceItem>();
    for (const item of active) {
      if (item.property_id && !map.has(item.property_id)) map.set(item.property_id, item);
    }
    return map;
  }, [maintenanceItems]);

  const cityOptions = useMemo(() => [...new Set(properties.map((property) => property.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")), [properties]);
  const statusOptions = useMemo(() => [...new Set(properties.map((property) => property.status).filter(Boolean))].sort(), [properties]);
  const managerOptions = useMemo(() => [...new Set(properties.map((property) => property.manager_name).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "sv")), [properties]);

  const filteredProperties = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sv-SE");
    return properties
      .filter((property) => {
        const matchesQuery = !normalizedQuery || [property.name, property.address, property.city, property.property_identifier || ""]
          .some((value) => value.toLocaleLowerCase("sv-SE").includes(normalizedQuery));
        const matchesCity = city === "all" || property.city === city;
        const matchesStatus = status === "all" || property.status === status;
        const matchesManager = manager === "all" || property.manager_name === manager;
        return matchesQuery && matchesCity && matchesStatus && matchesManager;
      })
      .sort((a, b) => sortAscending ? a.name.localeCompare(b.name, "sv") : b.name.localeCompare(a.name, "sv"));
  }, [properties, query, city, status, manager, sortAscending]);

  useEffect(() => { setPage(1); }, [query, city, status, manager, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredProperties.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageProperties = filteredProperties.slice((safePage - 1) * pageSize, safePage * pageSize);

  function resetFilters() {
    setQuery("");
    setCity("all");
    setStatus("all");
    setManager("all");
  }

  function exportCsv() {
    const header = ["Fastighet", "Adress", "Ort", "Objekt", "Uthyrningsgrad", "Status", "Ansvarig"];
    const rows = filteredProperties.map((property) => {
      const occupancy = occupancyByProperty.get(property.id)?.percent;
      return [
        property.name,
        [property.address, property.postal_code].filter(Boolean).join(", "),
        property.city,
        String(property._count.units),
        occupancy === null || occupancy === undefined ? "" : `${occupancy.toLocaleString("sv-SE")} %`,
        statusLabel(property.status),
        property.manager_name || "",
      ];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `revalta-fastigheter-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const upcomingMaintenance = useMemo(() => maintenanceItems
    .filter((item) => item.property_id && activeMaintenanceStatuses.has(item.status || ""))
    .sort((a, b) => (a.planned_year ?? 9999) - (b.planned_year ?? 9999))
    .slice(0, 4), [maintenanceItems]);

  const recentlyUpdated = useMemo(() => [...properties]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3), [properties]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Portfölj / Fastigheter</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Fastigheter</h1>
          <p className="mt-1 text-sm text-ink-500">Hantera, analysera och följ upp fastighetsbeståndet.</p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/fastigheter/ny" className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[12px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2 lg:hidden">
            <Plus className="h-4 w-4" /> Ny fastighet
          </Link>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal för fastigheter">
        <KpiCard icon={Building2} label="Antal fastigheter" value={properties.length.toLocaleString("sv-SE")} helper={`${properties.reduce((sum, property) => sum + property._count.buildings, 0)} byggnader registrerade`} href="/dashboard/fastigheter" linkLabel="Visa alla fastigheter" />
        <KpiCard icon={DoorOpen} label="Uthyrningsgrad" value={leasingAvailable && summary.occupancy !== null ? `${summary.occupancy.toLocaleString("sv-SE")} %` : "—"} helper={leasingAvailable ? "Beräknad från aktiva och reserverade avtal" : "Uthyrningsdata saknas för din roll"} href="/dashboard/uthyrning" linkLabel="Visa uthyrningsgrad" />
        <KpiCard icon={KeyRound} label="Lediga objekt" value={leasingAvailable ? summary.vacantUnits.toLocaleString("sv-SE") : "—"} helper={leasingAvailable ? "Aktiva uthyrningsbara objekt utan pågående avtal" : "Uthyrningsdata saknas för din roll"} href="/dashboard/uthyrning" linkLabel="Visa lediga objekt" />
        <KpiCard icon={Wrench} label="Planerat underhåll" value={summary.plannedMaintenance.toLocaleString("sv-SE")} helper="Planerade och pågående poster till och med nästa år" href="/dashboard/drift" linkLabel="Visa drift & underhåll" />
      </section>

      {error ? <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="status">{error}</div> : null}
      <SoftDeleteUndoBanner entityLabel="Fastigheten" restoreApiPath={(id) => `/api/properties/${id}/restore`} detailPath={(id) => `/dashboard/fastigheter/${id}`} />

      <section className="rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm sm:p-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(140px,0.7fr))_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Sök fastighet</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök namn, adress eller objektsnummer" className="h-10 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] pl-9 pr-3 text-[12px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100" />
          </label>
          <FilterSelect label="Ort" value={city} onChange={setCity} options={cityOptions.map((value) => ({ value, label: value }))} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={statusOptions.map((value) => ({ value, label: statusLabel(value) }))} />
          <FilterSelect label="Ansvarig" value={manager} onChange={setManager} options={managerOptions.map((value) => ({ value, label: value }))} />
          <button type="button" onClick={resetFilters} className="h-10 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-600 transition hover:bg-sand-50">Rensa filter</button>
          <button type="button" onClick={exportCsv} disabled={!filteredProperties.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-petroleum-800 transition hover:bg-petroleum-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Exportera
          </button>
        </div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex items-center justify-between gap-4 border-b border-sand-100 px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold text-ink-950">Fastigheter ({filteredProperties.length})</h2>
              <p className="mt-0.5 text-[11px] text-ink-500">Öppna en rad för fastighetskort, objekt, drift och ärenden.</p>
            </div>
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-650 transition hover:bg-sand-50 [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Kolumner
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-sand-200 bg-white p-2 shadow-premium-lg">
                {(Object.keys(columns) as ColumnKey[]).map((key) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] text-ink-650 hover:bg-sand-50">
                    <input type="checkbox" checked={columns[key]} onChange={() => setColumns((current) => ({ ...current, [key]: !current[key] }))} className="h-3.5 w-3.5 accent-petroleum-700" />
                    {columnLabel(key)}
                  </label>
                ))}
              </div>
            </details>
          </div>

          {loading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : pageProperties.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Building2 className="mx-auto h-8 w-8 text-sand-400" />
              <h3 className="mt-3 text-sm font-semibold text-ink-850">Inga fastigheter matchar filtret</h3>
              <p className="mt-1 text-xs text-ink-500">Justera sökning eller filter och försök igen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-sand-100 bg-[#FCFBF8] text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                    <th className="px-5 py-3"><button type="button" onClick={() => setSortAscending((value) => !value)} className="inline-flex items-center gap-1.5 hover:text-petroleum-700">Fastighet <ArrowDownUp className="h-3 w-3" /></button></th>
                    <th className="px-3 py-3">Adress</th>
                    {columns.city ? <th className="px-3 py-3">Ort</th> : null}
                    {columns.units ? <th className="px-3 py-3">Objekt</th> : null}
                    {columns.occupancy ? <th className="px-3 py-3">Uthyrningsgrad</th> : null}
                    {columns.status ? <th className="px-3 py-3">Status</th> : null}
                    {columns.nextAction ? <th className="px-3 py-3">Nästa åtgärd</th> : null}
                    {columns.manager ? <th className="px-3 py-3">Ansvarig</th> : null}
                    <th className="px-5 py-3 text-right">Öppna</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {pageProperties.map((property) => {
                    const occupancy = occupancyByProperty.get(property.id)?.percent ?? null;
                    const nextMaintenance = nextMaintenanceByProperty.get(property.id);
                    return (
                      <tr key={property.id} tabIndex={0} role="link" aria-label={`Öppna ${property.name}`} onClick={() => router.push(`/dashboard/fastigheter/${property.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/dashboard/fastigheter/${property.id}`); }} className="group cursor-pointer outline-none transition hover:bg-sand-50/70 focus-visible:bg-petroleum-50/60">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sand-200 bg-sand-50 text-petroleum-700"><Building2 className="h-4 w-4" /></span>
                            <div className="min-w-0"><p className="truncate text-[12px] font-semibold text-ink-900">{property.name}</p>{property.property_identifier ? <p className="mt-0.5 truncate text-[10px] text-ink-400">{property.property_identifier}</p> : null}</div>
                          </div>
                        </td>
                        <td className="max-w-[210px] px-3 py-3.5 text-[11px] text-ink-600"><span className="block truncate">{property.address}{property.postal_code ? `, ${property.postal_code}` : ""}</span></td>
                        {columns.city ? <td className="px-3 py-3.5 text-[11px] text-ink-600">{property.city}</td> : null}
                        {columns.units ? <td className="px-3 py-3.5 text-[11px] font-medium text-ink-700">{property._count.units}</td> : null}
                        {columns.occupancy ? <td className="px-3 py-3.5"><OccupancyBar value={occupancy} available={leasingAvailable} /></td> : null}
                        {columns.status ? <td className="px-3 py-3.5"><StatusBadge status={property.status} /></td> : null}
                        {columns.nextAction ? <td className="max-w-[190px] px-3 py-3.5 text-[11px] text-ink-600">{nextMaintenance ? <><span className="block truncate font-medium text-ink-700">{nextMaintenance.measure || nextMaintenance.component || "Planerad åtgärd"}</span><span className="mt-0.5 block text-[10px] text-ink-400">{nextMaintenance.planned_year || "Planerad"}</span></> : property._count.tickets ? <><span className="font-medium text-ink-700">{property._count.tickets} aktiva ärenden</span><span className="mt-0.5 block text-[10px] text-ink-400">Kräver uppföljning</span></> : <span className="text-ink-400">Ingen åtgärd</span>}</td> : null}
                        {columns.manager ? <td className="px-3 py-3.5 text-[11px] text-ink-600">{property.manager_name || "Ej tilldelad"}</td> : null}
                        <td className="px-5 py-3.5 text-right"><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-petroleum-700">Visa <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-sand-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-ink-500">Visar {filteredProperties.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filteredProperties.length)} av {filteredProperties.length} fastigheter</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-200 bg-white text-ink-500 disabled:opacity-35"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-petroleum-900 px-2 text-[11px] font-semibold text-white">{safePage}</span>
              <span className="text-[10px] text-ink-400">av {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-200 bg-white text-ink-500 disabled:opacity-35"><ChevronRight className="h-3.5 w-3.5" /></button>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-lg border border-sand-200 bg-white px-2 text-[10px] font-medium text-ink-600 outline-none focus:ring-2 focus:ring-petroleum-100">
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>Visa {size} per sida</option>)}
              </select>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <SidePanel title="Kommande underhåll" icon={CalendarDays}>
            {upcomingMaintenance.length ? <div className="space-y-1.5">{upcomingMaintenance.map((item) => (
              <Link key={item.id} href={item.property_id ? `/dashboard/fastigheter/${item.property_id}` : "/dashboard/drift"} className="group flex items-start gap-2.5 rounded-lg px-1 py-2 transition hover:bg-sand-50">
                <span className="mt-0.5 rounded-md border border-sand-200 bg-sand-50 px-1.5 py-1 text-[9px] font-semibold text-ink-500">{item.planned_year || "—"}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-ink-750">{item.measure || item.component || "Planerad åtgärd"}</span><span className="mt-0.5 block truncate text-[9px] text-ink-400">{item.property_name || "Fastighet"}</span></span>
                <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-ink-300 group-hover:text-petroleum-700" />
              </Link>
            ))}</div> : <p className="py-3 text-[11px] text-ink-500">Inga planerade underhållsposter hittades.</p>}
            <Link href="/dashboard/drift" className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700">Visa drift & underhåll <ArrowRight className="h-3 w-3" /></Link>
          </SidePanel>

          <SidePanel title="Snabbåtgärder" icon={Wrench}>
            <div className="space-y-1">
              {canCreate ? <QuickLink href="/dashboard/fastigheter/ny" label="Lägg till fastighet" icon={Building2} /> : null}
              <QuickLink href="/dashboard/arbetsorder/ny" label="Skapa arbetsorder" icon={Wrench} />
              <QuickLink href="/dashboard/uthyrning" label="Hantera uthyrning" icon={KeyRound} />
              <QuickLink href="/dashboard/drift" label="Drift & underhåll" icon={CalendarDays} />
            </div>
          </SidePanel>

          <SidePanel title="Senast uppdaterade" icon={ArrowDownUp}>
            {recentlyUpdated.length ? <div className="space-y-1">{recentlyUpdated.map((property) => (
              <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="flex items-center gap-2.5 rounded-lg px-1 py-2 transition hover:bg-sand-50">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand-50 text-petroleum-700"><Building2 className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-ink-750">{property.name}</span><span className="mt-0.5 block truncate text-[9px] text-ink-400">{dateTimeFormatter.format(new Date(property.updated_at))}{property.manager_name ? ` · ${property.manager_name}` : ""}</span></span>
              </Link>
            ))}</div> : <p className="py-3 text-[11px] text-ink-500">Inga fastigheter registrerade ännu.</p>}
          </SidePanel>
        </aside>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, helper, href, linkLabel }: { icon: LucideIcon; label: string; value: string; helper: string; href: string; linkLabel: string }) {
  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-50 text-petroleum-800"><Icon className="h-[18px] w-[18px]" strokeWidth={1.7} /></span>
        <div className="min-w-0"><p className="text-[10px] font-semibold text-ink-650">{label}</p><p className="mt-1 font-display text-[26px] font-semibold tracking-[-0.04em] text-ink-950">{value}</p><p className="mt-1 min-h-8 text-[10px] leading-4 text-ink-450">{helper}</p></div>
      </div>
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-petroleum-700 hover:text-petroleum-900">{linkLabel} <ArrowRight className="h-3 w-3" /></Link>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-10 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-medium text-ink-650 outline-none transition focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100">
      <option value="all">{label}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function OccupancyBar({ value, available }: { value: number | null; available: boolean }) {
  if (!available || value === null) return <span className="text-[10px] text-ink-400">—</span>;
  const barClass = value < 80 ? "bg-warning-500" : "bg-petroleum-700";
  return <div className="w-24"><div className="flex items-center justify-between text-[10px]"><span className="font-medium text-ink-700">{value.toLocaleString("sv-SE")} %</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand-100"><div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${active ? "border-petroleum-100 bg-petroleum-50 text-petroleum-700" : "border-warning-200 bg-warning-50 text-warning-700"}`}>{statusLabel(status)}</span>;
}

function SidePanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm"><div className="mb-2 flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-petroleum-700" /><h3 className="text-[11px] font-semibold text-ink-850">{title}</h3></div>{children}</section>;
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return <Link href={href} className="group flex items-center gap-2.5 rounded-lg px-1 py-2 text-[11px] text-ink-650 transition hover:bg-sand-50 hover:text-petroleum-800"><Icon className="h-3.5 w-3.5 text-ink-400 group-hover:text-petroleum-700" /><span>{label}</span><ChevronRight className="ml-auto h-3 w-3 text-ink-300" /></Link>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { active: "Aktiv", inactive: "Inaktiv", sold: "Såld", archived: "Arkiverad", watch: "Bevakning" };
  return labels[status] || status;
}

function columnLabel(key: ColumnKey) {
  const labels: Record<ColumnKey, string> = { city: "Ort", units: "Objekt", occupancy: "Uthyrningsgrad", status: "Status", nextAction: "Nästa åtgärd", manager: "Ansvarig" };
  return labels[key];
}

function csvCell(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
