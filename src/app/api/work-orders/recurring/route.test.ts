import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  readRecurringSchedulesMock,
  scheduleUpdateManyMock,
  writeAuditLogMock,
  propertyFindFirstMock,
  upsertRecurringScheduleMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  readRecurringSchedulesMock: vi.fn(),
  scheduleUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  upsertRecurringScheduleMock: vi.fn(),
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
  upsertRecurringSchedule: upsertRecurringScheduleMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    recurringWorkOrderSchedule: {
      updateMany: scheduleUpdateManyMock,
      findMany: vi.fn(),
    },
    property: { findMany: vi.fn(), findFirst: propertyFindFirstMock },
    auditLog: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { GET, PATCH, POST } from "./route";

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

  it("rejects residents before listing recurring schedules", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("rejects callers without organisation before listing recurring schedules", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });
    const response = await GET();

    expect(response.status).toBe(403);
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("denies technicians from listing company-wide recurring schedules", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("denies viewers from listing recurring schedules", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await GET();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
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

describe("work-orders/recurring writes staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST rejects residents before creating a schedule", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/work-orders/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Filterbyte", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("POST denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(new Request("http://localhost/api/work-orders/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Filterbyte", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("POST denies technicians before creating or generating schedules", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(new Request("http://localhost/api/work-orders/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", scheduleId: "schedule-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
    expect(upsertRecurringScheduleMock).not.toHaveBeenCalled();
  });

  it("PATCH rejects residents before looking up a schedule", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await PATCH(new Request("http://localhost/api/work-orders/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: "schedule-1", active: false }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("PATCH denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await PATCH(new Request("http://localhost/api/work-orders/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: "schedule-1", active: false }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians before looking up a schedule", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(new Request("http://localhost/api/work-orders/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: "schedule-1", active: false }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
    expect(scheduleUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A posts a schedule against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/work-orders/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-tenant-b",
        title: "Filterbyte Tenant B",
        description: "Byt filter",
        frequency: "monthly",
        priority: "normal",
        nextRunAt: "2026-10-01T08:00:00.000Z",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", company_id: "company-1", deleted_at: null },
      select: { id: true, name: true },
    });
    expect(upsertRecurringScheduleMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A patches a Tenant B schedule id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    readRecurringSchedulesMock.mockResolvedValue([]);

    const response = await PATCH(new Request("http://localhost/api/work-orders/recurring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: "schedule-tenant-b", active: false }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Schemat hittades inte");
    expect(readRecurringSchedulesMock).toHaveBeenCalledWith("company-1");
    expect(scheduleUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
