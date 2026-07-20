import { describe, expect, it } from "vitest";
import { buildSlaPriorityQueue } from "./work-order-sla-priority";
import type { WorkOrderSlaEvaluation } from "./work-order-sla";

function sla(risk: WorkOrderSlaEvaluation["risk"], dueAt: string | null): WorkOrderSlaEvaluation {
  return {
    phase: risk === "not_configured" ? "not_configured" : "resolution",
    risk,
    label: risk,
    dueAt,
    remainingMinutes: null,
    overdueMinutes: risk === "overdue" ? 30 : null,
    pauseReason: null,
    response: { dueAt: null, achievedAt: null, breached: false, varianceMinutes: null },
    resolution: { dueAt, achievedAt: null, breached: risk === "overdue", varianceMinutes: null },
  };
}

describe("buildSlaPriorityQueue", () => {
  it("prioriterar passerad före kritisk och snart", () => {
    const result = buildSlaPriorityQueue([
      { id: "soon", status: "planned", priority: "normal", assigned: true, sla: sla("soon", "2026-07-22T10:00:00.000Z") },
      { id: "overdue", status: "planned", priority: "normal", assigned: true, sla: sla("overdue", "2026-07-20T09:00:00.000Z") },
      { id: "critical", status: "planned", priority: "normal", assigned: true, sla: sla("critical", "2026-07-20T12:00:00.000Z") },
    ]);
    expect(result.map((item) => item.id)).toEqual(["overdue", "critical", "soon"]);
  });

  it("lyfter otilldelad inom samma risknivå och filtrerar avslutade", () => {
    const result = buildSlaPriorityQueue([
      { id: "assigned", status: "planned", priority: "normal", assigned: true, sla: sla("critical", "2026-07-20T12:00:00.000Z") },
      { id: "unassigned", status: "planned", priority: "normal", assigned: false, sla: sla("critical", "2026-07-20T12:00:00.000Z") },
      { id: "done", status: "completed", priority: "urgent", assigned: false, sla: sla("overdue", "2026-07-20T08:00:00.000Z") },
    ]);
    expect(result.map((item) => item.id)).toEqual(["unassigned", "assigned"]);
  });
});
