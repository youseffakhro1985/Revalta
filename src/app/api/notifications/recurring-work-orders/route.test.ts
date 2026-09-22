import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  listRecurringIncidentEventsMock,
  getUxStateMock,
  listRecurringRunsMock,
  readRecurringSchedulesMock,
  markReadMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listRecurringIncidentEventsMock: vi.fn(),
  getUxStateMock: vi.fn(),
  listRecurringRunsMock: vi.fn(),
  readRecurringSchedulesMock: vi.fn(),
  markReadMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/notification-ux-state", () => ({
  getNotificationUxState: getUxStateMock,
  markNotificationsRead: markReadMock,
}));

vi.mock("@/lib/recurring-incident-storage", () => ({
  listRecurringIncidentEvents: listRecurringIncidentEventsMock,
}));

vi.mock("@/lib/recurring-work-order-engine", () => ({
  listRecurringRuns: listRecurringRunsMock,
  readRecurringSchedules: readRecurringSchedulesMock,
}));

import { GET, PATCH } from "./route";

function inboxRequest() {
  return new Request("http://localhost/api/notifications/recurring-work-orders");
}

describe("GET /api/notifications/recurring-work-orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecurringIncidentEventsMock.mockResolvedValue([]);
    listRecurringRunsMock.mockResolvedValue([]);
    readRecurringSchedulesMock.mockResolvedValue([]);
    getUxStateMock.mockResolvedValue({ read: new Set(), snooze: new Map() });
  });

  it("denies technicians from reading recurring-work-order alerts", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(inboxRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
    expect(getUxStateMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing recurring-run failures", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(inboxRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
    expect(getUxStateMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/notifications/recurring-work-orders staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecurringIncidentEventsMock.mockResolvedValue([]);
    listRecurringRunsMock.mockResolvedValue([]);
    readRecurringSchedulesMock.mockResolvedValue([]);
    markReadMock.mockResolvedValue(undefined);
  });

  it("rejects residents before listing recurring-run keys", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await PATCH(new Request("http://localhost/api/notifications/recurring-work-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", all: true }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
    expect(markReadMock).not.toHaveBeenCalled();
  });

  it("denies technicians with the operations copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(new Request("http://localhost/api/notifications/recurring-work-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", all: true }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
  });
});
