"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function FelanmalanPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setError("");

    try {
      const response = await fetch("/api/tickets", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Kunde inte hämta ärenden");
        return;
      }

      setTickets(data.tickets || []);
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setLoadingTickets(false);
    }
  }, [router]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "ÖPPEN").length,
    [tickets]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
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
      setSuccess("Felanmälan är skapad och ligger nu i din ärendelista.");
    } catch {
      setError("Kunde inte kontakta servern");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl animate-fade-in space-y-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-card sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Felanmälan</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">Mina ärenden</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Skapa, följ upp och öppna detaljer för dina felanmälningar på ett ställe.
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
          <h2 className="text-2xl font-bold text-slate-950">Skapa ny felanmälan</h2>
          <p className="mt-2 text-sm text-slate-500">Beskriv problemet tydligt så kan ärendet hanteras snabbare.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Titel</label>
            <input 
              type="text" 
              required
              minLength={3}
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Läckande kran i köket"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Beskrivning</label>
            <textarea 
              required
              minLength={10}
              rows={4}
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none resize-y" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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

          {loadingTickets ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
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
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
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
