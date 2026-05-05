"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Ticket } from "@/types";

export default function FelanmalanPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  const fetchTickets = async () => {
    try {
      const res = await fetch("/api/tickets");
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
      }
    } catch {
      // Silently fail on ticket fetch
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      if (res.ok) {
        setTitle("");
        setDescription("");
        setSuccess("Din felanmälan har skickats in!");
        fetchTickets();
      } else {
        const data = await res.json();
        setError(data.error || "Något gick fel");
      }
    } catch {
      setError("Kunde inte skicka felanmälan");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "STÄNGD": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "PÅGÅENDE": return "bg-blue-50 text-blue-700 border-blue-200";
      default: return "bg-amber-50 text-amber-700 border-amber-200";
    }
  };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Mina Ärenden</h1>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-card border border-slate-100 mb-8 animate-slide-up">
        <h2 className="text-xl font-bold mb-6 text-slate-900">Skapa ny felanmälan</h2>
        {error && (
          <div role="alert" aria-live="polite" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div role="status" aria-live="polite" className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">
            {success}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="ticket-title" className="block text-sm font-medium text-slate-700 mb-1">Titel</label>
            <input
              id="ticket-title"
              type="text"
              required
              maxLength={200}
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Läckande kran i köket"
            />
          </div>
          <div>
            <label htmlFor="ticket-description" className="block text-sm font-medium text-slate-700 mb-1">Beskrivning</label>
            <textarea
              id="ticket-description"
              required
              rows={4}
              maxLength={5000}
              className="block w-full rounded-xl border-slate-200 border p-3 shadow-inner-sm focus:border-brand-500 focus:ring-brand-500 transition-colors outline-none resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv problemet mer ingående..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="py-3 px-8 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all shadow-card hover:shadow-card-md active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? "Skickar..." : "Skicka in ärende"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">Dina pågående ärenden</h2>
        </div>
        {ticketsLoading ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 font-medium">Laddar ärenden...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <p className="text-slate-500 font-medium">Du har inga aktiva felanmälningar just nu.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link href={`/dashboard/felanmalan/${ticket.id}`} className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{ticket.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(ticket.created_at).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                  <span className={`ml-4 px-3 py-1 text-xs font-bold rounded-full border ${statusColor(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
