"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, PauseCircle, ShieldAlert } from "lucide-react";
import { InlineAlert, Panel, premiumFieldClass, premiumPrimaryButtonClass } from "@/components/dashboard/premium-ui";

type SlaRisk = "overdue" | "critical" | "soon" | "normal" | "fulfilled" | "paused" | "not_configured";
type SlaPhase = "response" | "resolution" | "fulfilled" | "paused" | "not_configured";

type Checkpoint = {
  dueAt: string | null;
  achievedAt: string | null;
  breached: boolean;
  varianceMinutes: number | null;
};

type SlaEvaluation = {
  phase: SlaPhase;
  risk: SlaRisk;
  label: string;
  dueAt: string | null;
  remainingMinutes: number | null;
  overdueMinutes: number | null;
  pauseReason: string | null;
  response: Checkpoint;
  resolution: Checkpoint;
};

type Governance = { responseLocked: boolean; resolutionLocked: boolean };
type Props = { workOrderId: string };

const dateTime = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" });
const phaseLabels: Record<SlaPhase, string> = {
  response: "Första respons",
  resolution: "Lösning",
  fulfilled: "Hanterad",
  paused: "Pausad",
  not_configured: "Saknas",
};

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
  if (risk === "overdue") return "border-red-200 bg-red-50 text-red-800";
  if (risk === "critical") return "border-orange-200 bg-orange-50 text-orange-800";
  if (risk === "soon") return "border-amber-200 bg-amber-50 text-amber-800";
  if (risk === "paused") return "border-sky-200 bg-sky-50 text-sky-800";
  if (risk === "fulfilled") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (risk === "not_configured") return "border-sand-200 bg-sand-50 text-ink-700";
  return "border-petroleum-200 bg-petroleum-50 text-petroleum-800";
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export function WorkOrderSlaDetailPanel({ workOrderId }: Props) {
  const [sla, setSla] = useState<SlaEvaluation | null>(null);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [governance, setGovernance] = useState<Governance>({ responseLocked: false, resolutionLocked: false });
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte hämta SLA-bedömningen");
      setSla(data.sla);
      setEvaluatedAt(data.evaluatedAt || null);
      setCanManage(Boolean(data.canManage));
      setGovernance(data.governance || { responseLocked: false, resolutionLocked: false });
      setResponseDueAt(toLocalInput(data.sla?.response?.dueAt || null));
      setResolutionDueAt(toLocalInput(data.sla?.resolution?.dueAt || null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta SLA-bedömningen");
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => { void load(); }, [load]);

  async function saveDeadlines(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/sla`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseDueAt, resolutionDueAt, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunde inte uppdatera SLA-deadlines");
      setReason("");
      setSuccess("SLA-deadlines har uppdaterats, omberäknats och registrerats i revisionsloggen.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera SLA-deadlines");
    } finally {
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

  if (loading) return <div className="h-56 animate-pulse rounded-2xl bg-sand-100" aria-label="Laddar SLA-bedömning" />;
  if (error && !sla) return <InlineAlert>{error}</InlineAlert>;
  if (!sla) return <InlineAlert>SLA-bedömningen saknas</InlineAlert>;

  const ActiveIcon = sla.risk === "overdue" || sla.risk === "critical" ? AlertTriangle : sla.risk === "paused" ? PauseCircle : sla.risk === "fulfilled" ? CheckCircle2 : ShieldAlert;

  return <Panel title="SLA och leveranssäkerhet" description="Serverberäknad bedömning med behörighetsstyrda deadlines och oföränderligt historiskt utfall.">
    {(error || success) ? <div className="mb-4" aria-live="polite"><InlineAlert tone={error ? "error" : "success"}>{error || success}</InlineAlert></div> : null}

    <div className={`rounded-2xl border p-5 ${riskClasses(sla.risk)}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white/70 p-2"><ActiveIcon className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">Aktuell fas · {phaseLabels[sla.phase]}</p>
            <p className="mt-2 text-xl font-semibold">{sla.label}</p>
            <p className="mt-1 text-sm font-medium">{activeText}</p>
          </div>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold">{sla.dueAt ? dateTime.format(new Date(sla.dueAt)) : "Ingen aktiv deadline"}</p>
          {evaluatedAt ? <p className="mt-1 text-xs opacity-70">Beräknad {dateTime.format(new Date(evaluatedAt))}</p> : null}
        </div>
      </div>
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <article className={`rounded-2xl border p-5 ${sla.response.breached ? "border-red-200 bg-red-50" : "border-sand-200 bg-white"}`}>
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-petroleum-700" /><h3 className="font-semibold text-ink-900">Första respons</h3>{governance.responseLocked ? <LockKeyhole className="ml-auto h-4 w-4 text-ink-400" aria-label="Svarstiden är låst" /> : null}</div>
        <p className={`mt-3 text-sm font-semibold ${sla.response.breached ? "text-red-700" : "text-ink-700"}`}>{sla.response.achievedAt ? sla.response.breached ? "Svarstid överskreds" : "Svarstid uppfylld" : "Inväntar respons"}</p>
        <p className="mt-1 text-sm leading-6 text-ink-500">{checkpointText(sla.response, "Svar")}</p>
        {sla.response.achievedAt ? <p className="mt-2 text-xs text-ink-400">Registrerad {dateTime.format(new Date(sla.response.achievedAt))}</p> : null}
      </article>

      <article className={`rounded-2xl border p-5 ${sla.resolution.breached ? "border-red-200 bg-red-50" : "border-sand-200 bg-white"}`}>
        <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-petroleum-700" /><h3 className="font-semibold text-ink-900">Lösning</h3>{governance.resolutionLocked ? <LockKeyhole className="ml-auto h-4 w-4 text-ink-400" aria-label="Lösningstiden är låst" /> : null}</div>
        <p className={`mt-3 text-sm font-semibold ${sla.resolution.breached ? "text-red-700" : "text-ink-700"}`}>{sla.resolution.achievedAt ? sla.resolution.breached ? "Lösningstid överskreds" : "Lösningstid uppfylld" : "Inväntar lösning"}</p>
        <p className="mt-1 text-sm leading-6 text-ink-500">{checkpointText(sla.resolution, "Lösning")}</p>
        {sla.resolution.achievedAt ? <p className="mt-2 text-xs text-ink-400">Registrerad {dateTime.format(new Date(sla.resolution.achievedAt))}</p> : null}
      </article>
    </div>

    {canManage ? <form onSubmit={saveDeadlines} className="mt-5 rounded-2xl border border-sand-200 bg-sand-50/60 p-5">
      <div className="mb-4"><h3 className="font-semibold text-ink-900">Styr SLA-deadlines</h3><p className="mt-1 text-sm leading-6 text-ink-500">Status beräknas alltid av servern. Uppnådda kontrollpunkter låses för att bevara historiskt utfall.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Svar senast</span><input type="datetime-local" value={responseDueAt} onChange={(event) => setResponseDueAt(event.target.value)} disabled={governance.responseLocked || saving} className={premiumFieldClass} /></label>
        <label className="space-y-2"><span className="text-sm font-semibold text-ink-700">Lösning senast</span><input type="datetime-local" value={resolutionDueAt} onChange={(event) => setResolutionDueAt(event.target.value)} disabled={governance.resolutionLocked || saving} className={premiumFieldClass} /></label>
        <label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-ink-700">Motivering till ändringen</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} required disabled={saving} placeholder="Beskriv varför tidsgränserna behöver ändras" className={`${premiumFieldClass} min-h-24`} /></label>
      </div>
      <button disabled={saving || reason.trim().length < 10 || (governance.responseLocked && governance.resolutionLocked)} className={`${premiumPrimaryButtonClass} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50`}>{saving ? "Sparar och omberäknar…" : "Spara styrd SLA-ändring"}</button>
    </form> : null}
  </Panel>;
}
