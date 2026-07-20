export type WorkOrderSlaRisk = "overdue" | "critical" | "soon" | "normal" | "fulfilled" | "paused" | "not_configured";
export type WorkOrderSlaPhase = "response" | "resolution" | "fulfilled" | "paused" | "not_configured";

type DateLike = Date | string | null | undefined;

export type WorkOrderSlaInput = {
  status: string;
  responseDueAt: DateLike;
  resolutionDueAt: DateLike;
  respondedAt: DateLike;
  completedAt?: DateLike;
  closedAt: DateLike;
  pausedAt: DateLike;
  pauseReason?: string | null;
};

export type WorkOrderSlaCheckpoint = {
  dueAt: string | null;
  achievedAt: string | null;
  breached: boolean;
  varianceMinutes: number | null;
};

export type WorkOrderSlaEvaluation = {
  phase: WorkOrderSlaPhase;
  risk: WorkOrderSlaRisk;
  label: string;
  dueAt: string | null;
  remainingMinutes: number | null;
  overdueMinutes: number | null;
  pauseReason: string | null;
  response: WorkOrderSlaCheckpoint;
  resolution: WorkOrderSlaCheckpoint;
};

function asDate(value: DateLike) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function checkpoint(dueValue: DateLike, achievedValue: DateLike, now: Date): WorkOrderSlaCheckpoint {
  const dueAt = asDate(dueValue);
  const achievedAt = asDate(achievedValue);
  if (!dueAt) return { dueAt: null, achievedAt: achievedAt?.toISOString() ?? null, breached: false, varianceMinutes: null };
  const comparison = achievedAt ?? now;
  const varianceMinutes = Math.round((comparison.getTime() - dueAt.getTime()) / 60000);
  return {
    dueAt: dueAt.toISOString(),
    achievedAt: achievedAt?.toISOString() ?? null,
    breached: varianceMinutes > 0,
    varianceMinutes,
  };
}

function riskForRemaining(remainingMinutes: number): WorkOrderSlaRisk {
  if (remainingMinutes < 0) return "overdue";
  if (remainingMinutes <= 4 * 60) return "critical";
  if (remainingMinutes <= 24 * 60) return "soon";
  return "normal";
}

function labelFor(phase: WorkOrderSlaPhase, risk: WorkOrderSlaRisk) {
  if (phase === "paused") return "SLA pausad";
  if (phase === "fulfilled") return "SLA hanterad";
  if (phase === "not_configured") return "SLA saknas";
  const prefix = phase === "response" ? "Svarstid" : "Lösningstid";
  if (risk === "overdue") return `${prefix} passerad`;
  if (risk === "critical") return `${prefix} kritisk`;
  if (risk === "soon") return `${prefix} inom 24 timmar`;
  return `${prefix} inom SLA`;
}

export function evaluateWorkOrderSla(input: WorkOrderSlaInput, now = new Date()): WorkOrderSlaEvaluation {
  const respondedAt = asDate(input.respondedAt);
  const completionAt = asDate(input.closedAt) ?? asDate(input.completedAt);
  const response = checkpoint(input.responseDueAt, respondedAt, now);
  const resolution = checkpoint(input.resolutionDueAt, completionAt, now);
  const terminal = ["completed", "invoiced", "cancelled"].includes(input.status) || Boolean(asDate(input.closedAt));

  if (terminal) {
    return {
      phase: "fulfilled",
      risk: "fulfilled",
      label: labelFor("fulfilled", "fulfilled"),
      dueAt: null,
      remainingMinutes: null,
      overdueMinutes: null,
      pauseReason: null,
      response,
      resolution,
    };
  }

  if (asDate(input.pausedAt)) {
    return {
      phase: "paused",
      risk: "paused",
      label: labelFor("paused", "paused"),
      dueAt: null,
      remainingMinutes: null,
      overdueMinutes: null,
      pauseReason: input.pauseReason?.trim() || null,
      response,
      resolution,
    };
  }

  const phase: WorkOrderSlaPhase = respondedAt ? "resolution" : "response";
  const dueAt = asDate(phase === "response" ? input.responseDueAt : input.resolutionDueAt);
  if (!dueAt) {
    return {
      phase: "not_configured",
      risk: "not_configured",
      label: labelFor("not_configured", "not_configured"),
      dueAt: null,
      remainingMinutes: null,
      overdueMinutes: null,
      pauseReason: null,
      response,
      resolution,
    };
  }

  const remainingMinutes = Math.round((dueAt.getTime() - now.getTime()) / 60000);
  const risk = riskForRemaining(remainingMinutes);
  return {
    phase,
    risk,
    label: labelFor(phase, risk),
    dueAt: dueAt.toISOString(),
    remainingMinutes,
    overdueMinutes: remainingMinutes < 0 ? Math.abs(remainingMinutes) : null,
    pauseReason: null,
    response,
    resolution,
  };
}
