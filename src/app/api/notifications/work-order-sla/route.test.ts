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
  });
});
