"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CircleDollarSign, ClipboardSignature, DoorOpen, FileSignature, Pencil, Plus, Search, UsersRound, X } from "lucide-react";
import { EmptyState, InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass, premiumTextareaClass } from "@/components/dashboard/premium-ui";
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
const statusLabels: Record<string, string> = { draft: "Utkast", reserved: "Reserverad", active: "Aktivt", notice: "Uppsagt", ended: "Avslutat", cancelled: "Makulerat" };
const typeLabels: Record<string, string> = { apartment: "Lägenhet", commercial: "Lokal", parking: "Parkering", garage: "Garage", storage: "Förråd", other: "Övrigt" };
const holderTypeLabels: Record<string, string> = { individual: "Privatperson", company: "Företag", association: "Förening" };
const occupyingStatuses = new Set(["reserved", "active", "notice"]);
const softDeletableLeaseStatuses = new Set(["draft", "cancelled", "ended"]);

function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{children}</span>;
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
      return `${property.name} ${property.address} ${unit.designation} ${lease?.lease_holder.name || ""} ${lease?.lease_number || ""}`.toLowerCase().includes(normalized);
    });
  }, [unitRows, propertyFilter, occupancyFilter, query]);

  const summary = useMemo(() => {
    const occupied = unitRows.filter((row) => row.lease);
    return {
      objects: unitRows.length,
      occupied: occupied.length,
      vacant: unitRows.length - occupied.length,
      holders: leaseSummary.activeHolders,
      annualRent: leaseSummary.annualRent,
    };
  }, [leaseSummary, unitRows]);

  const formUnits = properties.find((property) => property.id === form.propertyId)?.units || [];

  function resetForm() {
    setForm(emptyForm);
    setError("");
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
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      if (form.id === lease.id) setForm(emptyForm);
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

  return <div className="space-y-8">
    <PageHeader
      eyebrow="Uthyrning"
      title="Hyresparter och avtal"
      description="Hantera objekt, vakans, hyresparter och hela kontraktets livscykel med spårbar historik och säkra organisationsgränser."
      action={<div className="flex flex-wrap gap-2">
        <Link href="/dashboard/uthyrning/overlamning" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 transition hover:border-petroleum-200 hover:text-petroleum-800"><ClipboardSignature className="h-4 w-4" />Överlämning & besiktning</Link>
        {canManage ? <button type="button" onClick={resetForm} className={premiumPrimaryButtonClass}><Plus className="mr-2 h-4 w-4" />Nytt avtal</button> : null}
      </div>}
    />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard icon={Building2} label="Uthyrningsbara objekt" value={summary.objects} />
      <MetricCard icon={FileSignature} label="Belagda" value={summary.occupied} />
      <MetricCard icon={DoorOpen} label="Lediga" value={summary.vacant} />
      <MetricCard icon={UsersRound} label="Aktiva hyresparter" value={summary.holders} />
      <MetricCard icon={CircleDollarSign} label="Kontrakterad årshyra" value={money.format(summary.annualRent)} />
    </section>

    {error ? <InlineAlert>{error}</InlineAlert> : null}
    {success ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <p>{success}</p>
        {undoLeaseId ? (
          <button
            type="button"
            disabled={restoringId === undoLeaseId}
            onClick={() => void restoreLease(undoLeaseId)}
            className="text-sm font-semibold text-petroleum-800 underline underline-offset-2 transition hover:text-petroleum-950 disabled:opacity-60"
          >
            {restoringId === undoLeaseId ? "Återställer…" : "Återställ"}
          </button>
        ) : null}
        {undoHolderId ? (
          <button
            type="button"
            disabled={restoringId === undoHolderId}
            onClick={() => void restoreHolder(undoHolderId)}
            className="text-sm font-semibold text-petroleum-800 underline underline-offset-2 transition hover:text-petroleum-950 disabled:opacity-60"
          >
            {restoringId === undoHolderId ? "Återställer…" : "Återställ"}
          </button>
        ) : null}
      </div>
    ) : null}
    {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa och ändra avtal.</InlineAlert> : null}

    <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[430px_1fr]" : "grid-cols-1"}`}>
      {canManage ? <Panel title={form.id ? "Redigera avtal" : "Nytt avtal"} description={form.id ? `Uppdaterar ${form.leaseNumber}` : "Koppla en registrerad hyrespart eller skapa en ny."}>
        <form onSubmit={submit} className="space-y-5">
          {form.id ? <div className="flex items-center justify-between rounded-xl border border-petroleum-100 bg-petroleum-50 px-3 py-2.5"><p className="text-sm font-medium text-petroleum-900">Redigeringsläge</p><button type="button" onClick={resetForm} className="rounded-lg p-1.5 text-petroleum-800 hover:bg-white" aria-label="Avbryt redigering"><X className="h-4 w-4" /></button></div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label><FieldLabel>Fastighet</FieldLabel><select required className={premiumFieldClass} value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value, unitId: "" })}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
            <label><FieldLabel>Objekt</FieldLabel><select required disabled={!form.propertyId} className={premiumFieldClass} value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="">Välj objekt</option>{formUnits.map((unit) => { const occupied = currentLeaseByUnit.get(unit.id); return <option key={unit.id} value={unit.id}>{unit.designation}{occupied && occupied.id !== form.id ? ` · ${statusLabels[occupied.status]}` : ""}</option>; })}</select></label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label><FieldLabel>Avtalsnummer</FieldLabel><input className={premiumFieldClass} placeholder="Skapas automatiskt" value={form.leaseNumber} onChange={(event) => setForm({ ...form, leaseNumber: event.target.value })} /></label>
            <label><FieldLabel>Status</FieldLabel><select className={premiumFieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>

          <div className="border-t border-sand-200 pt-5">
            <h3 className="text-sm font-semibold text-ink-900">Hyrespart</h3>
            <label className="mt-3 block"><FieldLabel>Befintlig hyrespart</FieldLabel><select className={premiumFieldClass} value={form.holderId} onChange={(event) => selectHolder(event.target.value)}><option value="">Skapa ny hyrespart</option>{holders.map((holder) => <option key={holder.id} value={holder.id}>{holder.name}{holder.organization_number ? ` · ${holder.organization_number}` : ""}</option>)}</select></label>
            {form.holderId ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={deletingHolder}
                  onClick={() => void softDeleteHolder(form.holderId, form.holderName || "hyresparten")}
                  className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60"
                >
                  {deletingHolder ? "Tar bort…" : "Ta bort hyrespart"}
                </button>
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><FieldLabel>Typ</FieldLabel><select className={premiumFieldClass} value={form.holderType} onChange={(event) => setForm({ ...form, holderType: event.target.value })}>{Object.entries(holderTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><FieldLabel>Namn / firma</FieldLabel><input required className={premiumFieldClass} value={form.holderName} onChange={(event) => setForm({ ...form, holderName: event.target.value })} /></label>
              <label><FieldLabel>Kontaktperson</FieldLabel><input className={premiumFieldClass} value={form.holderContactName} onChange={(event) => setForm({ ...form, holderContactName: event.target.value })} /></label>
              <label><FieldLabel>Org.nr</FieldLabel><input className={premiumFieldClass} value={form.holderOrganizationNumber} onChange={(event) => setForm({ ...form, holderOrganizationNumber: event.target.value })} /></label>
              <label><FieldLabel>E-post</FieldLabel><input type="email" className={premiumFieldClass} value={form.holderEmail} onChange={(event) => setForm({ ...form, holderEmail: event.target.value })} /></label>
              <label><FieldLabel>Telefon</FieldLabel><input className={premiumFieldClass} value={form.holderPhone} onChange={(event) => setForm({ ...form, holderPhone: event.target.value })} /></label>
            </div>
          </div>

          <div className="border-t border-sand-200 pt-5">
            <h3 className="text-sm font-semibold text-ink-900">Avtalsvillkor</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label><FieldLabel>Startdatum</FieldLabel><input type="date" className={premiumFieldClass} value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
              <label><FieldLabel>Slutdatum</FieldLabel><input type="date" className={premiumFieldClass} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
              <label><FieldLabel>Uppsagt</FieldLabel><input type="date" className={premiumFieldClass} value={form.noticeDate} onChange={(event) => setForm({ ...form, noticeDate: event.target.value })} /></label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><FieldLabel>Månadshyra, kr</FieldLabel><input type="number" min="0" step="0.01" className={premiumFieldClass} value={form.monthlyRent} onChange={(event) => setForm({ ...form, monthlyRent: event.target.value })} /></label>
              <label><FieldLabel>Deposition, kr</FieldLabel><input type="number" min="0" step="0.01" className={premiumFieldClass} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} /></label>
              <label><FieldLabel>Årligt index, %</FieldLabel><input type="number" min="0" max="100" step="0.001" className={premiumFieldClass} value={form.annualIndexPercent} onChange={(event) => setForm({ ...form, annualIndexPercent: event.target.value })} /></label>
              <label><FieldLabel>Betalningsvillkor, dagar</FieldLabel><input type="number" min="0" max="120" className={premiumFieldClass} value={form.paymentTermsDays} onChange={(event) => setForm({ ...form, paymentTermsDays: event.target.value })} /></label>
            </div>
            <label className="mt-3 block"><FieldLabel>Intern anteckning</FieldLabel><textarea className={premiumTextareaClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          </div>

          <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : form.id ? "Spara ändringar" : "Skapa avtal"}</button>
          {form.id && softDeletableLeaseStatuses.has(form.status) ? (
            <div className="border-t border-sand-100 pt-4">
              <button
                type="button"
                disabled={deletingLease}
                onClick={() => void softDeleteLease({ id: form.id, lease_number: form.leaseNumber || form.id, status: form.status })}
                className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60"
              >
                {deletingLease ? "Tar bort…" : "Ta bort avtal"}
              </button>
            </div>
          ) : null}
        </form>
      </Panel> : null}

      <Panel title="Bestånd och vakans" description="Ett objekt räknas som belagt när det har ett reserverat, aktivt eller uppsagt avtal." bodyClassName="p-0">
        <div className="grid gap-3 border-b border-sand-200 p-5 md:grid-cols-[1fr_170px_150px]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-300" /><input aria-label="Sök objekt eller hyrespart" placeholder="Sök objekt, hyrespart eller avtal" value={query} onChange={(event) => setQuery(event.target.value)} className={`${premiumFieldClass} pl-9`} /></label>
          <select aria-label="Filtrera fastighet" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className={premiumFieldClass}><option value="">Alla fastigheter</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select aria-label="Filtrera beläggning" value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value)} className={premiumFieldClass}><option value="all">Alla objekt</option><option value="occupied">Belagda</option><option value="vacant">Lediga</option><option value="notice">Uppsagda</option></select>
        </div>

        {loading ? <div className="space-y-3 p-6">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div> : visibleRows.length === 0 ? <EmptyState title={unitRows.length ? "Inga objekt matchar filtret" : "Inga uthyrningsbara objekt"} description={unitRows.length ? "Justera sökningen eller filtreringen." : "Lägg först till lägenheter, lokaler eller parkeringsobjekt i fastighetsregistret."} /> : <div className="divide-y divide-sand-100">{visibleRows.map(({ property, unit, lease }) => <article key={unit.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink-900">{unit.designation}</h3>
                <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{typeLabels[unit.unit_type] || unit.unit_type}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${lease ? lease.status === "notice" ? "bg-amber-50 text-amber-800" : "bg-petroleum-50 text-petroleum-800" : "bg-emerald-50 text-emerald-800"}`}>{lease ? statusLabels[lease.status] : "Ledigt"}</span>
              </div>
              <p className="mt-1 text-sm text-ink-500">{property.name} · {property.address}</p>
              <p className="mt-2 text-sm font-medium text-ink-800">{lease?.lease_holder.name || "Ingen hyrespart"}</p>
              <p className="mt-1 text-xs text-ink-500">{lease ? `${lease.lease_number}${lease.start_date ? ` · från ${dateValue(lease.start_date)}` : ""}` : `${unit.area ? `${unit.area.toLocaleString("sv-SE")} m² · ` : ""}klart för nytt avtal`}</p>
            </div>
            <div className="flex items-center justify-between gap-5 lg:justify-end">
              <div className="lg:text-right"><p className="text-lg font-semibold text-ink-900">{lease ? `${money.format(lease.monthly_rent)}/mån` : "–"}</p>{lease?.notice_date ? <p className="text-xs text-amber-700">Uppsagt {dateValue(lease.notice_date)}</p> : null}</div>
              {canManage && lease ? <button type="button" onClick={() => editLease(lease)} className="inline-flex h-10 items-center rounded-xl border border-sand-200 px-3 text-sm font-semibold text-ink-700 transition hover:border-petroleum-300 hover:text-petroleum-800"><Pencil className="mr-2 h-4 w-4" />Redigera</button> : null}
            </div>
          </div>
        </article>)}</div>}
      </Panel>
    </section>

    <Panel title="Avtalshistorik" description="Alla utkast, pågående, avslutade och makulerade avtal i organisationen." bodyClassName="p-0">
      {loading ? <p className="p-6 text-sm text-ink-500">Hämtar avtal…</p> : leases.length === 0 ? <EmptyState title="Inga avtal registrerade" description="Skapa det första avtalet från formuläret ovan." /> : <><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-sand-200 bg-sand-50/70 text-[11px] uppercase tracking-[0.08em] text-ink-500"><tr><th className="px-5 py-3 font-semibold">Avtal</th><th className="px-5 py-3 font-semibold">Hyrespart</th><th className="px-5 py-3 font-semibold">Objekt</th><th className="px-5 py-3 font-semibold">Period</th><th className="px-5 py-3 font-semibold">Hyra</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3"><span className="sr-only">Åtgärd</span></th></tr></thead><tbody className="divide-y divide-sand-100">{leases.map((lease) => <tr key={lease.id} className="hover:bg-sand-50/60"><td className="whitespace-nowrap px-5 py-4 font-semibold text-ink-900">{lease.lease_number}</td><td className="px-5 py-4 text-ink-700">{lease.lease_holder.name}</td><td className="whitespace-nowrap px-5 py-4 text-ink-500">{lease.property.name} · {lease.unit.designation}</td><td className="whitespace-nowrap px-5 py-4 text-ink-500">{dateValue(lease.start_date) || "–"} – {dateValue(lease.end_date) || "Löpande"}</td><td className="whitespace-nowrap px-5 py-4 text-ink-700">{money.format(lease.monthly_rent)}</td><td className="px-5 py-4"><span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{statusLabels[lease.status] || lease.status}</span></td><td className="px-5 py-4 text-right">{canManage ? <div className="flex items-center justify-end gap-3"><button type="button" onClick={() => editLease(lease)} className="font-semibold text-petroleum-700 hover:text-petroleum-900">Redigera</button>{softDeletableLeaseStatuses.has(lease.status) ? <button type="button" disabled={deletingLease} onClick={() => void softDeleteLease(lease)} className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">{deletingLease ? "Tar bort…" : "Ta bort"}</button> : null}</div> : null}</td></tr>)}</tbody></table></div><nav className="flex flex-col gap-3 border-t border-sand-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Avtalspaginering"><p className="text-ink-500">Visar sida {pagination.page} av {pagination.totalPages} · {pagination.total} avtal</p><div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Föregående</button><button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="h-10 rounded-xl border border-sand-200 bg-white px-4 font-semibold text-ink-700 transition hover:bg-sand-50 disabled:cursor-not-allowed disabled:opacity-50">Nästa</button></div></nav></>}
    </Panel>
  </div>;
}
