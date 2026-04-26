"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Ticket, User } from "@/types";

interface Props {
  user: Pick<User, "name" | "email" | "role">;
  initialTickets: Ticket[];
}

const statusLabel: Record<Ticket["status"], string> = {
  open: "Öppen",
  in_progress: "Pågående",
  closed: "Avslutad",
};

const statusColor: Record<Ticket["status"], string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  closed: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function DashboardClient({ user, initialTickets }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", propertyAddress: "" });
  const [submitting, setSubmitting] = useState(false);

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      const newTicket = await res.json();
      setTickets([newTicket, ...tickets]);
      setForm({ title: "", description: "", propertyAddress: "" });
      setShowForm(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
              <span className="text-slate-950 font-black">R</span>
            </div>
            <span className="font-bold text-lg tracking-tight">Revalta</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-400 capitalize">
                {user.role === "admin" ? "🔑 Admin" : "🏠 Fastighetsägare"}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              Logga ut
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Välkomsthälsning */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            Välkommen, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Här ser du alla felanmälningar och kan skapa nya ärenden.
          </p>
        </div>

        {/* Statistikkort */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Totalt ärenden", value: tickets.length, color: "text-white" },
            { label: "Öppna", value: openCount, color: "text-red-400" },
            { label: "Pågående", value: inProgressCount, color: "text-amber-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5"
            >
              <p className="text-slate-400 text-sm">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Ärenden-sektion */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold text-white">Felanmälningar</h2>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm rounded-lg px-4 py-2 transition-colors"
            >
              {showForm ? "Avbryt" : "+ Ny felanmälan"}
            </button>
          </div>

          {/* Formulär */}
          {showForm && (
            <div className="px-6 py-5 border-b border-slate-800 bg-slate-800/40">
              <h3 className="text-sm font-semibold text-white mb-4">Skapa nytt ärende</h3>
              <form onSubmit={handleCreateTicket} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Rubrik *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="T.ex. Trasig hiss"
                      required
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Fastighetsadress *</label>
                    <input
                      type="text"
                      value={form.propertyAddress}
                      onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
                      placeholder="T.ex. Storgatan 12, Stockholm"
                      required
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Beskrivning *</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Beskriv felet i detalj..."
                    required
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm rounded-lg px-5 py-2 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Sparar..." : "Skapa ärende"}
                </button>
              </form>
            </div>
          )}

          {/* Ärendelista */}
          {tickets.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              Inga ärenden ännu. Skapa ditt första!
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="px-6 py-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white text-sm">{ticket.title}</span>
                        <span
                          className={`text-xs border rounded-full px-2 py-0.5 ${statusColor[ticket.status]}`}
                        >
                          {statusLabel[ticket.status]}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mt-1 line-clamp-1">
                        {ticket.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        <span>📍 {ticket.propertyAddress}</span>
                        <span>👤 {ticket.createdBy}</span>
                        <span>
                          🗓 {new Date(ticket.createdAt).toLocaleDateString("sv-SE")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin-vy */}
        {user.role === "admin" && (
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl px-6 py-4">
            <p className="text-amber-400 text-sm font-medium">🔑 Adminvy aktiv</p>
            <p className="text-slate-400 text-xs mt-1">
              Du ser alla ärenden i systemet. Rollhantering och statusuppdateringar kan byggas ut härifrån.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
