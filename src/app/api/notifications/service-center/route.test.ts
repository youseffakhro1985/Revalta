import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, queryRawMock, getUxStateMock, sqlSoftDeleteGuardMock, markReadMock, snoozeMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
  getUxStateMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
  markReadMock: vi.fn(),
  snoozeMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: { $queryRaw: queryRawMock },
}));

vi.mock("@/lib/notification-ux-state", () => ({
  getNotificationUxState: getUxStateMock,
  markNotificationsRead: markReadMock,
  snoozeNotifications: snoozeMock,
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: sqlSoftDeleteGuardMock,
}));

import { GET, PATCH } from "./route";

function inboxRequest() {
  return new Request("http://localhost/api/notifications/service-center");
}

describe("GET /api/notifications/service-center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
    sqlSoftDeleteGuardMock.mockResolvedValue("");
    getUxStateMock.mockResolvedValue({ read: new Set(), snooze: new Map() });
  });

  it("denies technicians from reading the service-center inbox", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(inboxRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(getUxStateMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing upcoming service rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(inboxRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(getUxStateMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/notifications/service-center staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
    sqlSoftDeleteGuardMock.mockResolvedValue("");
    markReadMock.mockResolvedValue(undefined);
    snoozeMock.mockResolvedValue(undefined);
  });

  it("rejects residents before reading service rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await PATCH(new Request("http://localhost/api/notifications/service-center", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", all: true }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();
  });

  it("denies technicians with the operations copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(new Request("http://localhost/api/notifications/service-center", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", all: true }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
