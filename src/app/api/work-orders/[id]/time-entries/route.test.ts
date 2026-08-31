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
  canManageTickets: () => true,
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

describe("time-entry id isolation", () => {
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
});
