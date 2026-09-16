"use client";

import { readResponseJson } from "@/lib/fetch-json";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, History, LockKeyhole, PauseCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";
import { useOptionalWorkOrderEditLock } from "@/components/dashboard/work-order-edit-lock-provider";

type SlaRisk = "overdue" | "critical" | "soon" | "normal" | "fulfilled" | "paused" | "not_configured";
type SlaPhase = "response" | "resolution" | "fulfilled" | "paused" | "not_configured";
type Checkpoint = { dueAt: string | null; achievedAt: string | null; breached: boolean; varianceMinutes: number | null };
type SlaEvaluation = { phase: SlaPhase; risk: SlaRisk; label: string; dueAt: string | null; remainingMinutes: number | null; overdueMinutes: number | null; pauseReason: string | null; response: Checkpoint; resolution: Checkpoint };
type Governance = { responseLocked: boolean; resolutionLocked: boolean };
type AuditMetadata = { before?: { responseDueAt?: string | null; resolutionDueAt?: string | null }; after?: { responseDueAt?: string | null; resolutionDueAt?: string | null }; reason?: string };
type AuditEntry = { id: string; createdAt: string; actor: { id: string | null; name: string }; metadata: AuditMetadata | null };
type Props = { workOrderId: string };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const phaseLabels: Record<SlaPhase, string> = { response: "Första respons", resolution: "Lösning", fulfilled: "Hanterad", paused: "Pausad", not_configured: "Saknas" };

function duration(minutes: number | null) {
  if (minutes === null) return "Ingen aktiv nedräkning";
  const absolute = Math.abs(minutes);
  const days = Math.floor(absolute / 1440);
  const hours = Math.floor((absolute % 1440) / 60);
  const mins = absolute % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

function checkpointText(checkpoint: Checkpoint, activeLabel: string) {
  if (!checkpoint.dueAt) return "Ingen avtalad tidsgräns";
  if (!checkpoint.achievedAt) return `${activeLabel} senast ${dateTime.format(new Date(checkpoint.dueAt))}`;
  const variance = checkpoint.varianceMinutes ?? 0;
  if (checkpoint.breached) return `Uppnådd ${duration(variance)} efter tidsgränsen`;
  return `Uppnådd ${duration(Math.abs(variance))} före tidsgränsen`;
}

function riskClasses(risk: SlaRisk) {
  if (risk === "overdue") return "border-danger-200 bg-danger-50 text-danger-800";
  if (risk === "critical") return "border-warning-200 bg-warning-50 text-warning-800";
  if (risk === "soon") return "border-warning-200 bg-warning-50 text-warning-800";
  if (risk === "paused") return "border-sky-200 bg-sky-50 text-sky-800";
  if (risk === "fulfilled") return "border-success-200 bg-success-50 text-success-800";
  if (risk === "not_configured") return "border-sand-200 bg-sand-50 text-ink-700";
  return "border-petroleum-200 bg-petroleum-50 text-petroleum-800";
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function formatDeadline(value?: string | null) {
  return value ? dateTime.format(new Date(value)) : "Ingen deadline";
}

type LockPayload = { error?: string; lock?: { token?: string; version?: string } };

async function releaseLock(workOrderId: string, token: string) {
  try {
    await fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", token }),
    });
  } catch {
    // The SLA write may already have succeeded; a leftover short lease expires on its own.
  }
}

async function acquireLock(workOrderId: string) {
  const lockResponse = await fetch(`/api/work-orders/${workOrderId}/edit-lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "acquire", leaseSeconds: 120 }),
  });
  const lockBody = await readResponseJson<LockPayload>(lockResponse);
  if (lockResponse.status === 423) {
    throw new Error(lockBody.error || "Arbetsordern redigeras av någon annan.");
  }
  if (!lockResponse.ok) throw new Error(lockBody.error || "Kunde inte låsa arbetsordern för redigering");
  const token = String(lockBody.lock?.token || "");
  const version = typeof lockBody.lock?.version === "string" ? lockBody.lock.version : "";
  if (!token || !version) throw new Error("Redigeringslåset saknar token eller version");
  return { token, version };
}

export function WorkOrderSlaDetailPanel({ workOrderId }: Props) {
  const sharedLock = useOptionalWorkOrderEditLock();
  const [sla, setSla] = useState<SlaEvaluation | null>(null);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [governance, setGovernance] = useState<Governance>({ responseLocked: false, resolutionLocked: false });
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [responseDueAt, setResponseDueAt] = useState("");
  const [resolutionDueAt, setResolutionDueAt] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/sla`, { cache: "no-store" });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta SLA-bedömningen");
      setSla(data.sla);
      setEvaluatedAt(data.evaluatedAt || null);
      setCanManage(Boolean(data.canManage));
      setGovernance(data.governance || { responseLocked: false, resolutionLocked: false });
      setAuditHistory(Array.isArray(data.auditHistory) ? data.auditHistory : []);
      setResponseDueAt(toLocalInput(data.sla?.response?.dueAt || null));
      setResolutionDueAt(toLocalInput(data.sla?.resolution?.dueAt || null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta SLA-bedömningen");
    } finally { setLoading(false); }
  }, [workOrderId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== "#spara-sla") return;
    document.getElementById("spara-sla")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, sla]);

  async function saveDeadlines(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    let acquiredToken = "";
    try {
      let editToken = "";
      let version = "";
      if (sharedLock) {
        if (sharedLock.state.status !== "owned") {
          throw new Error(
            sharedLock.state.status === "locked"
              ? `${sharedLock.state.holder.name || sharedLock.state.holder.email} redigerar redan arbetsordern.`
              : "Arbetsordern saknar ett aktivt redigeringslås. Försök låsa den igen.",
          );
        }
        editToken = sharedLock.state.token;
        version = sharedLock.state.version;
      } else {
        const acquired = await acquireLock(workOrderId);
        acquiredToken = acquired.token;
        editToken = acquired.token;
        version = acquired.version;
      }

      const response = await fetch(`/api/work-orders/${workOrderId}/sla`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseDueAt, resolutionDueAt, reason, editToken, version }),
      });
      const data = await readResponseJson<{ error?: string; version?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera SLA-deadlines");
      if (typeof data.version === "string" && data.version) sharedLock?.setVersion(data.version);
      setReason("");
      setSuccess("SLA-deadlines har uppdaterats, omberäknats och registrerats i revisionsloggen.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera SLA-deadlines");
    } finally {
      if (acquiredToken) await releaseLock(workOrderId, acquiredToken);
      setSaving(false);
    }
  }

  const activeText = useMemo(() => {
    if (!sla) return "";
    if (sla.risk === "overdue") return `${duration(sla.overdueMinutes)} försenad`;
    if (sla.remainingMinutes !== null) return `${duration(sla.remainingMinutes)} kvar`;
    if (sla.risk === "paused") return sla.pauseReason || "SLA-nedräkningen är pausad";
    if (sla.risk === "fulfilled") return "Arbetsorderns SLA är avslutad";
    return "Ingen aktiv SLA-tidsgräns";
  }, [sla]);

  if (!loading && error && !sla) return <InlineAlert>{error}</InlineAlert>;
  if (!loading && !sla) return <InlineAlert>SLA-bedömningen saknas</InlineAlert>;

  const emptyCheckpoint: Checkpoint = { dueAt: null, achievedAt: null, breached: false, varianceMinutes: null };
  const view = sla ?? {
    phase: "not_configured" as const,
    risk: "not_configured" as const,
    label: "SLA beräknas",
    dueAt: null,
    remainingMinutes: null,
    overdueMinutes: null,
    pauseReason: null,
    response: emptyCheckpoint,
    resolution: emptyCheckpoint,
  };
  const ActiveIcon = view.risk === "overdue" || view.risk === "critical" ? AlertTriangle : view.risk === "paused" ? PauseCircle : view.risk === "fulfilled" ? CheckCircle2 : ShieldAlert;
  const sharedLockOwned = !sharedLock || sharedLock.state.status === "owned";
  const lockHolder = sharedLock?.state.status === "locked" ? sharedLock.state.holder : null;
  const slaFormLocked = Boolean(canManage && sharedLock && !sharedLockOwned);
  const showForm = canManage || loading;
  const formLocked = saving || loading || slaFormLocked;

  return <Panel title="SLA och leveranssäkerhet" description="Serverberäknad bedömning med behörighetsstyrda deadlines och oföränderligt historiskt utfall.">
    {(error || success) ? <div className="mb-4" aria-live="polite"><InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert></div> : null}
    <div className={`rounded-2xl border p-5 ${riskClasses(view.risk)}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-white/70 p-2"><ActiveIcon className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">Aktuell fas · {phaseLabels[view.phase]}</p><p className="mt-2 text-xl font-semibold">{view.label}</p><p className="mt-1 text-sm font-medium">{activeText || "SLA-bedömningen hämtas"}</p></div></div><div className="text-sm sm:text-right"><p className="font-semibold">{view.dueAt ? dateTime.format(new Date(view.dueAt)) : "Ingen aktiv deadline"}</p>{evaluatedAt ? <p className="mt-1 text-xs opacity-70">Beräknad {dateTime.format(new Date(evaluatedAt))}</p> : null}</div></div></div>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <article className={`rounded-2xl border p-5 ${view.response.breached ? "border-danger-200 bg-danger-50" : "border-sand-200 bg-white"}`}><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-petroleum-700" /><h3 className="font-semibold text-ink-900">Första respons</h3>{governance.responseLocked ? <LockKeyhole className="ml-auto h-4 w-4 text-ink-500" aria-label="Svarstiden är låst" /> : null}</div><p className={`mt-3 text-sm font-semibold ${view.response.breached ? "text-danger-700" : "text-ink-700"}`}>{view.response.achievedAt ? view.response.breached ? "Svarstid överskreds" : "Svarstid uppfylld" : "Inväntar respons"}</p><p className="mt-1 text-sm leading-6 text-ink-500">{checkpointText(view.response, "Svar")}</p>{view.response.achievedAt ? <p className="mt-2 text-xs text-ink-500">Registrerad {dateTime.format(new Date(view.response.achievedAt))}</p> : null}</article>
      <article className={`rounded-2xl border p-5 ${view.resolution.breached ? "border-danger-200 bg-danger-50" : "border-sand-200 bg-white"}`}><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-petroleum-700" /><h3 className="font-semibold text-ink-900">Lösning</h3>{governance.resolutionLocked ? <LockKeyhole className="ml-auto h-4 w-4 text-ink-500" aria-label="Lösningstiden är låst" /> : null}</div><p className={`mt-3 text-sm font-semibold ${view.resolution.breached ? "text-danger-700" : "text-ink-700"}`}>{view.resolution.achievedAt ? view.resolution.breached ? "Lösningstid överskreds" : "Lösningstid uppfylld" : "Inväntar lösning"}</p><p className="mt-1 text-sm leading-6 text-ink-500">{checkpointText(view.resolution, "Lösning")}</p>{view.resolution.achievedAt ? <p className="mt-2 text-xs text-ink-500">Registrerad {dateTime.format(new Date(view.resolution.achievedAt))}</p> : null}</article>
    </div>
    {showForm ? <form id="spara-sla" onSubmit={saveDeadlines} className="mt-5 scroll-mt-36 rounded-2xl border border-sand-200 bg-sand-50/60 p-5"><fieldset disabled={formLocked} className="contents"><div className="mb-4"><h3 className="font-semibold text-ink-900">Styr SLA-deadlines</h3><p className="mt-1 text-sm leading-6 text-ink-500">Status beräknas alltid av servern. Uppnådda kontrollpunkter låses för att bevara historiskt utfall. Ändringar kräver samma redigeringslås som arbetsordern.</p>{slaFormLocked ? <p className="mt-3 text-sm font-medium text-warning-800">{lockHolder ? `${lockHolder.name || lockHolder.email} redigerar redan arbetsordern.` : "Vänta på ett aktivt redigeringslås innan du sparar SLA."}</p> : null}{sharedLock && sharedLock.state.status !== "owned" && sharedLock.state.status !== "acquiring" ? <button type="button" onClick={() => void sharedLock.acquire()} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm font-semibold text-petroleum-800"><RefreshCw className="h-4 w-4" />Försök låsa igen</button> : null}</div><div className="grid gap-4 md:grid-cols-2"><label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Svar senast</span><input autoFocus type="datetime-local" value={responseDueAt} onChange={(event) => setResponseDueAt(event.target.value)} disabled={governance.responseLocked || formLocked} className={premiumFieldClass} /></label><label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Lösning senast</span><input type="datetime-local" value={resolutionDueAt} onChange={(event) => setResolutionDueAt(event.target.value)} disabled={governance.resolutionLocked || formLocked} className={premiumFieldClass} /></label><label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-ink-700">Motivering till ändringen</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} required disabled={formLocked} placeholder="Beskriv varför tidsgränserna behöver ändras" className={`${premiumFieldClass} min-h-24`} /></label></div><button disabled={formLocked || reason.trim().length < 10 || (governance.responseLocked && governance.resolutionLocked)} className={`${premiumPrimaryButtonClass} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50`}>{saving ? "Sparar och omberäknar…" : "Spara styrd SLA-ändring"}</button></fieldset></form> : null}
    <section className="mt-5 rounded-2xl border border-sand-200 bg-white p-5" aria-labelledby="sla-history-title"><div className="flex items-center gap-2"><History className="h-4 w-4 text-petroleum-700" aria-hidden="true" /><h3 id="sla-history-title" className="font-semibold text-ink-900">SLA-ändringshistorik</h3><span className="ml-auto rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-ink-500">{auditHistory.length}</span></div>{auditHistory.length === 0 ? <p className="mt-4 text-sm text-ink-500">Inga styrda SLA-ändringar har registrerats ännu.</p> : <div className="mt-4 divide-y divide-sand-100">{auditHistory.map((entry) => <article key={entry.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-ink-900">{entry.actor.name}</p><p className="text-xs text-ink-500">{dateTime.format(new Date(entry.createdAt))}</p></div><p className="mt-2 text-sm leading-6 text-ink-600">{entry.metadata?.reason || "Ingen motivering registrerad"}</p><div className="mt-3 grid gap-3 text-xs md:grid-cols-2"><div className="rounded-xl bg-sand-50 p-3"><p className="font-semibold uppercase tracking-wide text-ink-500">Före</p><p className="mt-1 text-ink-600">Svar: {formatDeadline(entry.metadata?.before?.responseDueAt)}</p><p className="mt-1 text-ink-600">Lösning: {formatDeadline(entry.metadata?.before?.resolutionDueAt)}</p></div><div className="rounded-xl bg-petroleum-50 p-3"><p className="font-semibold uppercase tracking-wide text-petroleum-600">Efter</p><p className="mt-1 text-petroleum-800">Svar: {formatDeadline(entry.metadata?.after?.responseDueAt)}</p><p className="mt-1 text-petroleum-800">Lösning: {formatDeadline(entry.metadata?.after?.resolutionDueAt)}</p></div></div></article>)}</div>}</section>
  </Panel>;
}
