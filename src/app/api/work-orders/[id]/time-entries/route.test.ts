import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleWorkOrderMock,
  getModernTimeEntryMock,
  getTimeEntryMock,
  listTimeEntriesMock,
  upsertTimeEntryMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleWorkOrderMock: vi.fn(),
  getModernTimeEntryMock: vi.fn(),
  getTimeEntryMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  upsertTimeEntryMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: (role: string) => ["owner", "admin", "manager", "technician"].includes(role),
  canManageWorkOrderFinance: (role: string) => ["owner", "admin", "manager"].includes(role),
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  getModernTimeEntry: getModernTimeEntryMock,
  getTimeEntry: getTimeEntryMock,
  listTimeEntries: listTimeEntriesMock,
  upsertTimeEntry: upsertTimeEntryMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/work-order-1/time-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "work-order-1" }) };

function timeEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: "time-1",
    workOrderId: "work-order-1",
    userId: "tech-1",
    userName: "Tekniker",
    userEmail: "tech@example.com",
    kind: "travel",
    action: "start",
    startedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    endedAt: null,
    minutes: null,
    billable: false,
    note: "Behåll originalanteckningen",
    status: "running",
    actorId: "tech-1",
    createdAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    source: "table",
    ...overrides,
  };
}

function managerUser() {
  return {
    id: "manager-1",
    email: "manager@example.com",
    name: "Manager",
    role: "manager",
    company_id: "company-1",
  };
}

describe("time-entry id isolation and transition authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      email: "tech@example.com",
      name: "Tekniker",
      role: "technician",
      company_id: "company-1",
    });
    findAccessibleWorkOrderMock.mockResolvedValue({ id: "work-order-1", assigned_to_id: "tech-1", title: "Test" });
    listTimeEntriesMock.mockResolvedValue([]);
    upsertTimeEntryMock.mockImplementation(async (_companyId, payload) => payload);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it.each(["manual", "start"] as const)("uses a server-owned id for %s creation", async (action) => {
    const response = await POST(request({
      action,
      entryId: "foreign-time-entry-id",
      kind: "work",
      ...(action === "manual" ? {
        startedAt: "2026-08-31T08:00:00.000Z",
        endedAt: "2026-08-31T09:00:00.000Z",
      } : {}),
    }), params);

    expect(response.status).toBe(201);
    expect(upsertTimeEntryMock).toHaveBeenCalledTimes(1);
    const payload = upsertTimeEntryMock.mock.calls[0][1];
    expect(payload.entryId).not.toBe("foreign-time-entry-id");
    expect(payload.entryId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(payload.workOrderId).toBe("work-order-1");
    expect(upsertTimeEntryMock.mock.calls[0][0]).toBe("company-1");
    expect(getModernTimeEntryMock).not.toHaveBeenCalled();
    expect(getTimeEntryMock).not.toHaveBeenCalled();
  });

  it("requires an explicit id for transition actions", async () => {
    const response = await POST(request({ action: "stop", kind: "work" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Tidsrad-id krävs" });
    expect(getModernTimeEntryMock).not.toHaveBeenCalled();
    expect(getTimeEntryMock).not.toHaveBeenCalled();
    expect(upsertTimeEntryMock).not.toHaveBeenCalled();
  });

  it("prevents a technician from approving submitted time", async () => {
    const response = await POST(request({ action: "approve", entryId: "time-1" }), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Du saknar behörighet att attestera tid" });
    expect(getModernTimeEntryMock).not.toHaveBeenCalled();
    expect(getTimeEntryMock).not.toHaveBeenCalled();
    expect(upsertTimeEntryMock).not.toHaveBeenCalled();
  });

  it("preserves kind, billable flag and note when a technician stops their timer", async () => {
    const latest = timeEntry();
    getModernTimeEntryMock.mockResolvedValue(latest);

    const response = await POST(request({
      action: "stop",
      entryId: "time-1",
      kind: "work",
      billable: true,
      note: "Försök skriva över",
    }), params);

    expect(response.status).toBe(201);
    const payload = upsertTimeEntryMock.mock.calls[0][1];
    expect(payload.kind).toBe("travel");
    expect(payload.billable).toBe(false);
    expect(payload.note).toBe("Behåll originalanteckningen");
    expect(payload.status).toBe("submitted");
    expect(payload.startedAt).toBe(latest.startedAt);
  });

  it("lets a manager approve time without changing the submitted row semantics", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    findAccessibleWorkOrderMock.mockResolvedValue({ id: "work-order-1", assigned_to_id: "tech-1", title: "Test" });
    const latest = timeEntry({
      status: "submitted",
      action: "manual",
      endedAt: "2026-08-31T09:00:00.000Z",
      minutes: 60,
      kind: "break",
      billable: false,
      note: "Godkänn utan att ändra",
    });
    getModernTimeEntryMock.mockResolvedValue(latest);

    const response = await POST(request({
      action: "approve",
      entryId: "time-1",
      kind: "work",
      billable: true,
      note: "Försök skriva över",
    }), params);

    expect(response.status).toBe(201);
    const payload = upsertTimeEntryMock.mock.calls[0][1];
    expect(payload.status).toBe("approved");
    expect(payload.kind).toBe("break");
    expect(payload.billable).toBe(false);
    expect(payload.note).toBe("Godkänn utan att ändra");
    expect(payload.minutes).toBe(60);
    expect(payload.actorId).toBe("manager-1");
  });

  it.each(["running", "approved", "rejected"] as const)("rejects approval from %s time state", async (status) => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    getModernTimeEntryMock.mockResolvedValue(timeEntry({
      status,
      action: status === "running" ? "start" : "approve",
      endedAt: status === "running" ? null : "2026-08-31T09:00:00.000Z",
      minutes: status === "running" ? null : 60,
    }));

    const response = await POST(request({ action: "approve", entryId: "time-1" }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Tidsraden kan bara attesteras när den är inskickad" });
    expect(upsertTimeEntryMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it.each(["running", "approved", "rejected"] as const)("rejects rejection from %s time state", async (status) => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    getModernTimeEntryMock.mockResolvedValue(timeEntry({
      status,
      action: status === "running" ? "start" : "reject",
      endedAt: status === "running" ? null : "2026-08-31T09:00:00.000Z",
      minutes: status === "running" ? null : 60,
    }));

    const response = await POST(request({ action: "reject", entryId: "time-1" }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Tidsraden kan bara attesteras när den är inskickad" });
    expect(upsertTimeEntryMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
