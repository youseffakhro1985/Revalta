"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { readResponseJson } from "@/lib/fetch-json";

type Props = { workOrderId: string };

type ReconciliationJob = {
  jobId: string;
  provider: string;
  status: string;
  attempt?: number;
  processingStartedAt?: string | null;
  externalId?: string | null;
  reconciliationEligible?: boolean;
  source?: "table" | "legacy";
};

type IntegrationPayload = {
  jobs?: ReconciliationJob[];
  canManage?: boolean;
  error?: string;
};

type Draft = { note: string; externalId: string };

const providerLabels: Record<string, string> = {
  fortnox: "Fortnox",
  visma: "Visma",
  webhook: "Webhook",
};

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });

export function InvoiceExportReconciliationPanel({ workOrderId }: Props) {
  const [jobs, setJobs] = useState<ReconciliationJob[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/invoice-integration`, { cache: "no-store" });
      const payload = await readResponseJson<IntegrationPayload>(response);
      if (!response.ok) {
        if (response.status === 403) {
          setJobs([]);
          return;
        }
        throw new Error(payload.error || "Kunde inte hämta exportavstämning");
      }
      if (!payload.canManage) {
        setJobs([]);
        return;
      }
      const eligible = (payload.jobs || []).filter((job) => job.source !== "legacy" && job.status === "processing" && job.reconciliationEligible === true);
      setJobs(eligible);
      setDrafts((current) => {
        const next = { ...current };
        for (const job of eligible) next[job.jobId] ??= { note: "", externalId: job.externalId || "" };
        return next;
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte hämta exportavstämning");
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => jobs.length > 0, [jobs]);

  async function reconcile(job: ReconciliationJob, resolution: "sent" | "failed") {
    const draft = drafts[job.jobId] || { note: "", externalId: "" };
    const note = draft.note.trim();
    if (note.length < 10) {
      setError("Beskriv hur exporten kontrollerades hos leverantören, minst 10 tecken.");
      return;
    }
    if (resolution === "sent" && !window.confirm("Bekräfta endast som skickad efter att fakturan har kontrollerats hos leverantören. Fortsätta?")) return;
    if (resolution === "failed" && !window.confirm("Bekräfta endast som misslyckad när du har kontrollerat att ingen faktura skapades hos leverantören. Fortsätta?")) return;

    setSavingJobId(job.jobId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/invoice-integration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconcile",
          jobId: job.jobId,
          resolution,
          note,
          externalId: resolution === "sent" ? draft.externalId.trim() : undefined,
        }),
      });
      const payload = await readResponseJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Kunde inte slutföra avstämningen");
      setSuccess(resolution === "sent"
        ? "Exporten är manuellt avstämd som skickad och revisionsspåret är sparat."
        : "Exporten är manuellt avstämd som misslyckad. Den kan nu återförsökas säkert efter behov.");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte slutföra avstämningen");
    } finally {
      setSavingJobId("");
    }
  }

  if (loading || (!visible && !error && !success)) return null;

  return (
    <Panel
      title="Avstämning av fakturaexport"
      description="Visas endast när en export har varit låst i bearbetning och Revalta inte säkert kan avgöra leverantörens utfall. Ingen faktura skickas om automatiskt härifrån."
    >
      <div className="space-y-4">
        <div aria-live="polite" aria-atomic="true">
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          {!error && success ? <InlineAlert tone="success">{success}</InlineAlert> : null}
        </div>
        {visible ? <div className="space-y-4">
          {jobs.map((job) => {
            const draft = drafts[job.jobId] || { note: "", externalId: "" };
            const saving = savingJobId === job.jobId;
            return <article key={job.jobId} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    <h3 className="font-semibold">Avstämning krävs · {providerLabels[job.provider] || job.provider}</h3>
                  </div>
                  <p className="mt-1 text-sm text-amber-900/80">
                    Jobb {job.jobId}{job.attempt ? ` · försök ${job.attempt}` : ""}{job.processingStartedAt ? ` · startad ${dateTime.format(new Date(job.processingStartedAt))}` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-900">Bearbetas · avstämning krävs</span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="space-y-2 text-sm lg:col-span-2">
                  <span className="font-semibold text-ink-700">Avstämningsnotering</span>
                  <textarea
                    value={draft.note}
                    onChange={(event) => setDrafts((current) => ({ ...current, [job.jobId]: { ...draft, note: event.target.value } }))}
                    minLength={10}
                    maxLength={1000}
                    rows={3}
                    placeholder="Exempel: Kontrollerad i Fortnox. Fakturan finns med externt nummer ..."
                    className={premiumFieldClass}
                    disabled={saving}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-ink-700">Externt ID / fakturanummer <span className="font-normal text-ink-500">(valfritt)</span></span>
                  <input
                    value={draft.externalId}
                    onChange={(event) => setDrafts((current) => ({ ...current, [job.jobId]: { ...draft, externalId: event.target.value } }))}
                    maxLength={200}
                    placeholder="Till exempel FTX-12345"
                    className={premiumFieldClass}
                    disabled={saving}
                  />
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <button type="button" disabled={saving || draft.note.trim().length < 10} onClick={() => void reconcile(job, "sent")} className={premiumPrimaryButtonClass}>
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    Bekräfta skickad
                  </button>
                  <button type="button" disabled={saving || draft.note.trim().length < 10} onClick={() => void reconcile(job, "failed")} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Bekräfta misslyckad
                  </button>
                </div>
              </div>
            </article>;
          })}
        </div> : null}
      </div>
    </Panel>
  );
}
