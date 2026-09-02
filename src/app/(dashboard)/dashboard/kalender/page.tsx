"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
  source?: "table" | "legacy" | "work_order";
  work_order_id?: string;
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "long" });
const compactDateFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const statusLabels: Record<string, string> = { planned: "Planerad", done: "Genomförd", cancelled: "Inställd" };
const manualTypeOptions = ["Aktivitet", "Rond", "Underhåll", "Avtal", "Besiktning", "Möte"];
const filterTypeOptions = ["Arbetsorder", ...manualTypeOptions];

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function eventDate(event: CalendarEvent) {
  return new Date(`${event.date}T00:00:00`);
}

function statusClass(status?: string) {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "cancelled") return "border-sand-200 bg-sand-100 text-ink-500";
  return "border-petroleum-100 bg-petroleum-50 text-petroleum-800";
}

function isEditableCalendarEvent(event: CalendarEvent) {
  return event.source !== "legacy" && event.source !== "work_order";
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ title: "", date: "", time: "", responsible: "", note: "", propertyName: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("Alla");
  const [form, setForm] = useState({ title: "", date: "", time: "", type: "Aktivitet", propertyName: "", responsible: "", note: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta kalendern");
      setEvents(data.events || []);
      setCanManage(Boolean(data.permissions?.canManage));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta kalendern");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startEdit(event: CalendarEvent) {
    if (!isEditableCalendarEvent(event)) return;
    setEditingId(event.id);
    setEditForm({
      title: event.title || "",
      date: event.date || "",
      time: event.time || "",
      responsible: event.responsible || "",
      note: event.note || "",
      propertyName: event.property_name || "",
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara aktiviteten");
      setForm({ title: "", date: "", time: "", type: "Aktivitet", propertyName: "", responsible: "", note: "" });
      setSuccess("Aktiviteten är planerad och syns nu i kalendern.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara aktiviteten");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(event: CalendarEvent, status: string) {
    if (!isEditableCalendarEvent(event)) {
      setError(event.source === "work_order"
        ? "Arbetsorderns status hanteras från arbetsordervyn."
        : "Aktiviteten finns i äldre lagring. Kör backfill till CalendarEvent innan den kan uppdateras.");
      return;
    }
    if (status === event.status) return;
    setUpdatingId(event.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, status }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera status");
      setSuccess("Aktivitetens status är uppdaterad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera status");
    } finally {
      setUpdatingId("");
    }
  }

  async function saveEdit(event: CalendarEvent) {
    if (!isEditableCalendarEvent(event)) {
      setError(event.source === "work_order"
        ? "Arbetsordern redigeras från arbetsordervyn."
        : "Aktiviteten finns i äldre lagring. Kör backfill till CalendarEvent innan den kan uppdateras.");
      return;
    }
    setUpdatingId(event.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          title: editForm.title,
          date: editForm.date,
          time: editForm.time,
          responsible: editForm.responsible,
          note: editForm.note,
          propertyName: editForm.propertyName,
        }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera aktiviteten");
      setEditingId("");
      setSuccess("Aktiviteten är uppdaterad.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte uppdatera aktiviteten");
    } finally {
      setUpdatingId("");
    }
  }

  async function removeEvent(event: CalendarEvent) {
    if (!isEditableCalendarEvent(event)) {
      setError(event.source === "work_order"
        ? "Arbetsordern hanteras från arbetsordervyn."
        : "Aktiviteten finns i äldre lagring. Kör backfill till CalendarEvent innan den kan tas bort.");
      return;
    }
    if (!window.confirm("Ta bort den här aktiviteten?")) return;
    setRemovingId(event.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte ta bort aktiviteten");
      if (editingId === event.id) setEditingId("");
      setSuccess("Aktiviteten är borttagen.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte ta bort aktiviteten");
    } finally {
      setRemovingId("");
    }
  }

  const visible = useMemo(() => events
    .filter((event) => filter === "Alla" || event.type === filter)
    .sort((a, b) => `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`)), [events, filter]);

  const today = startOfToday();
  const activeEvents = events.filter((event) => event.status !== "cancelled");
  const upcoming = activeEvents.filter((event) => eventDate(event) >= today).length;
  const nextSevenDays = activeEvents.filter((event) => {
    const date = eventDate(event);
    return date >= today && date.getTime() <= today.getTime() + 7 * 86400000;
  }).length;
  const completed = events.filter((event) => event.status === "done").length;
  const todayCount = activeEvents.filter((event) => eventDate(event).getTime() === today.getTime()).length;

  const sections = useMemo(() => {
    const sevenDays = today.getTime() + 7 * 86400000;
    return [
      {
        key: "today",
        title: "Idag",
        description: "Aktiviteter som kräver uppmärksamhet idag.",
        items: visible.filter((event) => eventDate(event).getTime() === today.getTime()),
      },
      {
        key: "next",
        title: "Nästa 7 dagar",
        description: "Kommande planering inom den närmaste veckan.",
        items: visible.filter((event) => eventDate(event).getTime() > today.getTime() && eventDate(event).getTime() <= sevenDays),
      },
      {
        key: "later",
        title: "Senare",
        description: "Längre fram i den operativa planeringen.",
        items: visible.filter((event) => eventDate(event).getTime() > sevenDays),
      },
      {
        key: "history",
        title: "Historik",
        description: "Tidigare aktiviteter och genomförd planering.",
        items: visible.filter((event) => eventDate(event).getTime() < today.getTime()),
      },
    ].filter((section) => section.items.length > 0);
  }, [today, visible]);

  return (
    <div className="space-y-8 animate-fade-in-soft">
      <PageHeader
        eyebrow="Drift · Planering"
        title="Kalender och aktiviteter"
        description="Samla planerade arbeten, besök, ronder, underhåll och avtalsbevakning i en tydlig operativ tidslinje."
        action={canManage ? (
          <a href="#ny-aktivitet" className={premiumPrimaryButtonClass}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            Ny aktivitet
          </a>
        ) : undefined}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Kommande aktiviteter" value={upcoming} hint="Alla aktiva aktiviteter från idag och framåt" />
        <MetricCard icon={CalendarClock} label="Idag" value={todayCount} hint="Planerade aktiviteter för dagens datum" />
        <MetricCard icon={Clock3} label="Nästa 7 dagar" value={nextSevenDays} hint="Operativ belastning kommande vecka" />
        <MetricCard icon={CheckCircle2} label="Genomförda" value={completed} hint="Aktiviteter markerade som genomförda" />
      </section>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
      {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet till kalendern. Förvaltare eller administratör kan skapa och ändra aktiviteter.</InlineAlert> : null}

      <section className={`grid items-start gap-6 ${canManage ? "xl:grid-cols-[390px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {canManage ? (
          <Panel
            title="Planera aktivitet"
            description="Skapa ett tydligt planeringsunderlag med datum, ansvar och fastighetskoppling. Arbetsorder schemaläggs i arbetsordervyn och visas automatiskt här."
            className="xl:sticky xl:top-[118px]"
          >
            <form id="ny-aktivitet" onSubmit={submit} className="space-y-4">
              <input required placeholder="Rubrik" aria-label="Rubrik" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={premiumFieldClass} />
              <div className="grid grid-cols-2 gap-3">
                <input required type="date" aria-label="Datum" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={premiumFieldClass} />
                <input type="time" aria-label="Tid" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} className={premiumFieldClass} />
              </div>
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className={premiumFieldClass} aria-label="Typ">
                {manualTypeOptions.map((type) => <option key={type}>{type}</option>)}
              </select>
              <input placeholder="Fastighet" aria-label="Fastighet" value={form.propertyName} onChange={(event) => setForm({ ...form, propertyName: event.target.value })} className={premiumFieldClass} />
              <input placeholder="Ansvarig" aria-label="Ansvarig" value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })} className={premiumFieldClass} />
              <textarea placeholder="Anteckning" aria-label="Anteckning" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={premiumTextareaClass} />
              <button disabled={saving} className={`${premiumPrimaryButtonClass} w-full`}>
                {saving ? "Sparar…" : "Spara aktivitet"}
              </button>
            </form>
          </Panel>
        ) : null}

        <Panel
          title="Operativ tidslinje"
          description="Aktiviteter grupperade efter när de ska genomföras. Schemalagda arbetsorder hämtas direkt från arbetsorderregistret."
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-3 border-b border-sand-200 bg-sand-50/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <CalendarCheck2 className="h-4 w-4 text-petroleum-700" strokeWidth={1.7} aria-hidden="true" />
              <span>{visible.length} aktiviteter i aktuell vy</span>
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className={`${premiumFieldClass} sm:w-48`} aria-label="Filtrera efter typ">
              <option>Alla</option>
              {filterTypeOptions.map((type) => <option key={type}>{type}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">
              {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState title="Inga aktiviteter i den här vyn" description="Ändra filtret eller planera en ny aktivitet för att börja bygga kalendern." />
          ) : (
            <div className="divide-y divide-sand-200">
              {sections.map((section) => (
                <section key={section.key} aria-labelledby={`calendar-section-${section.key}`}>
                  <div className="bg-[#FCFBF8] px-5 py-4 sm:px-6">
                    <h3 id={`calendar-section-${section.key}`} className="font-display text-lg font-semibold tracking-[-0.02em] text-ink-900">{section.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-ink-500">{section.description}</p>
                  </div>
                  <div className="divide-y divide-sand-100">
                    {section.items.map((event) => (
                      <article key={event.id} className="px-5 py-5 transition-colors hover:bg-sand-50/45 sm:px-6">
                        <div className="grid gap-4 lg:grid-cols-[118px_minmax(0,1fr)_170px] lg:items-start">
                          <div>
                            <p className="text-sm font-semibold capitalize text-ink-900">{dateFormatter.format(eventDate(event))}</p>
                            <p className="mt-1 text-xs text-ink-500">{event.time || "Heldag"}</p>
                            <p className="mt-3 inline-flex rounded-lg border border-sand-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{compactDateFormatter.format(eventDate(event))}</p>
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-petroleum-700">{event.type}</span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(event.status)}`}>
                                {statusLabels[event.status || "planned"] || "Planerad"}
                              </span>
                            </div>
                            <h4 className="mt-2 text-[15px] font-semibold text-ink-900">{event.title}</h4>
                            <p className="mt-1 text-sm leading-6 text-ink-500">
                              {event.property_name || "Ingen fastighet"}{event.responsible ? ` · ${event.responsible}` : ""}
                            </p>
                            {event.note ? <p className="mt-2 text-xs leading-5 text-ink-500">{event.note}</p> : null}
                            {event.source === "legacy" ? <InlineAlert tone="warning">Äldre rad – kör backfill innan uppdatering eller borttagning.</InlineAlert> : null}
                            {event.source === "work_order" ? <InlineAlert tone="info">Canonical arbetsorder – tid, ansvar och status ändras i arbetsordervyn och speglas automatiskt här.</InlineAlert> : null}
                          </div>

                          {event.source === "work_order" && event.work_order_id ? (
                            <div className="lg:text-right">
                              <a href={`/dashboard/arbetsorder/${event.work_order_id}`} className={`${premiumSecondaryButtonClass} h-9 px-3 text-xs`}>
                                Öppna arbetsorder
                              </a>
                            </div>
                          ) : canManage && isEditableCalendarEvent(event) ? (
                            <div className="space-y-2 lg:text-right">
                              <select
                                disabled={updatingId === event.id}
                                value={event.status || "planned"}
                                onChange={(changeEvent) => void updateStatus(event, changeEvent.target.value)}
                                className="h-9 w-full rounded-lg border border-sand-200 bg-white px-2 text-xs text-ink-700 outline-none focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100"
                                aria-label={`Ändra status för ${event.title}`}
                              >
                                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <div className="flex gap-2 lg:justify-end">
                                <button
                                  type="button"
                                  onClick={() => (editingId === event.id ? setEditingId("") : startEdit(event))}
                                  className={`${premiumSecondaryButtonClass} h-9 px-3 text-xs`}
                                >
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                  {editingId === event.id ? "Stäng" : "Ändra"}
                                </button>
                                <button
                                  type="button"
                                  disabled={removingId === event.id}
                                  onClick={() => void removeEvent(event)}
                                  aria-label={`Ta bort ${event.title}`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-white text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {canManage && editingId === event.id && isEditableCalendarEvent(event) ? (
                          <div className="mt-5 rounded-xl border border-sand-200 bg-[#FCFBF8] p-4">
                            <div className="mb-4 flex items-center gap-2">
                              <Pencil className="h-4 w-4 text-petroleum-700" aria-hidden="true" />
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-600">Redigera aktivitet</p>
                            </div>
                            <div className="space-y-3">
                              <input className={premiumFieldClass} placeholder="Rubrik" aria-label="Rubrik" value={editForm.title} onChange={(changeEvent) => setEditForm({ ...editForm, title: changeEvent.target.value })} />
                              <div className="grid grid-cols-2 gap-3">
                                <input type="date" className={premiumFieldClass} aria-label="Datum" value={editForm.date} onChange={(changeEvent) => setEditForm({ ...editForm, date: changeEvent.target.value })} />
                                <input type="time" className={premiumFieldClass} aria-label="Tid" value={editForm.time} onChange={(changeEvent) => setEditForm({ ...editForm, time: changeEvent.target.value })} />
                              </div>
                              <input className={premiumFieldClass} placeholder="Fastighet" aria-label="Fastighet" value={editForm.propertyName} onChange={(changeEvent) => setEditForm({ ...editForm, propertyName: changeEvent.target.value })} />
                              <input className={premiumFieldClass} placeholder="Ansvarig" aria-label="Ansvarig" value={editForm.responsible} onChange={(changeEvent) => setEditForm({ ...editForm, responsible: changeEvent.target.value })} />
                              <textarea className={premiumTextareaClass} placeholder="Anteckning" aria-label="Anteckning" value={editForm.note} onChange={(changeEvent) => setEditForm({ ...editForm, note: changeEvent.target.value })} />
                              <button
                                type="button"
                                disabled={updatingId === event.id}
                                onClick={() => void saveEdit(event)}
                                className={premiumPrimaryButtonClass}
                              >
                                {updatingId === event.id ? "Sparar…" : "Spara ändringar"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
