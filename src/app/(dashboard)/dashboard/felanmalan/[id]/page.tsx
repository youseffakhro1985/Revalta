"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Ticket } from "@/types";

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchTicket() {
      try {
        const res = await fetch(`/api/tickets/${params.id}`);
        if (res.ok) {
          const data = await res.json();
          setTicket(data.ticket);
        } else if (res.status === 404) {
          setError("Ärendet hittades inte");
        } else {
          setError("Kunde inte ladda ärendet");
        }
      } catch {
        setError("Något gick fel");
      } finally {
        setLoading(false);
      }
    }
    fetchTicket();
  }, [params.id]);

  const statusStyle = (status: string) => {
    switch (status) {
      case "STÄNGD": return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "PÅGÅENDE": return "bg-blue-50 text-blue-700 border-blue-100";
      default: return "bg-amber-50 text-amber-700 border-amber-100";
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in max-w-4xl mx-auto">
        <div className="p-12 text-center">
          <p className="text-slate-500 font-medium">Laddar ärende...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="animate-fade-in max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/felanmalan" className="text-brand-600 hover:text-brand-700 font-medium text-sm flex items-center transition-colors">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Tillbaka till alla ärenden
          </Link>
        </div>
        <div className="bg-white p-10 rounded-2xl shadow-card border border-slate-100 text-center">
          <p className="text-slate-600">{error || "Ärendet hittades inte"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/felanmalan" className="text-brand-600 hover:text-brand-700 font-medium text-sm flex items-center transition-colors">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Tillbaka till alla ärenden
        </Link>
      </div>

      <div className="bg-white p-10 rounded-2xl shadow-card border border-slate-100 animate-slide-up">
        <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">{ticket.title}</h1>
            <p className="text-slate-500 font-medium">
              Skapad: {new Date(ticket.created_at).toLocaleDateString('sv-SE')}
            </p>
          </div>
          <span className={`px-4 py-1.5 rounded-full text-sm font-bold tracking-wide border shadow-sm ${statusStyle(ticket.status)}`}>
            {ticket.status}
          </span>
        </div>

        <div className="prose prose-slate max-w-none">
          <h3 className="text-xl font-bold mb-4 text-slate-900">Beskrivning</h3>
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-slate-700 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </div>
        </div>
      </div>
    </div>
  );
}
