"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck } from "lucide-react";
import {
  EmptyState,
  InlineAlert,
  MetricCard,
  PageHeader,
  Panel,
  premiumFieldClass,
  premiumPrimaryButtonClass,
  premiumTextareaClass,
} from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Property = { id: string; name: string; address: string; city: string };
type ChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  hasDeviation: boolean;
  note: string;
  workOrderId: string | null;
};
type Round = {
  id: string;
  title?: string;
  propertyName?: string;
  interval?: string;
  status?: string;
  nextDue?: string;
  checklist?: ChecklistItem[];
  deviations?: number;
  source?: string;
};

const intervalLabels: Record<string, string> = {
  weekly: "Varje vecka",
  monthly: "Varje månad",
  quarterly: "Varje kvartal",
  yearly: "Varje år",
};

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState({
    title: "",
    propertyId: "",
    interval: "monthly",
    checklistText: "Kontrollera entrébelysning\nKontrollera soprum\nKontrollera dörrstängare",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ title: "", interval: "monthly", nextDue: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [rr, pr] = await Promise.all([
        fetch("/api/rounds", { cache: "no-store" }),
        fetch("/api/properties", { cache: "no-store" }),
      ]);
      const [rd, pd] = await Promise.all([readResponseJson(rr), readResponseJson(pr)]);
      if (!rr.ok) throw new Error(rd.error || "Kunde inte hämta ronder");
      if (!pr.ok) throw new Error(pd.error || "Kunde inte hämta fastigheter");
      setRounds(rd.rounds || []);
      setProperties(pd.properties || []);
      setCanManage(Boolean(rd.permissions?.canManage));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta ronder");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const dueSoon = useMemo(
    () => rounds.filter((r) => r.nextDue && new Date(r.nextDue).getTime() < Date.now() + 14 * 86400000).length,
    [rounds],
  );
  const deviations = useMemo(
    () => rounds.reduce((sum, r) => sum + Number(r.deviations || 0), 0),
    [rounds],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const checklist = form.checklistText.split("\n").map((x) => x.trim()).filter(Boolean);
      const r = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          propertyId: form.propertyId,
          interval: form.interval,
          checklist,
        }),
      });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d.error || "Kunde inte skapa rond");
      setForm({ ...form, title: "" });
      setMessage("Ronden har skapats.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa rond");
    } finally {
      setBusy(false);
    }
  }

  function updateLocalChecklist(roundId: string, itemId: string, patch: Partial<ChecklistItem>) {
    setRounds((current) => current.map((round) => {
      if (round.id !== roundId || !round.checklist) return round;
      const checklist = round.checklist.map((item) => item.id === itemId ? { ...item, ...patch } : item);
      return {
        ...round,
        checklist,
        deviations: checklist.filter((item) => item.hasDeviation).length,
      };
    }));
  }

  async function saveRound(round: Round) {
    if (round.source === "legacy") {
      setError("Äldre ronder måste migreras innan de kan uppdateras. Kör backfill och ladda om.");
      return;
    }
    setSavingId(round.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: round.checklist }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte spara ronden");
      setMessage("Ronden har uppdaterats.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara ronden");
    } finally {
      setSavingId("");
    }
  }

  function startEdit(round: Round) {
    if (round.source === "legacy") {
      setError("Äldre ronder måste migreras innan de kan ändras. Kör backfill och ladda om.");
      return;
    }
    setEditingId(round.id);
    setEditForm({
      title: round.title || "",
      interval: round.interval || "monthly",
      nextDue: round.nextDue ? new Date(round.nextDue).toISOString().slice(0, 10) : "",
    });
    setError("");
  }

  async function saveFields(round: Round) {
    if (round.source === "legacy") {
      setError("Äldre ronder måste migreras innan de kan ändras.");
      return;
    }
    setSavingId(round.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          interval: editForm.interval,
          nextDue: editForm.nextDue ? new Date(`${editForm.nextDue}T12:00:00`).toISOString() : undefined,
        }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera ronden");
      setEditingId("");
      setMessage("Rondens uppgifter är uppdaterade.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte uppdatera ronden");
    } finally {
      setSavingId("");
    }
  }

  async function createWorkOrders(round: Round) {
    if (round.source === "legacy") {
      setError("Äldre ronder måste migreras innan arbetsorder kan skapas.");
      return;
    }
    const open = (round.checklist || []).filter((item) => item.hasDeviation && !item.workOrderId);
    if (!open.length) {
      setError("Markera minst en avvikelse utan arbetsorder.");
      return;
    }
    setSavingId(round.id);
    setError("");
    setMessage("");
    try {
      const saveResponse = await fetch(`/api/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: round.checklist }),
      });
      const saveData = await readResponseJson(saveResponse);
      if (!saveResponse.ok) throw new Error(saveData.error || "Kunde inte spara ronden");

      const response = await fetch(`/api/rounds/${round.id}/work-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: open.map((item) => item.id) }),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte skapa arbetsorder");
      setMessage(`${data.created?.length || 0} arbetsorder skapades från rondavvikelser.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa arbetsorder");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Drift och tillsyn"
        title="Ronder och checklistor"
        description="Planera återkommande tillsyn, följ kontrollpunkter och skapa arbetsorder från avvikelser."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={ClipboardCheck} label="Aktiva ronder" value={rounds.length} />
        <MetricCard icon={CalendarClock} label="Snart förfallna" value={dueSoon} />
        <MetricCard icon={AlertTriangle} label="Avvikelser" value={deviations} />
      </section>
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {!canManage && !loading ? <InlineAlert tone="info">Du har läsbehörighet. Förvaltare eller administratör kan skapa ronder, uppdatera checklistor och skapa arbetsorder.</InlineAlert> : null}
      <section className={`grid gap-6 ${canManage ? "xl:grid-cols-[380px_1fr]" : "grid-cols-1"}`}>
        {canManage ? (
          <Panel title="Skapa rond" description="Definiera intervall och kontrollpunkter för en fastighet.">
            <form onSubmit={submit} className="space-y-4">
              <Field label="Namn">
                <input required className={premiumFieldClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. Veckorond Brf Solgläntan" />
              </Field>
              <Field label="Fastighet">
                <select required className={premiumFieldClass} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
                  <option value="">Välj fastighet</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name} – {p.city}</option>)}
                </select>
              </Field>
              <Field label="Intervall">
                <select className={premiumFieldClass} value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
                  <option value="weekly">Varje vecka</option>
                  <option value="monthly">Varje månad</option>
                  <option value="quarterly">Varje kvartal</option>
                  <option value="yearly">Varje år</option>
                </select>
              </Field>
              <Field label="Kontrollpunkter">
                <textarea rows={7} className={premiumTextareaClass} value={form.checklistText} onChange={(e) => setForm({ ...form, checklistText: e.target.value })} />
                <span className="mt-1.5 block text-xs text-ink-400">En kontrollpunkt per rad.</span>
              </Field>
              <button disabled={busy} className={`${premiumPrimaryButtonClass} w-full`}>{busy ? "Sparar…" : "Skapa rond"}</button>
            </form>
          </Panel>
        ) : null}
        <Panel title="Planerade ronder" description="Samlad kontrollplan för hela beståndet." bodyClassName="p-0">
          {loading ? (
            <div className="p-8 text-sm text-ink-500">Hämtar ronder…</div>
          ) : rounds.length === 0 ? (
            <EmptyState title="Inga ronder skapade" description="Skapa en rond för att börja arbeta med återkommande tillsyn." />
          ) : (
            <div className="divide-y divide-sand-100">
              {rounds.map((r) => {
                const done = r.checklist?.filter((i) => i.completed).length || 0;
                const total = r.checklist?.length || 0;
                const openDeviations = r.checklist?.filter((i) => i.hasDeviation && !i.workOrderId).length || 0;
                return (
                  <article key={r.id} className="p-6 transition hover:bg-sand-50/60">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-ink-900">{r.title}</h3>
                        <p className="mt-1 text-sm text-ink-500">{r.propertyName} · {intervalLabels[r.interval || "monthly"]}</p>
                        {r.source === "legacy" ? (
                          <p className="mt-2 text-xs font-medium text-amber-800">
                            Äldre rad – kör backfill innan checklista och status kan sparas.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-sand-200 bg-sand-50 px-3 py-1 text-xs font-semibold text-ink-600">
                          {r.status === "completed" ? "Genomförd" : r.status === "in_progress" ? "Pågående" : "Planerad"}
                        </span>
                        {canManage && r.source !== "legacy" ? (
                          <button
                            type="button"
                            onClick={() => (editingId === r.id ? setEditingId("") : startEdit(r))}
                            className="rounded-xl border border-sand-300 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-sand-50"
                          >
                            {editingId === r.id ? "Stäng" : "Ändra"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {canManage && editingId === r.id ? (
                      <div className="mt-4 grid gap-3 rounded-xl border border-sand-200 bg-sand-50/60 p-4 sm:grid-cols-3">
                        <input
                          className={premiumFieldClass}
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="Titel"
                        />
                        <select
                          className={premiumFieldClass}
                          value={editForm.interval}
                          onChange={(e) => setEditForm({ ...editForm, interval: e.target.value })}
                        >
                          <option value="weekly">Varje vecka</option>
                          <option value="monthly">Varje månad</option>
                          <option value="quarterly">Varje kvartal</option>
                          <option value="yearly">Varje år</option>
                        </select>
                        <input
                          type="date"
                          className={premiumFieldClass}
                          value={editForm.nextDue}
                          onChange={(e) => setEditForm({ ...editForm, nextDue: e.target.value })}
                        />
                        <button
                          type="button"
                          disabled={savingId === r.id}
                          onClick={() => void saveFields(r)}
                          className="rounded-xl bg-petroleum-800 px-3 py-2 text-xs font-semibold text-white hover:bg-petroleum-900 sm:col-span-3"
                        >
                          {savingId === r.id ? "Sparar…" : "Spara uppgifter"}
                        </button>
                      </div>
                    ) : null}
                    <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                      <Mini label="Nästa datum" value={r.nextDue ? new Date(r.nextDue).toLocaleDateString("sv-SE") : "Ej satt"} />
                      <Mini label="Kontrollpunkter" value={`${done}/${total}`} />
                      <Mini label="Avvikelser" value={String(r.deviations || 0)} />
                    </div>
                    {r.checklist?.length ? (
                      <div className="mt-5 space-y-3">
                        {r.checklist.map((item) => (
                          <div key={item.id} className="rounded-xl border border-sand-200 bg-white p-3">
                            {canManage ? (
                              <>
                                <div className="flex flex-wrap items-center gap-3">
                                  <label className="inline-flex items-center gap-2 text-sm font-medium text-ink-800">
                                    <input
                                      type="checkbox"
                                      checked={item.completed}
                                      onChange={(e) => updateLocalChecklist(r.id, item.id, { completed: e.target.checked })}
                                    />
                                    {item.label}
                                  </label>
                                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-800">
                                    <input
                                      type="checkbox"
                                      checked={item.hasDeviation}
                                      onChange={(e) => updateLocalChecklist(r.id, item.id, {
                                        hasDeviation: e.target.checked,
                                        note: e.target.checked ? item.note : "",
                                      })}
                                    />
                                    Avvikelse
                                  </label>
                                  {item.workOrderId ? (
                                    <span className="text-xs font-semibold text-emerald-800">Arbetsorder skapad</span>
                                  ) : null}
                                </div>
                                {item.hasDeviation ? (
                                  <input
                                    value={item.note}
                                    onChange={(e) => updateLocalChecklist(r.id, item.id, { note: e.target.value })}
                                    placeholder="Beskriv avvikelsen"
                                    className={`${premiumFieldClass} mt-3`}
                                  />
                                ) : null}
                              </>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-medium text-ink-800">{item.label}</p>
                                  {item.completed ? <span className="rounded-full bg-petroleum-50 px-2 py-0.5 text-xs font-semibold text-petroleum-800">Utförd</span> : null}
                                  {item.hasDeviation ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Avvikelse</span> : null}
                                  {item.workOrderId ? <span className="text-xs font-semibold text-emerald-800">Arbetsorder skapad</span> : null}
                                </div>
                                {item.hasDeviation && item.note ? <p className="mt-2 text-xs text-ink-500">{item.note}</p> : null}
                              </>
                            )}
                          </div>
                        ))}
                        {canManage ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => void saveRound(r)}
                              className="rounded-xl border border-sand-300 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-sand-50"
                            >
                              {savingId === r.id ? "Sparar…" : "Spara kontroll"}
                            </button>
                            {openDeviations > 0 ? (
                              <button
                                type="button"
                                disabled={savingId === r.id}
                                onClick={() => void createWorkOrders(r)}
                                className="rounded-xl bg-petroleum-800 px-3 py-2 text-xs font-semibold text-white hover:bg-petroleum-900"
                              >
                                Skapa arbetsorder ({openDeviations})
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>{children}</label>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-ink-400">{label}</p><p className="mt-1 font-semibold text-ink-800">{value}</p></div>;
}
