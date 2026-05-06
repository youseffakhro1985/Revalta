"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Property = {
  id: string;
  name: string;
  address: string;
  city: string;
};

type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  property_id: string | null;
  created_at: string;
  property: Property | null;
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function FelanmalanPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [ticketsResponse, propertiesResponse] = await Promise.all([
          fetch("/api/tickets", { cache: "no-store" }),
          fetch("/api/properties", { cache: "no-store" }),
        ]);

        if (ticketsResponse.status === 401 || propertiesResponse.status === 401) {
          router.push("/login");
          return;
        }

        const [ticketsData, propertiesData] = await Promise.all([
          ticketsResponse.json(),
          propertiesResponse.json(),
        ]);

        if (!isMounted) return;

        if (!ticketsResponse.ok) {
          setError(ticketsData.error || "Kunde inte hämta ärenden");
          return;
        }

        if (!propertiesResponse.ok) {
          setError(propertiesData.error || "Kunde inte hämta fastigheter");
          return;
        }

        setTickets(ticketsData.tickets || []);
        setProperties(propertiesData.properties || []);
      } catch {
        if (isMounted) {
          setError("Kunde inte kontakta servern");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "ÖPPEN").length,
    [tickets]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, propertyId }),
      });
      const data = await response.json();

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (!response.ok) {
        setError(data.error || "Kunde inte skapa ärendet");
        return;
      }

      setTickets((current) => [data.ticket, ...current]);
      setTitle("");
      setDescription("");
      setPropertyId("");
      setSuccess("Felanmälan är skapad och kopplad till rätt fastighet.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-card sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Felanmälan</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">Mina ärenden</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Skapa, följ upp och koppla felanmälningar till rätt fastighet.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-slate-50 px-5 py-4">
            <p className="text-3xl font-extrabold text-slate-950">{tickets.length}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Totalt</p>
          </div>
          <div className="rounded-2xl bg-warning-50 px-5 py-4">
            <p className="text-3xl font-extrabold text-warning-600">{openTickets}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-warning-600">Öppna</p>
          </div>
        </div>
      </div>

      {(error || success) && (
        <div className={`rounded-2xl border p-4 text-sm font-medium ${error ? "border-danger-500 bg-danger-50 text-danger-600" : "border-success-500 bg-success-50 text-success-600"}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Skapa ny felanmälan</h2>
              <p className="mt-2 text-sm text-slate-500">Välj fastighet och beskriv problemet tydligt.</p>
            </div>
            <Link href="/dashboard/fastigheter" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              Fastigheter
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Fastighet</label>
              <select
                className="block w-full rounded-xl border border-slate-200 bg-white p-3 shadow-inner-sm outline-none transition-colors focus:border-brand-500 focus:ring-brand-500"
                value={propertyId}
                onChange={(event) => setPropertyId(event.target.value)}
              >
                <option value="">Ingen vald fastighet</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name} - {property.address}, {property.city}
                  </option>
                ))}
              </select>
              {properties.length === 0 && !loading && (
                <p className="mt-2 text-xs text-slate-500">
                  Lägg gärna till en fastighet först för bättre struktur i ärenden.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Titel</label>
              <input
                type="text"
                required
                minLength={3}
                className="block w-full rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none transition-colors focus:border-brand-500 focus:ring-brand-500"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Läckande kran i köket"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Beskrivning</label>
              <textarea
                required
                minLength={10}
                rows={4}
                className="block w-full resize-y rounded-xl border border-slate-200 p-3 shadow-inner-sm outline-none transition-colors focus:border-brand-500 focus:ring-brand-500"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Beskriv problemet mer ingående..."
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 px-8 py-3 font-semibold text-white shadow-card transition-all hover:bg-brand-700 hover:shadow-card-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Skapar ärende..." : "Skicka in ärende"}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 bg-slate-50/70 p-6">
            <h2 className="text-lg font-bold text-slate-950">Dina pågående ärenden</h2>
            <p className="mt-1 text-sm text-slate-500">Klicka på ett ärende för att se detaljer.</p>
          </div>

          {loading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : tickets.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/felanmalan/${ticket.id}`}
                  className="block p-6 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold text-slate-950">{ticket.title}</h3>
                      <p className="mt-2 text-xs font-semibold tracking-wide text-brand-600">
                        {ticket.property ? `${ticket.property.name} · ${ticket.property.address}` : "Ingen fastighet vald"}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{ticket.description}</p>
                      <p className="mt-3 text-xs font-medium text-slate-400">
                        Skapad {dateFormatter.format(new Date(ticket.created_at))}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-warning-100 bg-warning-50 px-3 py-1 text-xs font-bold text-warning-600">
                      {ticket.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="font-semibold text-slate-800">Du har inga aktiva felanmälningar just nu.</p>
              <p className="mt-2 text-sm text-slate-500">När du skapar ett ärende visas det här direkt.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
