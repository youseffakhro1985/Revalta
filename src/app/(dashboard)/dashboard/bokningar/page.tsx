"use client";

import { useCallback, useEffect, useState } from "react";
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

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ propertyId: "", resource: "Tvättstuga", residentName: "", unit: "", start: "", end: "", note: "" });
  const [editForm, setEditForm] = useState({ resource: "Tvättstuga", residentName: "", unit: "", start: "", end: "", note: "" });

  const load = useCallback(async () => {
    const response = await fetch("/api/bookings", { cache: "no-store" });
    const data = await readResponseJson<{
      bookings?: Booking[];
      properties?: Property[];
      permissions?: { canManage?: boolean };
      error?: string;
    }>(response);
    if (!response.ok) {
      setMessage(data.error || "Kunde inte hämta bokningar");
      return;
    }
    setBookings(data.bookings || []);
    setProperties(data.properties || []);
    setCanManage(Boolean(data.permissions?.canManage));
    if (data.properties?.[0]?.id) {
      setForm((value) => (value.propertyId ? value : { ...value, propertyId: data.properties![0].id }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) setMessage(data.error || "Bokningen kunde inte sparas");
    else {
      setMessage("Bokningen är registrerad");
      setForm((value) => ({ ...value, residentName: "", unit: "", start: "", end: "", note: "" }));
      await load();
    }
    setSaving(false);
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
    setMessage("");
  }

  async function saveEdit(booking: Booking) {
    if (booking.source === "legacy") {
      setMessage("Bokningen finns i äldre lagring. Kör backfill till Booking innan den kan ändras.");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, ...editForm }),
    });
    const data = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) setMessage(data.error || "Bokningen kunde inte uppdateras");
    else {
      setMessage("Bokningen är uppdaterad");
      setEditingId("");
      await load();
    }
    setSaving(false);
  }

  async function cancelBooking(booking: Booking) {
    if (booking.source === "legacy") {
      setMessage("Bokningen finns i äldre lagring. Kör backfill till Booking innan den kan avbokas.");
      return;
    }
    if (!window.confirm("Avboka den här bokningen?")) return;
    setCancellingId(booking.id);
    setMessage("");
    const response = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, status: "cancelled" }),
    });
    const data = await readResponseJson<{ error?: string }>(response);
    if (!response.ok) setMessage(data.error || "Bokningen kunde inte avbokas");
    else {
      setMessage("Bokningen är avbokad");
      await load();
    }
    setCancellingId("");
  }

  const upcoming = bookings.filter((booking) => new Date(booking.end).getTime() >= Date.now());
  const week = upcoming.filter((booking) => new Date(booking.start).getTime() <= Date.now() + 604800000).length;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Boendeservice</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Bokningar och resurser</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">Hantera gemensamma resurser och undvik dubbelbokningar.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        {[["Kommande", upcoming.length], ["Nästa sju dagar", week], ["Resurstyper", resourceTypes.length]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <p className="text-xs text-ink-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
        ))}
      </section>
      {!canManage && message ? <p className="text-sm text-petroleum-700">{message}</p> : null}
      {!canManage ? <p className="text-sm text-ink-500">Du har läsbehörighet till resurskalendern. Förvaltare kan skapa och ändra bokningar med boendeuppgifter.</p> : null}
      <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[380px_1fr]" : "grid-cols-1"}`}>
        {canManage ? (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <h2 className="text-lg font-semibold text-ink-950">Ny bokning</h2>
          <select required aria-label="Välj fastighet" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm">
            <option value="">Välj fastighet</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{property.name} · {property.city}</option>
            ))}
          </select>
          <select aria-label="Resurstyp" value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm">
            {resourceTypes.map((resource) => <option key={resource}>{resource}</option>)}
          </select>
          <input required aria-label="Boendes namn" placeholder="Boendes namn" value={form.residentName} onChange={(e) => setForm({ ...form, residentName: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <input aria-label="Lägenhet/lokal" placeholder="Lägenhet/lokal" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <input required type="datetime-local" aria-label="Starttid" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <input required type="datetime-local" aria-label="Sluttid" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <textarea aria-label="Anteckning" placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-24 w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          {message ? <p className="text-sm text-petroleum-700">{message}</p> : null}
          <button disabled={saving} className="w-full rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Sparar…" : "Registrera bokning"}
          </button>
        </form>
        ) : null}
        <div className="rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="border-b border-sand-200 p-5"><h2 className="font-semibold text-ink-950">Bokningsöversikt</h2></div>
          <div className="divide-y divide-sand-200">
            {bookings.length === 0 ? (
              <p className="p-8 text-sm text-ink-400">Inga bokningar registrerade ännu.</p>
            ) : (
              bookings.map((booking) => (
                <article key={booking.id} className="space-y-3 p-5">
                  <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-petroleum-700">{booking.resource}</p>
                      <h3 className="mt-1 font-semibold text-ink-950">{booking.resident_name || "Bokad resurs"}</h3>
                      <p className="text-sm text-ink-500">{booking.property_name || "Fastighet"}{booking.unit ? ` · ${booking.unit}` : ""}</p>
                      {booking.source === "legacy" ? (
                        <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan bokningen kan ändras eller avbokas.</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-800">{new Date(booking.start).toLocaleString("sv-SE")}</p>
                      <p className="text-xs text-ink-400">Till {new Date(booking.end).toLocaleString("sv-SE")}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${booking.status === "cancelled" ? "bg-sand-100 text-ink-600" : "bg-petroleum-50 text-petroleum-700"}`}>
                        {booking.status === "cancelled" ? "Avbokad" : "Bekräftad"}
                      </span>
                      {canManage && booking.status !== "cancelled" && booking.source !== "legacy" ? (
                        <>
                          <button type="button" onClick={() => startEdit(booking)} className="text-xs font-semibold text-petroleum-700 hover:text-petroleum-900">
                            Ändra
                          </button>
                          <button type="button" disabled={cancellingId === booking.id} onClick={() => void cancelBooking(booking)} className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:opacity-60">
                            {cancellingId === booking.id ? "Avbokar…" : "Avboka"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {canManage && editingId === booking.id ? (
                    <div className="grid gap-3 rounded-xl border border-sand-200 bg-sand-50 p-4 md:grid-cols-2">
                      <select aria-label="Resurstyp" value={editForm.resource} onChange={(e) => setEditForm({ ...editForm, resource: e.target.value })} className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm">
                        {resourceTypes.map((resource) => <option key={resource}>{resource}</option>)}
                      </select>
                      <input aria-label="Boendes namn" value={editForm.residentName} onChange={(e) => setEditForm({ ...editForm, residentName: e.target.value })} className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm" placeholder="Boendes namn" />
                      <input aria-label="Lägenhet/lokal" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm" placeholder="Lägenhet/lokal" />
                      <input type="datetime-local" aria-label="Starttid" value={editForm.start} onChange={(e) => setEditForm({ ...editForm, start: e.target.value })} className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm" />
                      <input type="datetime-local" aria-label="Sluttid" value={editForm.end} onChange={(e) => setEditForm({ ...editForm, end: e.target.value })} className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm" />
                      <textarea aria-label="Anteckning" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className="min-h-20 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm md:col-span-2" placeholder="Anteckning" />
                      <div className="flex gap-3 md:col-span-2">
                        <button type="button" disabled={saving} onClick={() => void saveEdit(booking)} className="rounded-xl bg-petroleum-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                          Spara ändringar
                        </button>
                        <button type="button" onClick={() => setEditingId("")} className="rounded-xl border border-sand-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700">
                          Avbryt
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
