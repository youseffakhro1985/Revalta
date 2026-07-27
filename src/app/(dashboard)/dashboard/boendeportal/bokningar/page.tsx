"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, RefreshCw } from "lucide-react";
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

type Lease = {
  id: string;
  leaseNumber: string;
  property: { id: string; name: string; address: string; city: string };
  unit: { id: string; designation: string };
  holderName: string;
};

type Booking = {
  id: string;
  property: { id: string; name: string; address: string; city: string };
  resource: string;
  residentName: string;
  unit: string | null;
  start: string;
  end: string;
  note: string | null;
  status: string;
  createdByMe: boolean;
};

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function ResidentBookingsPage() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [leaseId, setLeaseId] = useState("");
  const [resource, setResource] = useState("Tvättstuga");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/resident-portal/bookings", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta bokningar");
      const nextLeases = data.leases || [];
      setLeases(nextLeases);
      setBookings(data.bookings || []);
      setLeaseId((current) => current || nextLeases[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta bokningar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcomingCount = useMemo(
    () => bookings.filter((booking) => booking.status !== "cancelled" && new Date(booking.end) >= new Date()).length,
    [bookings],
  );

  async function createBooking(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/resident-portal/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseId, resource, start, end, note }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa bokning");
      setSuccess("Bokningen är skapad.");
      setNote("");
      setBookings((current) => [data.booking, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa bokning");
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(bookingId: string) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/resident-portal/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status: "cancelled" }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte avboka");
      setSuccess("Bokningen är avbokad.");
      setBookings((current) => current.map((booking) => (
        booking.id === bookingId ? { ...booking, status: "cancelled" } : booking
      )));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte avboka");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Min boendeservice"
        title="Mina bokningar"
        description="Boka gemensamma resurser kopplade till ditt hyresavtal, till exempel tvättstuga."
        action={(
          <button type="button" onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-sand-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Uppdatera
          </button>
        )}
      />

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {!loading && leases.length === 0 ? (
        <InlineAlert tone="info">
          Inget aktivt hyresavtal är kopplat till din e-postadress ännu. Kontakta förvaltningen om du behöver hjälp.
        </InlineAlert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <MetricCard icon={CalendarCheck2} label="Kommande" value={upcomingCount} hint="Aktiva bokningar framåt" />
        <MetricCard label="Totalt" value={bookings.length} hint="Inklusive avbokade" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel title="Ny bokning" description="Välj avtal, resurs och tid.">
          {loading ? (
            <div className="h-64 animate-pulse rounded-xl bg-sand-100" />
          ) : leases.length === 0 ? (
            <EmptyState
              title="Inga aktiva hyresavtal"
              description="När ditt avtal är kopplat till din e-post kan du boka resurser här."
            />
          ) : (
            <form onSubmit={createBooking} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink-700">Hyresavtal</span>
                <select required value={leaseId} onChange={(event) => setLeaseId(event.target.value)} className={premiumFieldClass}>
                  {leases.map((lease) => (
                    <option key={lease.id} value={lease.id}>
                      {lease.property.name} · {lease.unit.designation}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink-700">Resurs</span>
                <input required value={resource} onChange={(event) => setResource(event.target.value)} className={premiumFieldClass} placeholder="Tvättstuga" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink-700">Start</span>
                <input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className={premiumFieldClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink-700">Slut</span>
                <input required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className={premiumFieldClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink-700">Meddelande</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className={premiumTextareaClass} rows={3} />
              </label>
              <button type="submit" disabled={saving} className={premiumPrimaryButtonClass}>
                {saving ? "Bokar…" : "Skapa bokning"}
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Bokningshistorik" description="Dina bokningar och avbokningar." bodyClassName="p-0">
          {loading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}</div>
          ) : bookings.length === 0 ? (
            <EmptyState title="Inga bokningar ännu" description="Skapa din första bokning till vänster." />
          ) : (
            <div className="divide-y divide-sand-100">
              {bookings.map((booking) => (
                <article key={booking.id} className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">
                      {booking.resource} · {booking.property.name}{booking.unit ? ` · ${booking.unit}` : ""}
                    </p>
                    <h3 className="mt-1 font-semibold text-ink-900">
                      {dateTimeFormatter.format(new Date(booking.start))} – {dateTimeFormatter.format(new Date(booking.end))}
                    </h3>
                    {booking.note ? <p className="mt-1 text-sm text-ink-500">{booking.note}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      booking.status === "cancelled" ? "bg-sand-100 text-ink-600" : "bg-petroleum-50 text-petroleum-800"
                    }`}
                    >
                      {booking.status === "cancelled" ? "Avbokad" : "Bekräftad"}
                    </span>
                    {booking.createdByMe && booking.status !== "cancelled" ? (
                      <button
                        type="button"
                        onClick={() => void cancelBooking(booking.id)}
                        className={premiumSecondaryButtonClass}
                      >
                        Avboka
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
