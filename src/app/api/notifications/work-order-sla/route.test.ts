import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  queryRawMock,
  getNotificationUxStateMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
  getNotificationUxStateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@/lib/notification-ux-state", () => ({
  getNotificationUxState: getNotificationUxStateMock,
  markNotificationsRead: vi.fn(),
  snoozeNotifications: vi.fn(),
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: vi.fn(async () => ""),
}));

import { GET, PATCH } from "./route";

function request(method = "GET") {
  return new Request("https://www.revalta.se/api/notifications/work-order-sla", {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "PATCH" ? JSON.stringify({ action: "read", all: true }) : undefined,
  });
}

describe("work-order SLA notifications staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
    getNotificationUxStateMock.mockResolvedValue({ read: new Set(), snooze: new Map() });
  });

  it("rejects resident GET and PATCH before querying work orders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
      status: "active",
    });

    const getResponse = await GET(request());
    const patchResponse = await PATCH(request("PATCH"));

    expect(getResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(getNotificationUxStateMock).not.toHaveBeenCalled();
  });

  it("lets technicians load assigned SLA notifications", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
      email: "tech@exempel.se",
      status: "active",
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalled();
    const sql = queryRawMock.mock.calls[0]?.[0] as { values?: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining(["company-1", "tech-1"]));
  });

  it("returns 404 when the SLA notification key is outside the authenticated company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
      email: "owner@exempel.se",
      status: "active",
    });

    const response = await PATCH(new Request("https://www.revalta.se/api/notifications/work-order-sla", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", key: "foreign-sla-key" }),
    }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("SLA-aviseringen hittades inte");
  });

  it("returns tenant-safe 404 when Tenant A marks a Tenant B SLA key as read", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
      email: "owner@exempel.se",
      status: "active",
    });
    queryRawMock.mockResolvedValue([]);

    const response = await PATCH(new Request("https://www.revalta.se/api/notifications/work-order-sla", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", key: "sla-tenant-b" }),
    }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("SLA-aviseringen hittades inte");
    expect(getNotificationUxStateMock).not.toHaveBeenCalled();
  });
});
