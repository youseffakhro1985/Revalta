import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  modernAlertFindManyMock,
  integrationFindManyMock,
  modernAckFindManyMock,
  modernAlertFindFirstMock,
  integrationFindFirstMock,
  modernAckFindUniqueMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  modernAlertFindManyMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  modernAckFindManyMock: vi.fn(),
  modernAlertFindFirstMock: vi.fn(),
  integrationFindFirstMock: vi.fn(),
  modernAckFindUniqueMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    componentServiceDeliveryAlert: {
      findMany: modernAlertFindManyMock,
      findFirst: modernAlertFindFirstMock,
    },
    componentServiceDeliveryAlertAck: {
      findMany: modernAckFindManyMock,
      findUnique: modernAckFindUniqueMock,
      create: vi.fn(),
    },
    integrationEvent: {
      findMany: integrationFindManyMock,
      findFirst: integrationFindFirstMock,
    },
    auditLog: { create: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { GET, PATCH } from "./route";

describe("service-notifications alerts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modernAckFindManyMock.mockResolvedValue([]);
    modernAlertFindManyMock.mockResolvedValue([]);
    integrationFindManyMock.mockResolvedValue([]);
  });

  it("GET marks modern alerts as source=table and legacy as source=legacy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    modernAlertFindManyMock.mockResolvedValue([{
      id: "alert-modern",
      status: "open",
      severity: "warning",
      created_at: new Date("2026-07-01T10:00:00.000Z"),
      source_run_id: "run-1",
      sent_count: 1,
      failed_count: 0,
    }]);
    integrationFindManyMock
      .mockResolvedValueOnce([{
        id: "alert-legacy",
        status: "open",
        created_at: new Date("2026-07-01T09:00:00.000Z"),
        payload: { severity: "critical", sentCount: 0, failedCount: 2, sourceEventId: "evt-1" },
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "alert-modern", source: "table" }),
      expect.objectContaining({ id: "alert-legacy", source: "legacy" }),
    ]));
  });

  it("PATCH returns 409 for legacy IntegrationEvent alerts", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    modernAlertFindFirstMock.mockResolvedValue(null);
    integrationFindFirstMock.mockResolvedValue({ id: "alert-legacy" });

    const response = await PATCH(new Request("http://localhost/api/settings/service-notifications/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId: "alert-legacy" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
  });
});
