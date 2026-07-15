"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Send, ServerCog, WalletCards } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type Attempt = { id: string; attemptNumber: number; status: string; errorCode: string | null; errorMessage: string | null; durationMs: number | null; createdAt: string };
type SyncJob = { id: string; provider: string; operation: string; status: string; attempt_count: number; max_attempts: number; next_attempt_at: string | null; last_error_code: string | null; last_error_message: string | null; external_reference: string | null; completed_at: string | null; created_at: string; attempts: Attempt[] };
type Data = { draft: { draft_number: string; status: string; sync_status: string; external_system: string | null; external_invoice_number: string | null; last_reconciled_at: string | null; last_external_status: string | null; payment_reference: string | null; last_synced_at: string | null; last_sync_error: string | null; paid_at: string | null; invoiced_at: string | null; cancelled_at: string | null }; jobs: SyncJob[] };

const providerLabels: Record<string, string> = { fortnox: "Fortnox", visma: "Visma eEkonomi", generic: "Generisk webhook" };
const statusLabels: Record<string, string> = { queued: "Köad", processing: "Bearbetas", retrying: "Väntar på nytt försök", completed: "Synkroniserad", failed: "Misslyckad", cancelled: "Annullerad" };
const invoiceStatusLabels: Record<string, string> = { draft: "Utkast", exported: "Exporterat", sent: "Skickat", invoiced: "Fakturerat", paid: "Betalt", cancelled: "Annullerat" };
const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string | null) {
  if (!value) return "Inte ännu";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Inte ännu" : dateTime.format(parsed);
}

export function WorkOrderAccountingSyncPanel({ workOrderId }: { workOrderId: string }) {
  const endpoint = `/api/work-orders/${workOrderId}/accounting-sync`;
  const [data, setData] = useState<Data | null>(null);
  const [provider, setProvider] = useState("fortnox");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte hämta integrationsstatus");
      setData(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte hämta integrationsstatus"); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function queueSync() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte köa ekonomisynk");
      setSuccess(`Underlaget har köats för ${providerLabels[provider]}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunde inte köa ekonomisynk"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar ekonomiintegration" />;
  if (!data) return <InlineAlert tone="error">{error || "Integrationsinformation saknas"}</InlineAlert>;
  const latest = data.jobs[0] || null;
  const active = latest && ["queued", "processing", "retrying"].includes(latest.status);
  const canQueue = ["exported", "sent", "invoiced"].includes(data.draft.status) && !active && latest?.status !== "completed";

  return <Panel title="Ekonomisystem" description="Säker köad synkronisering, webhookmottagning och automatisk statusavstämning.">
    <div aria-live="polite">{(error || success) ? <InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert> : null}</div>

    <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Extern fakturastatus">
      <article className="rounded-2xl border border-sand-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Fakturastatus</p><p className="mt-2 font-semibold text-ink-950">{invoiceStatusLabels[data.draft.status] || data.draft.status}</p></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Extern status</p><p className="mt-2 font-semibold text-ink-950">{data.draft.last_external_status || "Inte avstämd"}</p></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Senast avstämd</p><p className="mt-2 font-semibold text-ink-950">{formatDate(data.draft.last_reconciled_at)}</p></article>
      <article className="rounded-2xl border border-sand-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Betalningsreferens</p><p className="mt-2 break-all font-semibold text-ink-950">{data.draft.payment_reference || "Saknas"}</p></article>
    </section>

    {data.draft.paid_at ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-petroleum-200 bg-petroleum-50 p-4 text-petroleum-900"><WalletCards className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Fakturan är registrerad som betald</p><p className="mt-1 text-sm">Betalningen bekräftades {formatDate(data.draft.paid_at)} och arbetsordern kan stängas automatiskt.</p></div></div> : null}

    <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-2xl border border-sand-200 bg-sand-50/70 p-5">
        <div className="flex items-start gap-3"><ServerCog className="mt-0.5 h-5 w-5 text-petroleum-700" /><div><h3 className="font-semibold text-ink-950">Skicka fakturaunderlag</h3><p className="mt-1 text-sm leading-6 text-ink-500">API-nycklar lagras endast i Vercel. Webbläsaren köar jobbet men får aldrig tillgång till autentiseringsuppgifter.</p></div></div>
        <label className="mt-4 block space-y-1.5 text-sm text-ink-600"><span>Ekonomisystem</span><select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={!canQueue || saving} className={premiumFieldClass}><option value="fortnox">Fortnox</option><option value="visma">Visma eEkonomi</option><option value="generic">Generisk webhook</option></select></label>
        <button type="button" onClick={() => void queueSync()} disabled={!canQueue || saving} className={`${premiumPrimaryButtonClass} mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50`}><Send className="mr-2 inline h-4 w-4" />{saving ? "Köar…" : active ? "Synk pågår" : latest?.status === "completed" ? "Redan synkroniserad" : "Köa säker synk"}</button>
        {!canQueue && !active && latest?.status !== "completed" ? <p className="mt-3 text-xs text-amber-700">Faktureringsunderlaget måste först exporteras eller markeras som skickat.</p> : null}
      </div>

      <div className="rounded-2xl border border-sand-200 bg-white p-5">
        {!latest ? <div className="flex min-h-40 items-center justify-center text-center"><div><ServerCog className="mx-auto h-8 w-8 text-ink-300" /><p className="mt-3 font-semibold text-ink-800">Ingen synk har köats</p><p className="mt-1 text-sm text-ink-500">Välj ekonomisystem när fakturaunderlaget är klart.</p></div></div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Senaste synk</p><p className="mt-1 text-lg font-semibold text-ink-950">{providerLabels[latest.provider] || latest.provider}</p><p className="mt-1 text-sm text-ink-500">{dateTime.format(new Date(latest.created_at))}</p></div><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${latest.status === "completed" ? "bg-petroleum-50 text-petroleum-800" : latest.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{latest.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : latest.status === "failed" ? <AlertTriangle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{statusLabels[latest.status] || latest.status}</span></div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-sand-50 p-3"><dt className="text-xs text-ink-400">Försök</dt><dd className="mt-1 font-semibold text-ink-900">{latest.attempt_count}/{latest.max_attempts}</dd></div><div className="rounded-xl bg-sand-50 p-3"><dt className="text-xs text-ink-400">Extern referens</dt><dd className="mt-1 font-semibold text-ink-900">{latest.external_reference || data.draft.external_invoice_number || "Ej tilldelad"}</dd></div></dl>
          {latest.last_error_message ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">{latest.last_error_code || "Synkfel"}</p><p className="mt-1 leading-6">{latest.last_error_message}</p>{latest.next_attempt_at && latest.status === "retrying" ? <p className="mt-2 flex items-center gap-2 text-xs"><RefreshCw className="h-3.5 w-3.5" />Nytt försök tidigast {dateTime.format(new Date(latest.next_attempt_at))}</p> : null}</div> : null}
          {latest.attempts.length ? <div className="mt-5 border-t border-sand-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Försökshistorik</p><div className="mt-3 space-y-2">{latest.attempts.slice(0, 5).map((attempt) => <div key={attempt.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-600">Försök {attempt.attemptNumber} · {attempt.status === "completed" ? "Klart" : attempt.status === "failed" ? "Fel" : "Startat"}</span><span className="text-xs text-ink-400">{attempt.durationMs != null ? `${attempt.durationMs} ms` : dateTime.format(new Date(attempt.createdAt))}</span></div>)}</div></div> : null}
        </>}
      </div>
    </div>
  </Panel>;
}
