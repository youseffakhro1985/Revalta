"use client";

import { useEffect, useMemo, useState } from "react";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: string;
  property_name?: string;
  responsible?: string;
  note?: string;
  status?: string;
  source?: "table" | "legacy";
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "long" });
const statusLabels: Record<string, string> = { planned: "Planerad", done: "Genomförd", cancelled: "Inställd" };

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("Alla");
  const [form, setForm] = useState({ title: "", date: "", time: "", type: "Aktivitet", propertyName: "", responsible: "", note: "" });

  async function load() {
    const response = await fetch("/api/calendar", { cache: "no-store" });
    if (response.ok) setEvents((await response.json()).events || []);
  }

  useEffect(() => { load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      setForm({ title: "", date: "", time: "", type: "Aktivitet", propertyName: "", responsible: "", note: "" });
      await load();
    } else {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Kunde inte spara aktiviteten");
    }
    setSaving(false);
  }

  async function updateStatus(event: CalendarEvent, status: string) {
    if (event.source === "legacy") {
      setError("Aktiviteten finns i äldre lagring. Kör backfill till CalendarEvent innan status ändras.");
      return;
    }
    if (status === event.status) return;
    setUpdatingId(event.id);
    setError("");
    const response = await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, status }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Kunde inte uppdatera status");
    else await load();
    setUpdatingId("");
  }

  const visible = useMemo(() => events
    .filter((event) => filter === "Alla" || event.type === filter)
    .sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`)), [events, filter]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeEvents = events.filter((event) => event.status !== "cancelled");
  const upcoming = activeEvents.filter((event) => new Date(`${event.date}T00:00:00`) >= today).length;
  const nextSevenDays = activeEvents.filter((event) => {
    const date = new Date(`${event.date}T00:00:00`);
    return date >= today && date.getTime() <= today.getTime() + 7 * 86400000;
  }).length;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Planering</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Kalender och aktiviteter</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">Samla planerade arbeten, besök, ronder, underhåll och avtalsbevakning i en gemensam arbetsvy.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[["Kommande aktiviteter", upcoming], ["Nästa 7 dagar", nextSevenDays], ["Totalt planerat", activeEvents.length]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <p className="text-xs font-medium text-ink-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-petroleum-700">Ny aktivitet</p>
            <h2 className="mt-1 text-lg font-semibold text-ink-950">Planera in</h2>
          </div>
          <input required placeholder="Rubrik" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" />
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          </div>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm">
            <option>Aktivitet</option><option>Arbetsorder</option><option>Rond</option><option>Underhåll</option><option>Avtal</option><option>Besiktning</option><option>Möte</option>
          </select>
          <input placeholder="Fastighet" value={form.propertyName} onChange={(e) => setForm({ ...form, propertyName: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <input placeholder="Ansvarig" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          <textarea placeholder="Anteckning" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-24 w-full rounded-xl border border-sand-200 px-4 py-3 text-sm" />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button disabled={saving} className="w-full rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50">{saving ? "Sparar…" : "Spara aktivitet"}</button>
        </form>

        <div className="rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
          <div className="flex flex-col gap-3 border-b border-sand-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold text-ink-950">Planerade aktiviteter</h2><p className="mt-1 text-xs text-ink-400">Sorterade i datumordning</p></div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-sand-200 px-3 py-2 text-sm">
              <option>Alla</option><option>Aktivitet</option><option>Arbetsorder</option><option>Rond</option><option>Underhåll</option><option>Avtal</option><option>Besiktning</option><option>Möte</option>
            </select>
          </div>
          <div className="divide-y divide-sand-200">
            {visible.length === 0 ? <p className="p-8 text-sm text-ink-400">Inga aktiviteter registrerade ännu.</p> : visible.map((event) => (
              <article key={event.id} className="grid gap-4 p-5 md:grid-cols-[150px_1fr_auto] md:items-center">
                <div><p className="text-sm font-semibold text-ink-950">{dateFormatter.format(new Date(`${event.date}T12:00:00`))}</p><p className="mt-1 text-xs text-ink-400">{event.time || "Heldag"}</p></div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-petroleum-700">{event.type}</p>
                  <h3 className="mt-1 font-semibold text-ink-950">{event.title}</h3>
                  <p className="mt-1 text-sm text-ink-500">{event.property_name || "Ingen fastighet"}{event.responsible ? ` · ${event.responsible}` : ""}</p>
                  {event.note ? <p className="mt-2 text-xs text-ink-400">{event.note}</p> : null}
                  {event.source === "legacy" ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">Äldre rad – kör backfill innan status kan ändras.</p>
                  ) : null}
                </div>
                <div className="space-y-2 md:text-right">
                  <span className="inline-flex rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-600">
                    {statusLabels[event.status || "planned"] || "Planerad"}
                  </span>
                  {event.source !== "legacy" ? (
                    <select
                      disabled={updatingId === event.id}
                      value={event.status || "planned"}
                      onChange={(e) => void updateStatus(event, e.target.value)}
                      className="block h-9 w-full min-w-[9rem] rounded-xl border border-sand-200 bg-white px-2 text-xs text-ink-700 outline-none focus:border-petroleum-500 md:ml-auto"
                      aria-label={`Ändra status för ${event.title}`}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
