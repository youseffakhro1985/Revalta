import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  readRecurringSchedulesMock,
  scheduleUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  readRecurringSchedulesMock: vi.fn(),
  scheduleUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/recurring-work-order-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recurring-work-order-engine")>()),
  readRecurringSchedules: readRecurringSchedulesMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    recurringWorkOrderSchedule: {
      updateMany: scheduleUpdateManyMock,
      findMany: vi.fn(),
    },
    property: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { PATCH } from "./route";

describe("work-orders/recurring route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern recurring schedule fields", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    readRecurringSchedulesMock.mockResolvedValue([{
      id: "schedule-1",
      company_id: "company-1",
      property_id: "property-1",
      property_name: "Fastighet 1",
      title: "Återkommande filterbyte",
      description: "Byt filter i ventilation",
      frequency: "monthly",
      priority: "normal",
      estimated_cost: 1500,
      next_run_at: "2026-08-01T08:00:00.000Z",
      active: true,
      last_generated_at: null,
      last_work_order_id: null,
      last_work_order_number: null,
      created_at: new Date("2026-07-01T00:00:00.000Z"),
      updated_at: new Date("2026-07-01T00:00:00.000Z"),
      source: "table",
    }]);

    const response = await PATCH(new Request("http://localhost/api/work-orders/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: "schedule-1",
        title: "Filterbyte uppdaterat",
        description: "Byt filter i ventilation – uppdaterad",
        frequency: "quarterly",
        priority: "high",
        estimatedCost: 2000,
        nextRunAt: "2026-09-01T08:00:00.000Z",
        active: true,
      }),
    }));

    expect(response.status).toBe(200);
    expect(scheduleUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "schedule-1", company_id: "company-1" },
      data: expect.objectContaining({
        title: "Filterbyte uppdaterat",
        description: "Byt filter i ventilation – uppdaterad",
        frequency: "quarterly",
        priority: "high",
        estimated_cost: 2000,
        next_run_at: new Date("2026-09-01T08:00:00.000Z"),
        active: true,
        updated_by_id: "user-1",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "work_order.recurring.schedule_updated",
    }));
  });

  it("fail-closes legacy recurring schedule updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    readRecurringSchedulesMock.mockResolvedValue([{
      id: "legacy-1",
      company_id: "company-1",
      property_id: "property-1",
      property_name: "Fastighet 1",
      title: "Legacy schema",
      description: "Äldre lagring",
      frequency: "monthly",
      priority: "normal",
      estimated_cost: null,
      next_run_at: "2026-08-01T08:00:00.000Z",
      active: true,
      last_generated_at: null,
      last_work_order_id: null,
      last_work_order_number: null,
      created_at: new Date("2026-07-01T00:00:00.000Z"),
      updated_at: new Date("2026-07-01T00:00:00.000Z"),
      source: "legacy",
    }]);

    const response = await PATCH(new Request("http://localhost/api/work-orders/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: "legacy-1", active: false }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(scheduleUpdateManyMock).not.toHaveBeenCalled();
  });
});
