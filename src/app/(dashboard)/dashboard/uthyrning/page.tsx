"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardSignature,
  DoorOpen,
  FileSignature,
  MapPin,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Unit = { id: string; designation: string; unit_type: string; floor?: string | null; area?: number | null; rooms?: number | null; status: string };
type Property = { id: string; name: string; address: string; city: string; units: Unit[] };
type Holder = { id: string; party_type: string; name: string; contact_name?: string | null; email?: string | null; phone?: string | null; organization_number?: string | null };
type Lease = {
  id: string;
  property_id: string;
  unit_id: string;
  lease_holder_id: string;
  lease_number: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  notice_date?: string | null;
  monthly_rent: number;
  annual_rent: number;
  deposit: number;
  annual_index_percent: number;
  payment_terms_days: number;
  note?: string | null;
  updated_at: string;
  property: { id: string; name: string; address: string; city: string };
  unit: Unit;
  lease_holder: Holder;
};
type LeaseSummary = { activeHolders: number; annualRent: number };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

type LeaseForm = {
  id: string;
  updatedAt: string;
  propertyId: string;
  unitId: string;
  holderId: string;
  holderType: string;
  holderName: string;
  holderContactName: string;
  holderEmail: string;
  holderPhone: string;
  holderOrganizationNumber: string;
  leaseNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  noticeDate: string;
  monthlyRent: string;
  deposit: string;
  annualIndexPercent: string;
  paymentTermsDays: string;
  note: string;
};

const emptyForm: LeaseForm = {
  id: "", updatedAt: "", propertyId: "", unitId: "", holderId: "", holderType: "individual", holderName: "", holderContactName: "", holderEmail: "", holderPhone: "", holderOrganizationNumber: "", leaseNumber: "", status: "draft", startDate: "", endDate: "", noticeDate: "", monthlyRent: "", deposit: "", annualIndexPercent: "0", paymentTermsDays: "30", note: "",
};

const money = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", notation: "compact", maximumFractionDigits: 1 });
const statusLabels: Record<string, string> = { draft: "Utkast", reserved: "Reserverad", active: "Aktivt", notice: "Uppsagt", ended: "Avslutat", cancelled: "Makulerat" };
const typeLabels: Record<string, string> = { apartment: "Lägenhet", commercial: "Lokal", parking: "Parkering", garage: "Garage", storage: "Förråd", other: "Övrigt" };
const holderTypeLabels: Record<string, string> = { individual: "Privatperson", company: "Företag", association: "Förening" };
const occupyingStatuses = new Set(["reserved", "active", "notice"]);
const softDeletableLeaseStatuses = new Set(["draft", "cancelled", "ended"]);

function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{children}</span>;
}

function leaseStatusClass(status: string) {
  if (status === "active" || status === "reserved") return "border-petroleum-100 bg-petroleum-50 text-petroleum-800";
  if (status === "notice") return "border-amber-100 bg-amber-50 text-amber-800";
  if (status === "ended") return "border-sand-200 bg-sand-50 text-ink-500";
  if (status === "cancelled") return "border-red-100 bg-red-50 text-red-700";
  return "border-sand-200 bg-white text-ink-600";
}

export default function LeasingPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [occupyingLeases, setOccupyingLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingLease, setDeletingLease] = useState(false);
  const [deletingHolder, setDeletingHolder] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [undoLeaseId, setUndoLeaseId] = useState<string | null>(null);
  const [undoHolderId, setUndoHolderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LeaseForm>(emptyForm);
  const [leaseSummary, setLeaseSummary] = useState<LeaseSummary>({ activeHolders: 0, annualRent: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leases?page=${requestedPage}&pageSize=50`, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta uthyrningen");
      setLeases(data.leases || []);
      setOccupyingLeases(data.occupyingLeases || []);
      setProperties(data.properties || []);
      setHolders(data.holders || []);
      setCanManage(Boolean(data.permissions?.canManage));
      setLeaseSummary(data.summary || { activeHolders: 0, annualRent: 0 });
      setPagination(data.pagination || { page: requestedPage, pageSize: 50, total: 0, totalPages: 1 });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta uthyrningen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  const currentLeaseByUnit = useMemo(() => {
    const map = new Map<string, Lease>();
    for (const lease of occupyingLeases) if (occupyingStatuses.has(lease.status) && !map.has(lease.unit_id)) map.set(lease.unit_id, lease);
    return map;
  }, [occupyingLeases]);

  const unitRows = useMemo(() => properties.flatMap((property) => property.units.map((unit) => ({ property, unit, lease: currentLeaseByUnit.get(unit.id) || null }))), [properties, currentLeaseByUnit]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return unitRows.filter(({ property, unit, lease }) => {
      if (propertyFilter && property.id !== propertyFilter) return false;
      if (occupancyFilter === "vacant" && lease) return false;
      if (occupancyFilter === "occupied" && !lease) return false;
      if (occupancyFilter === "notice" && lease?.status !== "notice") return false;
      if (!normalized) return true;
      return `${property.name} ${property.address} ${property.city} ${unit.designation} ${lease?.lease_holder.name || ""} ${lease?.lease_number || ""}`.toLowerCase().includes(normalized);
    });
  }, [unitRows, propertyFilter, occupancyFilter, query]);

  const summary = useMemo(() => {
    const occupied = unitRows.filter((row) => row.lease);
    const vacant = unitRows.length - occupied.length;
    return {
      objects: unitRows.length,
      occupied: occupied.length,
      vacant,
      holders: leaseSummary.activeHolders,
      annualRent: leaseSummary.annualRent,
      occupancy: unitRows.length ? Math.round((occupied.length / unitRows.length) * 1000) / 10 : 0,
      notice: occupied.filter((row) => row.lease?.status === "notice").length,
    };
  }, [leaseSummary, unitRows]);

  const propertyOccupancy = useMemo(() => properties.map((property) => {
    const rows = unitRows.filter((row) => row.property.id === property.id);
    const occupied = rows.filter((row) => row.lease).length;
    const vacant = rows.length - occupied;
    const occupancy = rows.length ? Math.round((occupied / rows.length) * 1000) / 10 : 0;
    return { id: property.id, name: property.name, city: property.city, total: rows.length, occupied, vacant, occupancy };
  }).sort((a, b) => b.vacant - a.vacant || a.name.localeCompare(b.name, "sv")), [properties, unitRows]);

  const formUnits = properties.find((property) => property.id === form.propertyId)?.units || [];
  const hasFilters = Boolean(query || propertyFilter || occupancyFilter !== "all");

  function openNewForm() {
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setShowForm(true);
    window.setTimeout(() => document.getElementById("lease-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function closeForm() {
    setForm(emptyForm);
    setError("");
    setShowForm(false);
  }

  function beginLeaseForUnit(propertyId: string, unitId: string) {
    setForm({ ...emptyForm, propertyId, unitId });
    setError("");
    setSuccess("");
    setShowForm(true);
    window.setTimeout(() => document.getElementById("lease-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function clearFilters() {
    setQuery("");
    setPropertyFilter("");
    setOccupancyFilter("all");
  }

  function selectHolder(holderId: string) {
    const holder = holders.find((item) => item.id === holderId);
    setForm((current) => ({
      ...current,
      holderId,
      holderType: holder?.party_type || "individual",
      holderName: holder?.name || "",
      holderContactName: holder?.contact_name || "",
      holderEmail: holder?.email || "",
      holderPhone: holder?.phone || "",
      holderOrganizationNumber: holder?.organization_number || "",
    }));
  }

  function editLease(lease: Lease) {
    setForm({
      id: lease.id,
      updatedAt: lease.updated_at,
      propertyId: lease.property_id,
      unitId: lease.unit_id,
      holderId: lease.lease_holder_id,
      holderType: lease.lease_holder.party_type,
      holderName: lease.lease_holder.name,
      holderContactName: lease.lease_holder.contact_name || "",
      holderEmail: lease.lease_holder.email || "",
      holderPhone: lease.lease_holder.phone || "",
      holderOrganizationNumber: lease.lease_holder.organization_number || "",
      leaseNumber: lease.lease_number,
      status: lease.status,
      startDate: dateValue(lease.start_date),
      endDate: dateValue(lease.end_date),
      noticeDate: dateValue(lease.notice_date),
      monthlyRent: String(lease.monthly_rent),
      deposit: String(lease.deposit),
      annualIndexPercent: String(lease.annual_index_percent),
      paymentTermsDays: String(lease.payment_terms_days),
      note: lease.note || "",
    });
    setShowForm(true);
    setError("");
    setSuccess("");
    window.setTimeout(() => document.getElementById("lease-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(form.id ? `/api/leases/${form.id}` : "/api/leases", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara avtalet");
      const wasEditing = Boolean(form.id);
      setForm(emptyForm);
      setShowForm(false);
      setSuccess(wasEditing ? "Avtalet har uppdaterats." : "Avtalet har skapats och kopplats till objektet.");
      if (page === 1) await load(1);
      else setPage(1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunde inte spara avtalet");
    } finally {
      setSaving(false);
    }
  }

  async function softDeleteLease(lease: Pick<Lease, "id" | "lease_number" | "status">) {
    if (!canManage) return;
    if (lease.status === "active") {
      setError("Aktiva avtal kan inte tas bort. Avsluta eller makulera avtalet först.");
      return;
    }
    if (!softDeletableLeaseStatuses.has(lease.status)) {
      setError("Endast utkast, avslutade eller makulerade avtal kan tas bort.");
      return;
    }
    if (!window.confirm(`Ta bort avtalet ${lease.lease_number}? Det döljs från listor men behålls i historiken.`)) return;
    setDeletingLease(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/leases/${lease.id}`, { method: "DELETE" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort avtalet");
      if (form.id === lease.id) {
        setForm(emptyForm);
        setShowForm(false);
      }
      setUndoHolderId(null);
      setUndoLeaseId(lease.id);
      setSuccess("Avtalet har tagits bort.");
      await load(page);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Kunde inte ta bort avtalet");
    } finally {
      setDeletingLease(false);
    }
  }

  async function softDeleteHolder(holderId: string, holderName: string) {
    if (!canManage || !holderId) return;
    if (!window.confirm(`Ta bort hyresparten ${holderName}? Den döljs från registret men behålls i historiken.`)) return;
    setDeletingHolder(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/lease-holders/${holderId}`, { method: "DELETE" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort hyresparten");
      setForm((current) => (
        current.holderId === holderId
          ? { ...current, holderId: "", holderName: "", holderContactName: "", holderEmail: "", holderPhone: "", holderOrganizationNumber: "", holderType: "individual" }
          : current
      ));
      setUndoLeaseId(null);
      setUndoHolderId(holderId);
      setSuccess("Hyresparten har tagits bort.");
      await load(page);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Kunde inte ta bort hyresparten");
    } finally {
      setDeletingHolder(false);
    }
  }

  async function restoreLease(leaseId: string) {
    if (!canManage) return;
    setRestoringId(leaseId);
    setError("");
    try {
      const response = await fetch(`/api/leases/${leaseId}/restore`, { method: "POST" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte återställa avtalet");
      setUndoLeaseId(null);
      setSuccess("Avtalet har återställts.");
      await load(page);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Kunde inte återställa avtalet");
    } finally {
      setRestoringId(null);
    }
  }

  async function restoreHolder(holderId: string) {
    if (!canManage) return;
    setRestoringId(holderId);
    setError("");
    try {
      const response = await fetch(`/api/lease-holders/${holderId}/restore`, { method: "POST" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte återställa hyresparten");
      setUndoHolderId(null);
      setSuccess("Hyresparten har återställts.");
      await load(page);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Kunde inte återställa hyresparten");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="rounded-[22px] border border-sand-200/90 bg-[#FCFBF7] px-5 py-5 shadow-premium-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-petroleum-700">Uthyrning</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live-data
              </span>
            </div>
            <h1 className="mt-2 font-display text-[30px] font-semibold tracking-[-0.04em] text-ink-950 sm:text-[34px]">Uthyrningsöversikt</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-ink-500">Vakans, hyresparter och avtal samlat i en lugn arbetsyta med tydliga vägar från bestånd till kontrakt och överlämning.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/uthyrning/overlamning" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-[12px] font-semibold text-ink-700 shadow-premium-sm transition hover:border-petroleum-200 hover:text-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300">
              <ClipboardSignature className="h-4 w-4" strokeWidth={1.7} /> Överlämning & besiktning
            </Link>
            {canManage ? (
              <button type="button" onClick={openNewForm} className={`${premiumPrimaryButtonClass} h-10 px-4 text-[12px]`}>
                <Plus className="mr-2 h-4 w-4" /> Nytt avtal
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink href="/dashboard/fastigheter" icon={Building2} label="Fastigheter" hint="Bestånd & objekt" />
          <QuickLink href="/dashboard/hyresavisering" icon={CircleDollarSign} label="Hyresavisering" hint="Avi & betalning" />
          <QuickLink href="/dashboard/dokument" icon={FileSignature} label="Dokument" hint="Avtal & bilagor" />
          <QuickLink href="/dashboard/rapporter" icon={CalendarClock} label="Rapporter" hint="Uthyrning & ekonomi" />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Nyckeltal för uthyrning">
        <LeasingMetric icon={DoorOpen} label="Uthyrningsgrad" value={`${summary.occupancy.toLocaleString("sv-SE")} %`} hint={`${summary.occupied} av ${summary.objects} objekt belagda`} tone="petroleum" />
        <LeasingMetric icon={Building2} label="Uthyrningsbara objekt" value={summary.objects.toLocaleString("sv-SE")} hint={`${properties.length} fastigheter i beståndet`} />
        <LeasingMetric icon={CheckCircle2} label="Lediga objekt" value={summary.vacant.toLocaleString("sv-SE")} hint={summary.vacant ? "Redo för nytt avtal" : "Full beläggning"} tone={summary.vacant ? "warning" : "good"} />
        <LeasingMetric icon={UsersRound} label="Aktiva hyresparter" value={summary.holders.toLocaleString("sv-SE")} hint={`${summary.notice} uppsagda objekt`} />
        <LeasingMetric icon={CircleDollarSign} label="Kontrakterad årshyra" value={compactMoney.format(summary.annualRent)} hint={money.format(summary.annualRent)} />
      </section>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
          <p>{success}</p>
          {undoLeaseId ? <button type="button" disabled={restoringId === undoLeaseId} onClick={() => void restoreLease(undoLeaseId)} className="text-sm font-semibold text-petroleum-800 underline underline-offset-2 transition hover:text-petroleum-950 disabled:opacity-60">{restoringId === undoLeaseId ? "Återställer…" : "Återställ"}</button> : null}
          {undoHolderId ? <button type="button" disabled={restoringId === undoHolderId} onClick={() => void restoreHolder(undoHolderId)} className="text-sm font-semibold text-petroleum-800 underline underline-offset-2 transition hover:text-petroleum-950 disabled:opacity-60">{restoringId === undoHolderId ? "Återställer…" : "Återställ"}</button> : null}
        </div>
      ) : null}
      {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra avtal.</InlineAlert> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Panel title="Uthyrningsläge per fastighet" description="Fastigheter med flest lediga objekt visas först." bodyClassName="p-0">
          {loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-sand-100" />)}</div> : propertyOccupancy.length ? (
            <div className="divide-y divide-sand-100">
              {propertyOccupancy.slice(0, 6).map((property) => (
                <Link key={property.id} href={`/dashboard/fastigheter/${property.id}`} className="group grid gap-3 px-5 py-4 transition hover:bg-sand-50/60 sm:grid-cols-[minmax(0,1fr)_190px_95px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900 transition group-hover:text-petroleum-800">{property.name}</p>
                    <p className="mt-1 text-[11px] text-ink-500">{property.city || "Ort saknas"} · {property.occupied}/{property.total} belagda</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sand-100" aria-label={`${property.occupancy} procent uthyrt`}>
                    <div className="h-full rounded-full bg-petroleum-600" style={{ width: `${Math.max(0, Math.min(100, property.occupancy))}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="text-xs font-semibold text-ink-700">{property.occupancy.toLocaleString("sv-SE")} %</span>
                    {property.vacant ? <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{property.vacant} lediga</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="Inget uthyrningsbestånd ännu" description="Lägg till objekt under Fastigheter för att börja arbeta med uthyrning." />}
        </Panel>

        <Panel title="Uthyrningssignal" description="Snabb avläsning av portföljen.">
          <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
            <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(#174a40 ${Math.max(0, Math.min(100, summary.occupancy))}%, #ece8df 0)` }}>
              <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full border border-sand-100 bg-white">
                <span className="font-display text-[27px] font-semibold tracking-[-0.04em] text-ink-950">{summary.occupancy.toLocaleString("sv-SE")} %</span>
                <span className="mt-0.5 text-[10px] font-medium text-ink-400">uthyrt</span>
              </div>
            </div>
            <div className="w-full space-y-3">
              <SignalRow label="Belagda" value={summary.occupied} tone="good" />
              <SignalRow label="Lediga" value={summary.vacant} tone={summary.vacant ? "warning" : "good"} />
              <SignalRow label="Uppsagda" value={summary.notice} tone={summary.notice ? "warning" : "neutral"} />
              <SignalRow label="Hyresparter" value={summary.holders} tone="neutral" />
            </div>
          </div>
        </Panel>
      </section>

      {canManage && showForm ? (
        <section id="lease-editor" className="scroll-mt-24">
          <Panel title={form.id ? "Redigera avtal" : "Nytt avtal"} description={form.id ? `Uppdaterar ${form.leaseNumber}` : "Koppla objekt och hyrespart. Avtalet sparas i den befintliga tenant-säkrade avtalsmotorn."}>
            <form onSubmit={submit} className="space-y-6">
              <div className="flex items-center justify-between rounded-xl border border-petroleum-100 bg-petroleum-50 px-3.5 py-3">
                <div><p className="text-sm font-semibold text-petroleum-900">{form.id ? "Redigeringsläge" : "Avtalseditor"}</p><p className="mt-0.5 text-[11px] text-petroleum-700/80">{form.id ? "Ändringar loggas via befintligt avtalsflöde." : "Fyll i objekt, hyrespart och villkor."}</p></div>
                <button type="button" onClick={closeForm} className="rounded-lg p-2 text-petroleum-800 transition hover:bg-white" aria-label="Stäng avtalseditor"><X className="h-4 w-4" /></button>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <fieldset className="space-y-3 rounded-2xl border border-sand-200 bg-[#FCFBF8] p-4 sm:p-5">
                  <legend className="px-1 text-sm font-semibold text-ink-900">Objekt & status</legend>
                  <label><FieldLabel>Fastighet</FieldLabel><select required className={premiumFieldClass} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value, unitId: "" })}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                  <label><FieldLabel>Objekt</FieldLabel><select required disabled={!form.propertyId} className={premiumFieldClass} value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="">Välj objekt</option>{formUnits.map((unit) => { const occupied = currentLeaseByUnit.get(unit.id); return <option key={unit.id} value={unit.id}>{unit.designation}{occupied && occupied.id !== form.id ? ` · ${statusLabels[occupied.status]}` : ""}</option>; })}</select></label>
                  <label><FieldLabel>Avtalsnummer</FieldLabel><input className={premiumFieldClass} placeholder="Skapas automatiskt" value={form.leaseNumber} onChange={(event) => setForm({ ...form, leaseNumber: event.target.value })} /></label>
                  <label><FieldLabel>Status</FieldLabel><select className={premiumFieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </fieldset>

                <fieldset className="space-y-3 rounded-2xl border border-sand-200 bg-[#FCFBF8] p-4 sm:p-5">
                  <legend className="px-1 text-sm font-semibold text-ink-900">Hyrespart</legend>
                  <label><FieldLabel>Befintlig hyrespart</FieldLabel><select className={premiumFieldClass} value={form.holderId} onChange={(event) => selectHolder(event.target.value)}><option value="">Skapa ny hyrespart</option>{holders.map((holder) => <option key={holder.id} value={holder.id}>{holder.name}{holder.organization_number ? ` · ${holder.organization_number}` : ""}</option>)}</select></label>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <label><FieldLabel>Typ</FieldLabel><select className={premiumFieldClass} value={form.holderType} onChange={(event) => setForm({ ...form, holderType: event.target.value })}>{Object.entries(holderTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label><FieldLabel>Namn / firma</FieldLabel><input required className={premiumFieldClass} value={form.holderName} onChange={(event) => setForm({ ...form, holderName: event.target.value })} /></label>
                    <label><FieldLabel>Kontaktperson</FieldLabel><input className={premiumFieldClass} value={form.holderContactName} onChange={(event) => setForm({ ...form, holderContactName: event.target.value })} /></label>
                    <label><FieldLabel>Org.nr</FieldLabel><input className={premiumFieldClass} value={form.holderOrganizationNumber} onChange={(event) => setForm({ ...form, holderOrganizationNumber: event.target.value })} /></label>
                    <label><FieldLabel>E-post</FieldLabel><input type="email" className={premiumFieldClass} value={form.holderEmail} onChange={(event) => setForm({ ...form, holderEmail: event.target.value })} /></label>
                    <label><FieldLabel>Telefon</FieldLabel><input className={premiumFieldClass} value={form.holderPhone} onChange={(event) => setForm({ ...form, holderPhone: event.target.value })} /></label>
                  </div>
                  {form.holderId ? <button type="button" disabled={deletingHolder} onClick={() => void softDeleteHolder(form.holderId, form.holderName || "hyresparten")} className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">{deletingHolder ? "Tar bort…" : "Ta bort hyrespart"}</button> : null}
                </fieldset>

                <fieldset className="space-y-3 rounded-2xl border border-sand-200 bg-[#FCFBF8] p-4 sm:p-5">
                  <legend className="px-1 text-sm font-semibold text-ink-900">Avtalsvillkor</legend>
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                    <label><FieldLabel>Startdatum</FieldLabel><input type="date" className={premiumFieldClass} value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
                    <label><FieldLabel>Slutdatum</FieldLabel><input type="date" className={premiumFieldClass} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
                    <label><FieldLabel>Uppsagt</FieldLabel><input type="date" className={premiumFieldClass} value={form.noticeDate} onChange={(event) => setForm({ ...form, noticeDate: event.target.value })} /></label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label><FieldLabel>Månadshyra, kr</FieldLabel><input type="number" min="0" step="0.01" className={premiumFieldClass} value={form.monthlyRent} onChange={(event) => setForm({ ...form, monthlyRent: event.target.value })} /></label>
                    <label><FieldLabel>Deposition, kr</FieldLabel><input type="number" min="0" step="0.01" className={premiumFieldClass} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} /></label>
                    <label><FieldLabel>Årligt index, %</FieldLabel><input type="number" min="0" max="100" step="0.001" className={premiumFieldClass} value={form.annualIndexPercent} onChange={(event) => setForm({ ...form, annualIndexPercent: event.target.value })} /></label>
                    <label><FieldLabel>Betalningsvillkor, dagar</FieldLabel><input type="number" min="0" max="120" className={premiumFieldClass} value={form.paymentTermsDays} onChange={(event) => setForm({ ...form, paymentTermsDays: event.target.value })} /></label>
                  </div>
                  <label className="block"><FieldLabel>Intern anteckning</FieldLabel><textarea className={premiumTextareaClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
                </fieldset>
              </div>

              <div className="flex flex-col gap-3 border-t border-sand-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>{form.id && softDeletableLeaseStatuses.has(form.status) ? <button type="button" disabled={deletingLease} onClick={() => void softDeleteLease({ id: form.id, lease_number: form.leaseNumber || form.id, status: form.status })} className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">{deletingLease ? "Tar bort…" : "Ta bort avtal"}</button> : null}</div>
                <div className="flex gap-2">
                  <button type="button" onClick={closeForm} className="h-10 rounded-xl border border-sand-200 bg-white px-4 text-xs font-semibold text-ink-700 transition hover:bg-sand-50">Avbryt</button>
                  <button disabled={saving} className={`${premiumPrimaryButtonClass} h-10 px-5 text-xs`}>{saving ? "Sparar…" : form.id ? "Spara ändringar" : "Skapa avtal"}</button>
                </div>
              </div>
            </form>
          </Panel>
        </section>
      ) : null}

      <Panel title="Bestånd och vakans" description="Sök och arbeta direkt från objektet. Reserverade, aktiva och uppsagda avtal räknas som beläggning." bodyClassName="p-0">
        <div className="grid gap-3 border-b border-sand-200 bg-[#FCFBF8] p-4 sm:p-5 lg:grid-cols-[minmax(260px,1fr)_190px_170px_auto]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" /><input aria-label="Sök objekt eller hyrespart" placeholder="Sök objekt, adress, hyrespart eller avtal" value={query} onChange={(event) => setQuery(event.target.value)} className={`${premiumFieldClass} pl-9`} /></label>
          <select aria-label="Filtrera fastighet" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className={premiumFieldClass}><option value="">Alla fastigheter</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select aria-label="Filtrera beläggning" value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value)} className={premiumFieldClass}><option value="all">Alla objekt</option><option value="occupied">Belagda</option><option value="vacant">Lediga</option><option value="notice">Uppsagda</option></select>
          <button type="button" disabled={!hasFilters} onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-600 transition hover:border-petroleum-200 hover:text-petroleum-800 disabled:cursor-not-allowed disabled:opacity-45"><SlidersHorizontal className="h-4 w-4" /> Rensa</button>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div>
        ) : visibleRows.length === 0 ? (
          <EmptyState title={unitRows.length ? "Inga objekt matchar filtret" : "Inga uthyrningsbara objekt"} description={unitRows.length ? "Justera sökningen eller återställ filtren." : "Lägg först till lägenheter, lokaler eller parkeringsobjekt i fastighetsregistret."} />
        ) : (
          <div className="divide-y divide-sand-100">
            {visibleRows.map(({ property, unit, lease }) => (
              <article key={unit.id} className="group px-5 py-4 transition hover:bg-sand-50/55 sm:px-6 sm:py-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_170px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink-900">{unit.designation}</h3>
                      <span className="rounded-full border border-sand-200 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold text-ink-600">{typeLabels[unit.unit_type] || unit.unit_type}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${lease ? leaseStatusClass(lease.status) : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>{lease ? statusLabels[lease.status] : "Ledigt"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                      <Link href={`/dashboard/fastigheter/${property.id}`} className="font-medium text-ink-600 transition hover:text-petroleum-800">{property.name}</Link>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {property.address}{property.city ? `, ${property.city}` : ""}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink-800">{lease?.lease_holder.name || "Ingen hyrespart"}</p>
                    <p className="mt-1 text-[11px] text-ink-500">{lease ? `${lease.lease_number}${lease.start_date ? ` · från ${dateValue(lease.start_date)}` : ""}` : `${unit.area ? `${unit.area.toLocaleString("sv-SE")} m² · ` : ""}klart för nytt avtal`}</p>
                  </div>
                  <div className="lg:text-right">
                    <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">{lease ? `${money.format(lease.monthly_rent)}/mån` : "Ledigt"}</p>
                    {lease?.notice_date ? <p className="mt-1 text-[11px] font-medium text-amber-700">Uppsagt {dateValue(lease.notice_date)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Link href={`/dashboard/fastigheter/${property.id}`} className="inline-flex h-9 items-center rounded-lg border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-600 transition hover:border-petroleum-200 hover:text-petroleum-800">Fastighet <ArrowRight className="ml-1.5 h-3 w-3" /></Link>
                    {canManage && lease ? <button type="button" onClick={() => editLease(lease)} className="inline-flex h-9 items-center rounded-lg border border-sand-200 bg-white px-3 text-[11px] font-semibold text-ink-700 transition hover:border-petroleum-300 hover:text-petroleum-800"><Pencil className="mr-1.5 h-3.5 w-3.5" /> Redigera</button> : null}
                    {canManage && !lease ? <button type="button" onClick={() => beginLeaseForUnit(property.id, unit.id)} className="inline-flex h-9 items-center rounded-lg bg-petroleum-700 px-3 text-[11px] font-semibold text-white transition hover:bg-petroleum-800"><Plus className="mr-1.5 h-3.5 w-3.5" /> Skapa avtal</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Avtalshistorik" description="Utkast, aktiva, avslutade och makulerade avtal med samma befintliga redigerings- och återställningsflöden." bodyClassName="p-0">
        {loading ? <p className="p-6 text-sm text-ink-500">Hämtar avtal…</p> : leases.length === 0 ? <EmptyState title="Inga avtal registrerade" description={canManage ? "Skapa det första avtalet via knappen Nytt avtal." : "Avtal visas här när de registreras."} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-sand-200 bg-[#FCFBF8] text-[10px] uppercase tracking-[0.08em] text-ink-500">
                  <tr><th className="px-5 py-3 font-semibold">Avtal</th><th className="px-5 py-3 font-semibold">Hyrespart</th><th className="px-5 py-3 font-semibold">Objekt</th><th className="px-5 py-3 font-semibold">Period</th><th className="px-5 py-3 font-semibold">Hyra</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3"><span className="sr-only">Åtgärd</span></th></tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {leases.map((lease) => (
                    <tr key={lease.id} className="transition hover:bg-sand-50/55">
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-ink-900">{lease.lease_number}</td>
                      <td className="px-5 py-4 text-ink-700">{lease.lease_holder.name}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-ink-500"><Link href={`/dashboard/fastigheter/${lease.property.id}`} className="transition hover:text-petroleum-800">{lease.property.name} · {lease.unit.designation}</Link></td>
                      <td className="whitespace-nowrap px-5 py-4 text-ink-500">{dateValue(lease.start_date) || "–"} – {dateValue(lease.end_date) || "Löpande"}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium text-ink-700">{money.format(lease.monthly_rent)}</td>
                      <td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${leaseStatusClass(lease.status)}`}>{statusLabels[lease.status] || lease.status}</span></td>
                      <td className="px-5 py-4 text-right">{canManage ? <div className="flex items-center justify-end gap-3"><button type="button" onClick={() => editLease(lease)} className="text-xs font-semibold text-petroleum-700 hover:text-petroleum-900">Redigera</button>{softDeletableLeaseStatuses.has(lease.status) ? <button type="button" disabled={deletingLease} onClick={() => void softDeleteLease(lease)} className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">{deletingLease ? "Tar bort…" : "Ta bort"}</button> : null}</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="flex flex-col gap-3 border-t border-sand-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Avtalspaginering">
              <p className="text-xs text-ink-500">Sida {pagination.page} av {pagination.totalPages} · {pagination.total} avtal</p>
              <div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-9 rounded-lg border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Föregående</button><button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="h-9 rounded-lg border border-sand-200 bg-white px-3.5 text-xs font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Nästa</button></div>
            </nav>
          </>
        )}
      </Panel>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label, hint }: { href: string; icon: typeof Building2; label: string; hint: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-3.5 py-3 transition hover:border-petroleum-200 hover:shadow-premium-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.65} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold text-ink-800 transition group-hover:text-petroleum-800">{label}</span><span className="mt-0.5 block text-[10px] text-ink-400">{hint}</span></span>
      <ArrowRight className="h-3.5 w-3.5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-600" />
    </Link>
  );
}

function LeasingMetric({ icon: Icon, label, value, hint, tone = "neutral" }: { icon: typeof Building2; label: string; value: string; hint: string; tone?: "neutral" | "petroleum" | "good" | "warning" }) {
  const iconTone = tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : tone === "petroleum" ? "bg-petroleum-50 text-petroleum-800" : "bg-[#F3F2EA] text-petroleum-800";
  return (
    <article className="rounded-2xl border border-sand-200/90 bg-white p-4 shadow-premium-sm sm:p-5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconTone}`}><Icon className="h-4 w-4" strokeWidth={1.65} /></div>
      <p className="mt-3 text-[11px] font-medium text-ink-500">{label}</p>
      <p className="mt-0.5 font-display text-[25px] font-semibold tracking-[-0.035em] text-ink-950">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-ink-400">{hint}</p>
    </article>
  );
}

function SignalRow({ label, value, tone }: { label: string; value: number; tone: "good" | "warning" | "neutral" }) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-400" : "bg-petroleum-300";
  return <div className="flex items-center justify-between gap-4 border-b border-sand-100 pb-3 last:border-0 last:pb-0"><span className="flex items-center gap-2 text-xs text-ink-600"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</span><span className="text-sm font-semibold text-ink-900">{value.toLocaleString("sv-SE")}</span></div>;
}
