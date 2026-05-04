"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  title: string;
  description: string;
  propertyText: string;
};

export function TicketCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ title: "", description: "", propertyText: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Kunde inte skapa ärendet");
        return;
      }

      setForm({ title: "", description: "", propertyText: "" });
      router.push(`/dashboard/felanmalan/${data.ticket.id}`);
      router.refresh();
    } catch (err) {
      setError("Något gick fel. Försök igen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-800">Titel</label>
        <input
          required
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="Ex. Droppande vatten under diskhon"
          className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 shadow-inner-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-800">Fastighet</label>
        <input
          required
          value={form.propertyText}
          onChange={(event) => setForm((current) => ({ ...current, propertyText: event.target.value }))}
          placeholder="Ex. Brf Solgården, Göteborg"
          className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 shadow-inner-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-800">Beskrivning</label>
        <textarea
          required
          rows={5}
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Beskriv problemet, omfattning, plats och om det finns akut risk."
          className="block w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 shadow-inner-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {loading ? "Analyserar och skapar..." : "Skapa felanmälan"}
      </button>
    </form>
  );
}
