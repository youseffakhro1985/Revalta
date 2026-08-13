"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, ExternalLink, LockKeyhole, RefreshCw, Search, ShieldCheck, UnlockKeyhole, UserRound } from "lucide-react";
import { InlineAlert, MetricCard, PageHeader, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type ActiveLock = {
  workOrderId: string;
  workOrderNumber: string | null;
  title: string;
  status: string;
  priority: string;
  property: { id: string; name: string; address: string };
  holder: { id: string; name: string | null; email: string };
  acquiredAt: string;
  expiresAt: string;
  updatedAt: string;
  remainingSeconds: number;
};

type ResponseData = {
  locks: ActiveLock[];
  removedExpired: number;
  canForceRelease: boolean;
  generatedAt: string;
};

const statusLabels: Record<string, string> = {
  new: "Ny", planned: "Planerad", in_progress: "Pågående", waiting_material: "Väntar material",
  blocked: "Blockerad", completed: "Slutförd", invoiced: "Fakturerad", cancelled: "Avbruten",
};
const priorityLabels: Record<string, string> = { low: "Låg", normal: "Normal", high: "Hög", urgent: "Akut" };
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function remainingLabel(seconds: number) {
  if (seconds <= 0) return "Löper ut nu";
  if (seconds < 60) return `${seconds} sekunder`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minut" : "minuter"}`;
}

export default function WorkOrderEditLocksPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<ActiveLock | null>(null);
  const [reason, setReason] = useState("");
  const [releasing, setReleasing] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/work-orders/edit-locks", { cache: "no-store" });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Kunde inte hämta redigeringslåsen");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta redigeringslåsen");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    reasonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setReason("");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [reasonRef.current, cancelRef.current, confirmRef.current].filter(
        (el): el is HTMLElement => Boolean(el) && !(el as HTMLButtonElement | HTMLTextAreaElement).disabled
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    if (!normalized) return data?.locks || [];
    return (data?.locks || []).filter((lock) => [
      lock.workOrderNumber, lock.title, lock.property.name, lock.property.address,
      lock.holder.name, lock.holder.email, statusLabels[lock.status], priorityLabels[lock.priority],
    ].some((value) => value?.toLocaleLowerCase("sv-SE").includes(normalized)));
  }, [data, query]);

  async function forceRelease() {
    if (!selected || !reason.trim()) return;
    setReleasing(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/work-orders/edit-locks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: selected.workOrderId, reason: reason.trim() }),
      });
      const body = await readResponseJson(response);
      if (!response.ok) throw new Error(body.error || "Låset kunde inte frigöras");
      setSuccess(`Redigeringslåset för ${selected.workOrderNumber || selected.title} har frigjorts och åtgärden är revisionsloggad.`);
      setSelected(null); setReason("");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Låset kunde inte frigöras");
    } finally { setReleasing(false); }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-sand-100" />;

  const locks = data?.locks || [];
  const expiringSoon = locks.filter((lock) => lock.remainingSeconds <= 60).length;
  const editors = new Set(locks.map((lock) => lock.holder.id)).size;

  return <div className="space-y-8">
    <PageHeader eyebrow="Work Orders 2.0" title="Aktiva redigeringslås" description="Operativ överblick över exklusiva arbetsorderlås, aktiva redigerare och återstående leasetid." />
    {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    {success ? <InlineAlert tone="success">{success}</InlineAlert> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={LockKeyhole} label="Aktiva lås" value={locks.length} hint="I den egna organisationen" />
      <MetricCard icon={UserRound} label="Aktiva redigerare" value={editors} hint="Unika användare" />
      <MetricCard icon={Clock3} label="Löper ut snart" value={expiringSoon} hint="Inom 60 sekunder" />
      <MetricCard icon={ShieldCheck} label="Utgångna rensade" value={data?.removedExpired || 0} hint="Vid senaste laddningen" />
    </section>

    <Panel title="Driftläge" description="Vyn uppdateras automatiskt var 30:e sekund. Utgångna lås rensas innan resultatet visas.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök arbetsorder, fastighet eller redigerare" aria-label="Sök arbetsorder, fastighet eller redigerare" className={`${premiumFieldClass} pl-10`} /></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 text-sm font-semibold text-petroleum-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Uppdatera</button>
      </div>
      {data?.generatedAt ? <p className="mt-3 text-xs text-ink-500">Senast kontrollerad {dateTime.format(new Date(data.generatedAt))}</p> : null}
    </Panel>

    <Panel title="Låsta arbetsordrar" description={`${filtered.length} av ${locks.length} aktiva lås visas.`}>
      {!filtered.length ? <div className="rounded-xl border border-dashed border-sand-300 p-10 text-center"><UnlockKeyhole className="mx-auto h-7 w-7 text-petroleum-700" /><p className="mt-3 font-semibold text-ink-900">Inga aktiva redigeringslås</p><p className="mt-1 text-sm text-ink-500">Arbetsordrar är tillgängliga för behöriga redigerare.</p></div> : <div className="space-y-3">{filtered.map((lock) => <article key={lock.workOrderId} className="grid gap-4 rounded-2xl border border-sand-200 bg-white p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,.8fr)_auto] lg:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-petroleum-50 px-2.5 py-1 text-xs font-semibold text-petroleum-800">{lock.workOrderNumber || "Äldre arbetsorder"}</span><span className="text-xs font-semibold text-ink-500">{statusLabels[lock.status] || lock.status} · {priorityLabels[lock.priority] || lock.priority}</span></div><h2 className="mt-3 font-semibold text-ink-950">{lock.title}</h2><p className="mt-1 text-sm text-ink-500">{lock.property.name} · {lock.property.address}</p></div>
        <div><p className="font-semibold text-ink-900">{lock.holder.name || lock.holder.email}</p><p className="mt-1 text-sm text-ink-500">{lock.holder.email}</p><p className={`mt-2 text-sm font-semibold ${lock.remainingSeconds <= 60 ? "text-amber-800" : "text-emerald-800"}`}>Återstår {remainingLabel(lock.remainingSeconds)}</p><p className="mt-1 text-xs text-ink-500">Låst {dateTime.format(new Date(lock.acquiredAt))}</p></div>
        <div className="flex flex-wrap gap-2 lg:justify-end"><Link href={`/dashboard/arbetsorder/${lock.workOrderId}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sand-200 px-3 text-sm font-semibold text-petroleum-800"><ExternalLink className="h-4 w-4" />Öppna</Link>{data?.canForceRelease ? <button type="button" onClick={() => { setSelected(lock); setReason(""); setSuccess(""); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800"><UnlockKeyhole className="h-4 w-4" />Frigör</button> : null}</div>
      </article>)}</div>}
    </Panel>

    {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="release-lock-title"><div className="w-full max-w-lg rounded-2xl border border-sand-200 bg-white p-6 shadow-2xl"><h2 id="release-lock-title" className="text-xl font-semibold text-ink-950">Frigör redigeringslås</h2><p className="mt-2 text-sm text-ink-600">Du frigör låset för <strong>{selected.workOrderNumber || selected.title}</strong>. {selected.holder.name || selected.holder.email} kan förlora osparade ändringar.</p><label className="mt-5 block space-y-2"><span className="text-sm font-semibold text-ink-700">Dokumenterad orsak *</span><textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className={`${premiumFieldClass} min-h-28`} placeholder="Beskriv varför administrativ frigöring krävs" /></label><div className="mt-5 flex justify-end gap-3"><button ref={cancelRef} type="button" onClick={() => { setSelected(null); setReason(""); }} disabled={releasing} className="rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-semibold text-ink-700">Avbryt</button><button ref={confirmRef} type="button" onClick={() => void forceRelease()} disabled={releasing || !reason.trim()} className={`${premiumPrimaryButtonClass} bg-red-800 hover:bg-red-900`}>{releasing ? "Frigör…" : "Frigör och revisionslogga"}</button></div></div></div> : null}
  </div>;
}
