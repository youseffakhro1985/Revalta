"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers3,
  MapPin,
  Plus,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { SoftDeleteUndoBanner } from "@/components/dashboard/soft-delete-undo-banner";
import { readResponseJson } from "@/lib/fetch-json";

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

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type PropertyResponse = {
  properties?: Property[];
  pagination?: Pagination;
  permissions?: { canCreate?: boolean };
  error?: string;
};

type MaintenanceItem = {
  id: string;
  property_id?: string | null;
  property_name?: string;
  measure?: string;
  component?: string;
  planned_year?: number;
  status?: string;
};

type MaintenanceResponse = { items?: MaintenanceItem[] };

type Filters = {
  query: string;
  city: string;
  status: string;
  manager: string;
  sortAscending: boolean;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const activeMaintenanceStatuses = new Set(["planned", "approved", "in_progress"]);

function buildPropertiesUrl(filters: Filters, page: number, pageSize: number) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort: filters.sortAscending ? "name_asc" : "name_desc",
  });
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.city.trim()) params.set("city", filters.city.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.manager.trim()) params.set("manager", filters.manager.trim());
  return `/api/properties?${params.toString()}`;
}

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  });
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("all");
  const [manager, setManager] = useState("");
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, city, status, manager, pageSize, sortAscending]);

  const filters = useMemo<Filters>(() => ({
    query: debouncedQuery,
    city,
    status,
    manager,
    sortAscending,
  }), [debouncedQuery, city, status, manager, sortAscending]);

  useEffect(() => {
    let active = true;

    async function loadProperties() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(buildPropertiesUrl(filters, page, pageSize), { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }

        const body = await readResponseJson<PropertyResponse>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta fastigheter");
        if (!active) return;

        setProperties(body.properties || []);
        setCanCreate(Boolean(body.permissions?.canCreate));
        setPagination(body.pagination || {
          page,
          pageSize,
          total: body.properties?.length || 0,
          totalPages: 1,
          hasPrevious: false,
          hasNext: false,
        });
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Kunde inte kontakta servern");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProperties();
    return () => { active = false; };
  }, [filters, page, pageSize, router]);

  useEffect(() => {
    let active = true;
    async function loadMaintenance() {
      try {
        const response = await fetch("/api/maintenance", { cache: "no-store" });
        if (!response.ok) return;
        const body = await readResponseJson<MaintenanceResponse>(response);
        if (active) setMaintenanceItems(body.items || []);
      } catch {
        // Fastighetslistan ska fortsätta fungera även om underhållsöversikten är temporärt otillgänglig.
      }
    }
    void loadMaintenance();
    return () => { active = false; };
  }, []);

  const nextMaintenanceByProperty = useMemo(() => {
    const activeItems = maintenanceItems
      .filter((item) => item.property_id && activeMaintenanceStatuses.has(item.status || ""))
      .sort((a, b) => (a.planned_year ?? 9999) - (b.planned_year ?? 9999));
    const map = new Map<string, MaintenanceItem>();
    for (const item of activeItems) {
      if (item.property_id && !map.has(item.property_id)) map.set(item.property_id, item);
    }
    return map;
  }, [maintenanceItems]);

  const visibleTotals = useMemo(() => properties.reduce((totals, property) => ({
    units: totals.units + property._count.units,
    buildings: totals.buildings + property._count.buildings,
    tickets: totals.tickets + property._count.tickets,
  }), { units: 0, buildings: 0, tickets: 0 }), [properties]);

  const upcomingMaintenance = useMemo(() => maintenanceItems
    .filter((item) => item.property_id && activeMaintenanceStatuses.has(item.status || ""))
    .sort((a, b) => (a.planned_year ?? 9999) - (b.planned_year ?? 9999))
    .slice(0, 4), [maintenanceItems]);

  const hasFilters = Boolean(query.trim() || city.trim() || manager.trim() || status !== "all");

  function resetFilters() {
    setQuery("");
    setDebouncedQuery("");
    setCity("");
    setStatus("all");
    setManager("");
    setPage(1);
  }

  async function exportCsv() {
    if (!pagination.total || exporting) return;
    setExporting(true);
    setError("");

    try {
      const rows: Property[] = [];
      const exportPageSize = 100;
      const pages = Math.max(1, Math.ceil(pagination.total / exportPageSize));

      for (let exportPage = 1; exportPage <= pages; exportPage += 1) {
        const response = await fetch(buildPropertiesUrl(filters, exportPage, exportPageSize), { cache: "no-store" });
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const body = await readResponseJson<PropertyResponse>(response);
        if (!response.ok) throw new Error(body.error || "Kunde inte exportera fastigheter");
        rows.push(...(body.properties || []));
      }

      const header = ["Fastighet", "Adress", "Postnummer", "Ort", "Objektsnummer", "Objekt", "Status", "Ansvarig"];
      const csvRows = rows.map((property) => [
        property.name,
        property.address,
        property.postal_code || "",
        property.city,
        property.property_identifier || "",
        String(property._count.units),
        statusLabel(property.status),
        property.manager_name || "",
      ]);
      const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(";")).join("\n");
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `revalta-fastigheter-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Kunde inte exportera fastigheter");
    } finally {
      setExporting(false);
    }
  }

  const firstVisible = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastVisible = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Portfölj / Fastigheter</p>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 sm:text-[34px]">Fastigheter</h1>
          <p className="mt-1 text-sm text-ink-500">Sök, filtrera och följ upp fastighetsbeståndet utan att ladda hela portföljen i webbläsaren.</p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/fastigheter/ny" className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-petroleum-900 px-4 text-[12px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" /> Ny fastighet
          </Link>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Nyckeltal för fastigheter">
        <KpiCard icon={Building2} label={hasFilters ? "Matchande fastigheter" : "Fastigheter"} value={pagination.total.toLocaleString("sv-SE")} helper={hasFilters ? "Efter aktuell sökning och filter" : "Tenant-avgränsat aktivt bestånd"} />
        <KpiCard icon={Layers3} label="Objekt på sidan" value={visibleTotals.units.toLocaleString("sv-SE")} helper={`Summerat över ${properties.length} visade fastigheter`} />
        <KpiCard icon={Wrench} label="Aktiva ärenden på sidan" value={visibleTotals.tickets.toLocaleString("sv-SE")} helper="Öppna poster kopplade till de visade fastigheterna" />
        <KpiCard icon={MapPin} label="Byggnader på sidan" value={visibleTotals.buildings.toLocaleString("sv-SE")} helper="Registrerade byggnader i aktuell sida" />
      </section>

      {error ? <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700" role="status">{error}</div> : null}
      <SoftDeleteUndoBanner entityLabel="Fastigheten" restoreApiPath={(id) => `/api/properties/${id}/restore`} detailPath={(id) => `/dashboard/fastigheter/${id}`} />

      <section className="rounded-2xl border border-sand-200 bg-white p-3 shadow-premium-sm sm:p-4">
        <div className="grid gap-2 xl:grid-cols-[minmax(260px,1.5fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Sök fastighet</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} placeholder="Sök namn, adress, ort eller objektsnummer" className="h-10 w-full rounded-xl border border-sand-200 bg-[#FCFBF8] pl-9 pr-3 text-[12px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100" />
          </label>
          <label>
            <span className="sr-only">Filtrera ort</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={160} placeholder="Ort" className="h-10 w-full rounded-xl border border-sand-200 bg-white px-3 text-[11px] text-ink-700 outline-none focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100" />
          </label>
          <label>
            <span className="sr-only">Filtrera status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-xl border border-sand-200 bg-white px-3 text-[11px] text-ink-700 outline-none focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100">
              <option value="all">Alla statusar</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
              <option value="sold">Såld</option>
              <option value="archived">Arkiverad</option>
              <option value="watch">Bevakning</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrera ansvarig</span>
            <input value={manager} onChange={(event) => setManager(event.target.value)} maxLength={160} placeholder="Ansvarig" className="h-10 w-full rounded-xl border border-sand-200 bg-white px-3 text-[11px] text-ink-700 outline-none focus:border-petroleum-300 focus:ring-2 focus:ring-petroleum-100" />
          </label>
          <button type="button" onClick={resetFilters} disabled={!hasFilters} className="h-10 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-600 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-45">Rensa</button>
          <button type="button" onClick={() => void exportCsv()} disabled={!pagination.total || exporting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-petroleum-800 transition hover:bg-petroleum-50 disabled:cursor-not-allowed disabled:opacity-45">
            <Download className="h-3.5 w-3.5" /> {exporting ? "Exporterar…" : "Exportera"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex items-center justify-between gap-4 border-b border-sand-100 px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold text-ink-950">Fastigheter ({pagination.total.toLocaleString("sv-SE")})</h2>
              <p className="mt-0.5 text-[11px] text-ink-500">Resultatet hämtas sida för sida med tenant-säker serversökning.</p>
            </div>
            <button type="button" onClick={() => setSortAscending((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-650 transition hover:bg-sand-50" aria-label={sortAscending ? "Sortera fastighetsnamn fallande" : "Sortera fastighetsnamn stigande"}>
              <ArrowDownUp className="h-3.5 w-3.5" /> {sortAscending ? "A–Ö" : "Ö–A"}
            </button>
          </div>

          {loading ? (
            <div className="space-y-2 p-5">{Array.from({ length: Math.min(pageSize, 6) }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : properties.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Building2 className="mx-auto h-8 w-8 text-sand-400" />
              <h3 className="mt-3 text-sm font-semibold text-ink-850">Inga fastigheter matchar</h3>
              <p className="mt-1 text-xs text-ink-500">Justera sökning eller filter och försök igen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left">
                <thead>
                  <tr className="border-b border-sand-100 bg-[#FCFBF8] text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                    <th className="px-5 py-3">Fastighet</th>
                    <th className="px-3 py-3">Adress</th>
                    <th className="px-3 py-3">Ort</th>
                    <th className="px-3 py-3">Objekt</th>
                    <th className="px-3 py-3">Ärenden</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Nästa åtgärd</th>
                    <th className="px-3 py-3">Ansvarig</th>
                    <th className="px-5 py-3 text-right">Öppna</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {properties.map((property) => {
                    const nextMaintenance = nextMaintenanceByProperty.get(property.id);
                    return (
                      <tr
                        key={property.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`Öppna ${property.name}`}
                        onClick={() => router.push(`/dashboard/fastigheter/${property.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/dashboard/fastigheter/${property.id}`);
                          }
                        }}
                        className="group cursor-pointer outline-none transition hover:bg-sand-50/70 focus-visible:bg-petroleum-50/60"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sand-200 bg-sand-50 text-petroleum-700"><Building2 className="h-4 w-4" /></span>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-ink-900">{property.name}</p>
                              {property.property_identifier ? <p className="mt-0.5 truncate text-[10px] text-ink-400">{property.property_identifier}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[210px] px-3 py-3.5 text-[11px] text-ink-600"><span className="block truncate">{property.address}{property.postal_code ? `, ${property.postal_code}` : ""}</span></td>
                        <td className="px-3 py-3.5 text-[11px] text-ink-600">{property.city}</td>
                        <td className="px-3 py-3.5 text-[11px] font-medium text-ink-700">{property._count.units}</td>
                        <td className="px-3 py-3.5 text-[11px] font-medium text-ink-700">{property._count.tickets}</td>
                        <td className="px-3 py-3.5"><StatusBadge status={property.status} /></td>
                        <td className="max-w-[190px] px-3 py-3.5 text-[11px] text-ink-600">
                          {nextMaintenance ? (
                            <>
                              <span className="block truncate font-medium text-ink-700">{nextMaintenance.measure || nextMaintenance.component || "Planerad åtgärd"}</span>
                              <span className="mt-0.5 block text-[10px] text-ink-400">{nextMaintenance.planned_year || "Planerad"}</span>
                            </>
                          ) : <span className="text-ink-400">Ingen planerad åtgärd</span>}
                        </td>
                        <td className="px-3 py-3.5 text-[11px] text-ink-600">{property.manager_name || "Ej tilldelad"}</td>
                        <td className="px-5 py-3.5 text-right"><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-petroleum-700">Visa <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-sand-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-ink-500">Visar {firstVisible}–{lastVisible} av {pagination.total.toLocaleString("sv-SE")} fastigheter</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!pagination.hasPrevious || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Föregående sida" className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-200 bg-white text-ink-500 transition hover:bg-sand-50 disabled:opacity-35"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-petroleum-900 px-2 text-[11px] font-semibold text-white">{pagination.page}</span>
              <span className="text-[10px] text-ink-400">av {pagination.totalPages}</span>
              <button type="button" disabled={!pagination.hasNext || loading} onClick={() => setPage((value) => value + 1)} aria-label="Nästa sida" className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-200 bg-white text-ink-500 transition hover:bg-sand-50 disabled:opacity-35"><ChevronRight className="h-3.5 w-3.5" /></button>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Antal fastigheter per sida" className="h-8 rounded-lg border border-sand-200 bg-white px-2 text-[10px] font-medium text-ink-600 outline-none focus:ring-2 focus:ring-petroleum-100">
                {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>Visa {size}</option>)}
              </select>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <SidePanel title="Kommande underhåll" icon={Wrench}>
            {upcomingMaintenance.length ? (
              <div className="space-y-1.5">
                {upcomingMaintenance.map((item) => (
                  <Link key={item.id} href={item.property_id ? `/dashboard/fastigheter/${item.property_id}` : "/dashboard/drift"} className="group flex items-start gap-2.5 rounded-lg px-1 py-2 transition hover:bg-sand-50">
                    <span className="mt-0.5 rounded-md border border-sand-200 bg-sand-50 px-1.5 py-1 text-[9px] font-semibold text-ink-500">{item.planned_year || "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink-750">{item.measure || item.component || "Planerad åtgärd"}</span>
                      <span className="mt-0.5 block truncate text-[9px] text-ink-400">{item.property_name || "Fastighet"}</span>
                    </span>
                    <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-ink-300 group-hover:text-petroleum-700" />
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-400">Inga kommande åtgärder registrerade.</p>}
          </SidePanel>

          <SidePanel title="Skalbar listning" icon={Layers3}>
            <div className="space-y-2 text-[11px] leading-5 text-ink-500">
              <p>Listan laddar högst {pageSize} fastigheter åt gången. Sökning och filter körs på servern inom er organisation.</p>
              <p>CSV-export hämtar resultatet i bounded batcher om 100 poster utan att öppna en obegränsad databasfråga.</p>
            </div>
          </SidePanel>
        </aside>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string; helper: string }) {
  return (
    <article className="rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</p>
          <p className="mt-2 font-display text-[27px] font-semibold tracking-[-0.04em] text-ink-950">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sand-200 bg-sand-50 text-petroleum-700"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-ink-400">{helper}</p>
    </article>
  );
}

function SidePanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-sand-200 bg-white p-4 shadow-premium-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-3.5 w-3.5" /></span>
        <h2 className="text-[12px] font-semibold text-ink-850">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  const attention = status === "watch";
  const classes = active
    ? "border-success-200 bg-success-50 text-success-700"
    : attention
      ? "border-warning-200 bg-warning-50 text-warning-700"
      : "border-sand-200 bg-sand-50 text-ink-500";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${classes}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Aktiv",
    inactive: "Inaktiv",
    sold: "Såld",
    archived: "Arkiverad",
    watch: "Bevakning",
  };
  return labels[status] || status;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
