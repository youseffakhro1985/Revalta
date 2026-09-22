import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  lockFindManyMock,
  integrationFindManyMock,
  getNotificationUxStateMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  lockFindManyMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  getNotificationUxStateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrderLockNotification: { findMany: lockFindManyMock },
    integrationEvent: { findMany: integrationFindManyMock },
  },
}));

vi.mock("@/lib/notification-ux-state", () => ({
  getNotificationUxState: getNotificationUxStateMock,
  markNotificationsRead: vi.fn(),
}));

import { GET, PATCH } from "./route";

describe("work-order lock notifications staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockFindManyMock.mockResolvedValue([]);
    integrationFindManyMock.mockResolvedValue([]);
    getNotificationUxStateMock.mockResolvedValue({ read: new Set(), snooze: new Map() });
  });

  it("rejects resident GET and PATCH before querying lock events", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const getResponse = await GET();
    const patchResponse = await PATCH(new Request("https://www.revalta.se/api/notifications/work-order-locks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }));

    expect(getResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(lockFindManyMock).not.toHaveBeenCalled();
    expect(getNotificationUxStateMock).not.toHaveBeenCalled();
  });

  it("lets technicians load lock notifications addressed to themselves", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(lockFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", recipient_user_id: "tech-1" },
    }));
  });

  it("returns 404 when the lock notification key is outside the caller's inbox", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });

    const response = await PATCH(new Request("https://www.revalta.se/api/notifications/work-order-locks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "foreign-lock-key" }),
    }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Aviseringen hittades inte");
  });
});
