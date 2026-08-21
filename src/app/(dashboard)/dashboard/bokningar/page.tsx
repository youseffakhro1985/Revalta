"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Building2, CalendarDays, Clock3, Search } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  LoadingState,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  premiumCompactButtonClass,
  premiumDangerButtonClass,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumSecondaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; city: string };
type Booking = {
  id: string;
  property_name?: string;
  resource: string;
  resident_name?: string | null;
  unit?: string;
  start: string;
  end: string;
  note?: string;
  status: string;
  source?: "table" | "legacy";
};

const resourceTypes = ["Tvättstuga", "Föreningslokal", "Gästlägenhet", "Parkering", "Bastu", "Övrigt"];
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [form, setForm] = useState({ propertyId: "", resource: "Tvättstuga", residentName: "", unit: "", start: "", end: "", note: "" });
  const [editForm, setEditForm] = useState({ resource: "Tvättstuga", residentName: "", unit: "", start: "", end: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bookings", { cache: "no-store" });
      const data = await readResponseJson<{
        bookings?: Booking[];
        properties?: Property[];
        permissions?: { canManage?: boolean };
        error?: string;
      }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta bokningar");
      setBookings(data.bookings || []);
      setProperties(data.properties || []);
      setCanManage(Boolean(data.permissions?.canManage));
      if (data.properties?.[0]?.id) {
        setForm((value) => (value.propertyId ? value : { ...value, propertyId: data.properties![0].id }));
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta bokningar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (new Date(form.end).getTime() <= new Date(form.start).getTime()) {
      setError("Sluttiden måste ligga efter starttiden.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Bokningen kunde inte sparas");
      setSuccess("Bokningen är registrerad.");
      setForm((value) => ({ ...value, residentName: "", unit: "", start: "", end: "", note: "" }));
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Bokningen kunde inte sparas");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(booking: Booking) {
    if (booking.source === "legacy" || booking.status === "cancelled") return;
    setEditingId(booking.id);
    setEditForm({
      resource: booking.resource || "Tvättstuga",
      residentName: booking.resident_name || "",
      unit: booking.unit || "",
      start: toLocalInput(booking.start),
      end: toLocalInput(booking.end),
      note: booking.note || "",
    });
    setError("");
    setSuccess("");
  }

  async function saveEdit(booking: Booking) {
    if (booking.source === "legacy") {
      setError("Bokningen finns i äldre lagring. Kör backfill till Booking innan den kan ändras.");
      return;
    }
    if (new Date(editForm.end).getTime() <= new Date(editForm.start).getTime()) {
      setError("Sluttiden måste ligga efter starttiden.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, ...editForm }),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Bokningen kunde inte uppdateras");
      setSuccess("Bokningen är uppdaterad.");
      setEditingId("");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Bokningen kunde inte uppdateras");
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(booking: Booking) {
    if (booking.source === "legacy") {
      setError("Bokningen finns i äldre lagring. Kör backfill till Booking innan den kan avbokas.");
      return;
    }
    if (!window.confirm("Avboka den här bokningen?")) return;
    setCancellingId(booking.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, status: "cancelled" }),
      });
      const data = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Bokningen kunde inte avbokas");
      setSuccess("Bokningen är avbokad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Bokningen kunde inte avbokas");
    } finally {
      setCancellingId("");
    }
  }

  const now = new Date();
  const activeBookings = useMemo(() => bookings.filter((booking) => booking.status !== "cancelled"), [bookings]);
  const upcoming = useMemo(() => activeBookings.filter((booking) => new Date(booking.end).getTime() >= now.getTime()), [activeBookings, now]);
  const today = useMemo(() => upcoming.filter((booking) => sameDay(new Date(booking.start), now)).length, [now, upcoming]);
  const week = useMemo(() => upcoming.filter((booking) => new Date(booking.start).getTime() <= now.getTime() + 604800000).length, [now, upcoming]);
  const cancelled = bookings.filter((booking) => booking.status === "cancelled").length;

  const filteredBookings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      if (resourceFilter && booking.resource !== resourceFilter) return false;
      if (statusFilter === "active" && booking.status === "cancelled") return false;
      if (statusFilter === "cancelled" && booking.status !== "cancelled") return false;
      if (!needle) return true;
      return [booking.resource, booking.resident_name, booking.property_name, booking.unit, booking.note].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [bookings, query, resourceFilter, statusFilter]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Boendeservice" title="Bokningar och resurser" description="Planera gemensamma resurser med tydliga tider, boendekoppling och kontroll över kommande bokningar." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Kommande" value={upcoming.length} hint="Aktiva bokningar framåt" />
        <MetricCard icon={Clock3} label="Idag" value={today} hint="Startar under dagens datum" />
        <MetricCard icon={Building2} label="Nästa sju dagar" value={week} hint="Planerad belastning" />
        <MetricCard icon={Ban} label="Avbokade" value={cancelled} hint="Behålls i historiken" />
      </section>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet till resurskalendern. Förvaltare kan skapa, ändra och avboka bokningar.</InlineAlert> : null}

      <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[390px_1fr]" : "grid-cols-1"}`}>
        {canManage ? (
          <Panel title="Ny bokning" description="Registrera resurs, boende och tidsintervall." className="h-fit xl:sticky xl:top-[112px]">
            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Fastighet</span><select required aria-label="Välj fastighet" value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })} className={premiumFieldClass}><option value="">Välj fastighet</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.city}</option>)}</select></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Resurs</span><select aria-label="Resurstyp" value={form.resource} onChange={(event) => setForm({ ...form, resource: event.target.value })} className={premiumFieldClass}>{resourceTypes.map((resource) => <option key={resource}>{resource}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Boende</span><input required aria-label="Boendes namn" placeholder="Namn" value={form.residentName} onChange={(event) => setForm({ ...form, residentName: event.target.value })} className={premiumFieldClass} /></label>
                <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Lägenhet/lokal</span><input aria-label="Lägenhet/lokal" placeholder="Exempel: 1203" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className={premiumFieldClass} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Start</span><input required type="datetime-local" aria-label="Starttid" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} className={premiumFieldClass} /></label>
                <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Slut</span><input required type="datetime-local" aria-label="Sluttid" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} className={premiumFieldClass} /></label>
              </div>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-700">Anteckning</span><textarea aria-label="Anteckning" placeholder="Valfri information om bokningen" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={premiumTextareaClass} /></label>
              <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>{saving ? "Sparar…" : "Registrera bokning"}</button>
            </form>
          </Panel>
        ) : null}

        <Panel title="Bokningsöversikt" description="Sök, filtrera och hantera samtliga resurser." bodyClassName="p-0">
          <div className="grid gap-3 border-b border-sand-200 p-4 sm:grid-cols-[1fr_180px_160px] sm:p-5">
            <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" /><input aria-label="Sök bokningar" placeholder="Sök boende, resurs, fastighet eller objekt" value={query} onChange={(event) => setQuery(event.target.value)} className={`${premiumFieldClass} pl-9`} /></label>
            <select aria-label="Filtrera resurs" value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)} className={premiumFieldClass}><option value="">Alla resurser</option>{resourceTypes.map((resource) => <option key={resource}>{resource}</option>)}</select>
            <select aria-label="Filtrera status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={premiumFieldClass}><option value="all">Alla statusar</option><option value="active">Aktiva</option><option value="cancelled">Avbokade</option></select>
          </div>

          {loading ? <LoadingState label="Hämtar bokningar…" rows={4} /> : filteredBookings.length === 0 ? <EmptyState icon={CalendarDays} title="Inga bokningar hittades" description={bookings.length ? "Justera sökning eller filter för att visa fler bokningar." : "När den första bokningen registreras visas den här."} /> : (
            <div className="divide-y divide-sand-100">
              {filteredBookings.map((booking) => (
                <article key={booking.id} className="p-5 transition hover:bg-sand-50/60 sm:p-6">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-petroleum-700">{booking.resource}</p><StatusBadge tone={booking.status === "cancelled" ? "neutral" : "success"}>{booking.status === "cancelled" ? "Avbokad" : "Bekräftad"}</StatusBadge></div>
                      <h3 className="mt-2 font-semibold text-ink-900">{booking.resident_name || "Bokad resurs"}</h3>
                      <p className="mt-1 text-sm text-ink-500">{booking.property_name || "Fastighet"}{booking.unit ? ` · ${booking.unit}` : ""}</p>
                      {booking.note ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-500">{booking.note}</p> : null}
                      {booking.source === "legacy" ? <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan bokningen kan ändras eller avbokas.</p> : null}
                    </div>
                    <div className="rounded-xl bg-sand-50 px-4 py-3">
                      <p className="text-sm font-semibold text-ink-800">{dateTime.format(new Date(booking.start))}</p>
                      <p className="mt-1 text-xs text-ink-500">Till {dateTime.format(new Date(booking.end))}</p>
                    </div>
                    {canManage && booking.status !== "cancelled" && booking.source !== "legacy" ? <div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" onClick={() => (editingId === booking.id ? setEditingId("") : startEdit(booking))} className={premiumCompactButtonClass}>{editingId === booking.id ? "Stäng" : "Ändra"}</button><button type="button" disabled={cancellingId === booking.id} onClick={() => void cancelBooking(booking)} className={premiumDangerButtonClass}>{cancellingId === booking.id ? "Avbokar…" : "Avboka"}</button></div> : null}
                  </div>

                  {canManage && editingId === booking.id ? (
                    <div className="mt-5 rounded-xl border border-sand-200 bg-sand-50/65 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <select aria-label="Resurstyp" value={editForm.resource} onChange={(event) => setEditForm({ ...editForm, resource: event.target.value })} className={premiumFieldClass}>{resourceTypes.map((resource) => <option key={resource}>{resource}</option>)}</select>
                        <input aria-label="Boendes namn" value={editForm.residentName} onChange={(event) => setEditForm({ ...editForm, residentName: event.target.value })} className={premiumFieldClass} placeholder="Boendes namn" />
                        <input aria-label="Lägenhet/lokal" value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value })} className={premiumFieldClass} placeholder="Lägenhet/lokal" />
                        <input type="datetime-local" aria-label="Starttid" value={editForm.start} onChange={(event) => setEditForm({ ...editForm, start: event.target.value })} className={premiumFieldClass} />
                        <input type="datetime-local" aria-label="Sluttid" value={editForm.end} onChange={(event) => setEditForm({ ...editForm, end: event.target.value })} className={premiumFieldClass} />
                        <textarea aria-label="Anteckning" value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} className={`${premiumTextareaClass} md:col-span-2`} placeholder="Anteckning" />
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={saving} onClick={() => void saveEdit(booking)} className={premiumPrimaryButtonClass}>{saving ? "Sparar…" : "Spara ändringar"}</button><button type="button" onClick={() => setEditingId("")} className={premiumSecondaryButtonClass}>Avbryt</button></div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
