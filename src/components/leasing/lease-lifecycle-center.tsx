"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, History, LogIn, LogOut, RefreshCw, RotateCcw, XCircle } from "lucide-react";

const statusLabels: Record<string, string> = { draft: "Utkast", reserved: "Reserverad", active: "Aktivt", notice: "Uppsagt", ended: "Avslutat", cancelled: "Makulerat" };
const actionLabels: Record<string, string> = { reserve: "Reservera objekt", activate: "Registrera inflyttning", give_notice: "Registrera uppsägning", withdraw_notice: "Återta uppsägning", end: "Registrera avflyttning", cancel: "Makulera avtal" };
const actionIcons = { reserve: CalendarClock, activate: LogIn, give_notice: CalendarClock, withdraw_notice: RotateCcw, end: LogOut, cancel: XCircle };
const actionsByStatus: Record<string, string[]> = { draft: ["reserve", "activate", "cancel"], reserved: ["activate", "cancel"], active: ["give_notice", "end"], notice: ["withdraw_notice", "end"] };

type Lease = { id: string; lease_number: string; status: string; start_date?: string | null; notice_date?: string | null; end_date?: string | null; property: { name: string }; unit: { designation: string }; lease_holder: { name: string } };
type HistoryItem = { id: string; action: string; metadata: Record<string, unknown> | null; created_at: string; actor: { name: string | null; email: string } | null };

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function today() { return new Date().toISOString().slice(0, 10); }
function historyLabel(action: string) { return actionLabels[action.replace("lease.lifecycle.", "")] || action; }

export function LeaseLifecycleCenter() {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadLeases(preferredId?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/leases", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta avtal");
      const items = (data.leases || []) as Lease[];
      setLeases(items);
      setCanManage(Boolean(data.permissions?.canManage));
      const nextId = preferredId && items.some((item) => item.id === preferredId) ? preferredId : selectedId && items.some((item) => item.id === selectedId) ? selectedId : items[0]?.id || "";
      setSelectedId(nextId);
      if (nextId) await loadHistory(nextId);
      else setHistory([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta avtal");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(id: string) {
    const response = await fetch(`/api/leases/${id}/lifecycle`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Kunde inte hämta avtalshistorik");
    setHistory(data.history || []);
    setCanManage(Boolean(data.permissions?.canManage));
  }

  useEffect(() => { void loadLeases(); }, []);

  const selected = useMemo(() => leases.find((item) => item.id === selectedId) || null, [leases, selectedId]);
  const availableActions = selected ? actionsByStatus[selected.status] || [] : [];

  async function chooseLease(id: string) {
    setSelectedId(id); setAction(""); setError(""); setMessage("");
    try { await loadHistory(id); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta historik"); }
  }

  async function execute() {
    if (!selected || !action) return;
    if (!window.confirm(`${actionLabels[action]} för avtal ${selected.lease_number}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/leases/${selected.id}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, effectiveDate, note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte genomföra åtgärden");
      setMessage(`${actionLabels[action]} har registrerats.`);
      setAction(""); setNote(""); setEffectiveDate(today());
      await loadLeases(selected.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunde inte genomföra åtgärden");
    } finally { setBusy(false); }
  }

  return <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-premium-sm">
    <div className="flex flex-col gap-4 border-b border-sand-100 bg-sand-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-petroleum-50 p-3 text-petroleum-700"><History className="h-5 w-5" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Avtalslivscykel</p><h2 className="mt-1 text-lg font-semibold text-ink-950">Inflyttning, uppsägning och avflyttning</h2><p className="mt-1 text-sm text-ink-500">Styrda åtgärder med datum, behörighet och full historik.</p></div></div>
      <button type="button" onClick={() => void loadLeases(selectedId)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Uppdatera</button>
    </div>
    {error ? <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-900">{error}</div> : null}
    {message ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900">{message}</div> : null}
    <div className="grid gap-0 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="border-b border-sand-100 p-5 xl:border-b-0 xl:border-r">
        <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Avtal<select value={selectedId} onChange={(event) => void chooseLease(event.target.value)} className="mt-2 block w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-900"><option value="">Välj avtal</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.lease_number} · {lease.property.name} · {lease.unit.designation}</option>)}</select></label>
        {loading && !selected ? <div className="mt-5 h-44 animate-pulse rounded-2xl bg-sand-50" /> : selected ? <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-sand-200 bg-sand-50/70 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-ink-950">{selected.lease_holder.name}</p><p className="mt-1 text-sm text-ink-500">{selected.property.name} · {selected.unit.designation}</p></div><span className="rounded-full border border-sand-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700">{statusLabels[selected.status] || selected.status}</span></div></div>
          {canManage && availableActions.length ? <><div className="grid gap-2 sm:grid-cols-2">{availableActions.map((item) => { const Icon = actionIcons[item as keyof typeof actionIcons] || CheckCircle2; return <button key={item} type="button" onClick={() => setAction(item)} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${action === item ? "border-petroleum-500 bg-petroleum-50 text-petroleum-900" : "border-sand-200 text-ink-700 hover:bg-sand-50"}`}><Icon className="h-4 w-4" />{actionLabels[item]}</button>; })}</div>{action ? <div className="rounded-2xl border border-petroleum-100 bg-petroleum-50/60 p-4"><label className="block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Gäller från<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm" /></label><label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Anteckning<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-2 block w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm" placeholder="Valfri intern notering" /></label><button type="button" onClick={() => void execute()} disabled={busy || !effectiveDate} className="mt-3 w-full rounded-xl bg-petroleum-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Registrerar…" : actionLabels[action]}</button></div> : null}</> : <p className="rounded-xl bg-sand-50 px-4 py-3 text-sm text-ink-500">{canManage ? "Avtalet har nått en avslutad status." : "Du har läsbehörighet till livscykeln."}</p>}
        </div> : <p className="mt-5 rounded-xl bg-sand-50 px-4 py-8 text-center text-sm text-ink-500">Inga avtal finns registrerade.</p>}
      </div>
      <div className="p-5"><div className="mb-4"><h3 className="font-semibold text-ink-950">Händelsehistorik</h3><p className="mt-1 text-sm text-ink-500">Alla livscykelåtgärder sparas med användare och tidpunkt.</p></div>{history.length ? <div className="space-y-3">{history.map((item) => <article key={item.id} className="rounded-xl border border-sand-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-900">{historyLabel(item.action)}</p><p className="mt-1 text-sm text-ink-500">{item.actor?.name || item.actor?.email || "System"}</p></div><time className="shrink-0 text-xs text-ink-400">{dateFormatter.format(new Date(item.created_at))}</time></div>{typeof item.metadata?.note === "string" && item.metadata.note ? <p className="mt-3 rounded-lg bg-sand-50 px-3 py-2 text-sm text-ink-600">{item.metadata.note}</p> : null}</article>)}</div> : <div className="rounded-2xl border border-dashed border-sand-200 px-5 py-10 text-center text-sm text-ink-500">Ingen livscykelhändelse registrerad ännu.</div>}</div>
    </div>
  </section>;
}
