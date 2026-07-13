"use client";

import { useEffect, useMemo, useState } from "react";

type NotificationItem = {
  id: string;
  notificationId: string;
  title?: string;
  message?: string;
  priority?: "normal" | "important" | "urgent";
  audience?: string;
  author_name?: string;
  created_at: string;
  read: boolean;
};

type EventItem = {
  id: string;
  action: string;
  entityType: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

const priorityLabel = { normal: "Information", important: "Viktigt", urgent: "Brådskande" } as const;
const priorityClass = {
  normal: "border-sand-200 bg-sand-50 text-ink-600",
  important: "border-amber-200 bg-amber-50 text-amber-800",
  urgent: "border-red-200 bg-red-50 text-red-800",
} as const;

function eventTitle(event: EventItem) {
  const metadata = event.metadata || {};
  const preferred = metadata.title || metadata.name || metadata.subject || metadata.property_name;
  if (typeof preferred === "string" && preferred.trim()) return preferred;
  return event.action.replaceAll(".", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [form, setForm] = useState({ title: "", message: "", priority: "normal", audience: "Alla användare" });

  async function load() {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setNotifications(data.notifications || []);
    setEvents(data.recentEvents || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      setForm({ title: "", message: "", priority: "normal", audience: "Alla användare" });
      await load();
    }
    setSaving(false);
  }

  async function markRead(notificationId: string) {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
    if (response.ok) {
      setNotifications((items) => items.map((item) => (item.notificationId === notificationId ? { ...item, read: true } : item)));
    }
  }

  const visible = useMemo(() => {
    if (filter === "unread") return notifications.filter((item) => !item.read);
    if (filter === "urgent") return notifications.filter((item) => item.priority === "urgent");
    return notifications;
  }, [notifications, filter]);

  const unread = notifications.filter((item) => !item.read).length;
  const urgent = notifications.filter((item) => item.priority === "urgent" && !item.read).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-700">Kommunikation och uppföljning</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink-950">Notiscenter</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">Samla intern information, viktiga besked och senaste händelser i en tydlig arbetsyta.</p>
        </div>
        <div className="flex gap-2 rounded-xl border border-sand-200 bg-white p-1 shadow-premium-sm">
          {([['all', 'Alla'], ['unread', 'Olästa'], ['urgent', 'Brådskande']] as const).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === value ? "bg-petroleum-800 text-white" : "text-ink-500 hover:bg-sand-50"}`}>{label}</button>
          ))}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[['Olästa notiser', unread], ['Brådskande', urgent], ['Senaste händelser', events.length]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-sand-200 bg-white p-5 shadow-premium-sm">
            <p className="text-xs font-medium text-ink-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-premium-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-petroleum-700">Nytt meddelande</p>
            <h2 className="mt-2 text-lg font-semibold text-ink-950">Publicera intern information</h2>
          </div>
          <input required maxLength={120} placeholder="Rubrik" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-xl border border-sand-200 px-4 py-3 text-sm outline-none focus:border-petroleum-500" />
          <textarea required maxLength={2000} rows={6} placeholder="Meddelande" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className="w-full resize-none rounded-xl border border-sand-200 px-4 py-3 text-sm outline-none focus:border-petroleum-500" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm">
              <option value="normal">Information</option>
              <option value="important">Viktigt</option>
              <option value="urgent">Brådskande</option>
            </select>
            <select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} className="rounded-xl border border-sand-200 px-4 py-3 text-sm">
              <option>Alla användare</option>
              <option>Förvaltare</option>
              <option>Fastighetsskötare</option>
              <option>Administratörer</option>
            </select>
          </div>
          <button disabled={saving} className="w-full rounded-xl bg-petroleum-800 px-4 py-3 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50">{saving ? "Publicerar…" : "Publicera meddelande"}</button>
        </form>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
            <div className="border-b border-sand-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink-950">Meddelanden</h2>
            </div>
            <div className="divide-y divide-sand-200">
              {visible.length === 0 ? (
                <p className="p-8 text-sm text-ink-400">Inga meddelanden i den valda vyn.</p>
              ) : visible.map((item) => {
                const priority = item.priority || "normal";
                return (
                  <article key={item.id} className={`p-5 ${item.read ? "bg-white" : "bg-[#FBFBF7]"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityClass[priority]}`}>{priorityLabel[priority]}</span>
                          {!item.read ? <span className="h-2 w-2 rounded-full bg-petroleum-600" aria-label="Oläst" /> : null}
                        </div>
                        <h3 className="mt-3 text-base font-semibold text-ink-950">{item.title || "Meddelande"}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-600">{item.message}</p>
                        <p className="mt-3 text-xs text-ink-400">{item.audience || "Alla användare"} · {item.author_name || "Revalta"} · {new Date(item.created_at).toLocaleString("sv-SE")}</p>
                      </div>
                      {!item.read ? <button onClick={() => markRead(item.notificationId)} className="shrink-0 rounded-lg border border-sand-200 px-3 py-2 text-xs font-semibold text-petroleum-800 hover:bg-sand-50">Markera som läst</button> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
            <div className="border-b border-sand-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink-950">Senaste aktivitet</h2>
            </div>
            <div className="divide-y divide-sand-200">
              {events.length === 0 ? <p className="p-8 text-sm text-ink-400">Ingen aktivitet registrerad ännu.</p> : events.slice(0, 12).map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{eventTitle(event)}</p>
                    <p className="mt-1 text-xs text-ink-400">{event.entityType} · {event.action}</p>
                  </div>
                  <time className="shrink-0 text-xs text-ink-400">{new Date(event.created_at).toLocaleDateString("sv-SE")}</time>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
