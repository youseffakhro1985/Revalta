import { describe, expect, it } from "vitest";
import { evaluateWorkOrderSla } from "./work-order-sla";

const now = new Date("2026-07-20T10:00:00.000Z");
const base = {
  status: "planned",
  responseDueAt: "2026-07-20T12:00:00.000Z",
  resolutionDueAt: "2026-07-21T10:00:00.000Z",
  respondedAt: null,
  completedAt: null,
  closedAt: null,
  pausedAt: null,
  pauseReason: null,
};

describe("evaluateWorkOrderSla", () => {
  it("prioriterar svarstiden innan första respons", () => {
    const result = evaluateWorkOrderSla(base, now);
    expect(result.phase).toBe("response");
    expect(result.risk).toBe("critical");
    expect(result.remainingMinutes).toBe(120);
    expect(result.label).toBe("Svarstid kritisk");
  });

  it("går över till lösningstid efter respons", () => {
    const result = evaluateWorkOrderSla({ ...base, status: "in_progress", respondedAt: "2026-07-20T09:00:00.000Z" }, now);
    expect(result.phase).toBe("resolution");
    expect(result.risk).toBe("soon");
    expect(result.remainingMinutes).toBe(1440);
    expect(result.response.breached).toBe(false);
  });

  it("redovisar försening i minuter", () => {
    const result = evaluateWorkOrderSla({ ...base, responseDueAt: "2026-07-20T09:30:00.000Z" }, now);
    expect(result.risk).toBe("overdue");
    expect(result.overdueMinutes).toBe(30);
    expect(result.response.breached).toBe(true);
  });

  it("bevarar historiskt SLA-utfall när ordern är slutförd", () => {
    const result = evaluateWorkOrderSla({
      ...base,
      status: "completed",
      respondedAt: "2026-07-20T12:30:00.000Z",
      completedAt: "2026-07-21T09:00:00.000Z",
    }, now);
    expect(result.phase).toBe("fulfilled");
    expect(result.risk).toBe("fulfilled");
    expect(result.response.breached).toBe(true);
    expect(result.response.varianceMinutes).toBe(30);
    expect(result.resolution.breached).toBe(false);
  });

  it("visar pausorsak utan att räkna ned aktivt", () => {
    const result = evaluateWorkOrderSla({
      ...base,
      status: "blocked",
      pausedAt: "2026-07-20T09:45:00.000Z",
      pauseReason: "Inväntar åtkomst till teknikrum",
    }, now);
    expect(result.phase).toBe("paused");
    expect(result.risk).toBe("paused");
    expect(result.pauseReason).toBe("Inväntar åtkomst till teknikrum");
    expect(result.remainingMinutes).toBeNull();
  });

  it("hanterar saknade SLA-datum explicit", () => {
    const result = evaluateWorkOrderSla({ ...base, responseDueAt: null, resolutionDueAt: null }, now);
    expect(result.phase).toBe("not_configured");
    expect(result.risk).toBe("not_configured");
    expect(result.label).toBe("SLA saknas");
  });
});
