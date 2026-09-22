import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  listRecurringIncidentEventsMock,
  userFindManyMock,
  createRecurringIncidentEventMock,
  readRecurringSchedulesMock,
  listRecurringRunsMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listRecurringIncidentEventsMock: vi.fn(),
  userFindManyMock: vi.fn(),
  createRecurringIncidentEventMock: vi.fn(),
  readRecurringSchedulesMock: vi.fn(),
  listRecurringRunsMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/recurring-incident-storage", () => ({
  listRecurringIncidentEvents: listRecurringIncidentEventsMock,
  createRecurringIncidentEvent: createRecurringIncidentEventMock,
}));

vi.mock("@/lib/recurring-work-order-engine", () => ({
  listRecurringRuns: listRecurringRunsMock,
  readRecurringSchedules: readRecurringSchedulesMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    user: { findMany: userFindManyMock, findFirst: vi.fn() },
  },
}));

import { GET, POST } from "./route";

describe("work-orders/recurring/incidents GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecurringIncidentEventsMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
  });

  it("rejects residents before listing incidents or the staff roster", async () => {
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
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects callers without organisation before listing incidents", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: null, role: "owner" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(listRecurringIncidentEventsMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });
});

describe("work-orders/recurring/incidents POST staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before resolving incident keys", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/work-orders/recurring/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationKey: "recurring-run:run-1", status: "acknowledged" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(readRecurringSchedulesMock).not.toHaveBeenCalled();
    expect(listRecurringRunsMock).not.toHaveBeenCalled();
    expect(createRecurringIncidentEventMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(new Request("http://localhost/api/work-orders/recurring/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationKey: "recurring-run:run-1", status: "acknowledged" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(createRecurringIncidentEventMock).not.toHaveBeenCalled();
  });
});

describe("work-orders/recurring/incidents Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
      name: "Owner",
      email: "owner@example.com",
    });
    readRecurringSchedulesMock.mockResolvedValue([]);
    listRecurringRunsMock.mockResolvedValue([]);
  });

  it("returns 404 when Tenant A posts a Tenant B incident key before creating an event", async () => {
    const response = await POST(new Request("http://localhost/api/work-orders/recurring/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationKey: "recurring-run:run-tenant-b",
        status: "acknowledged",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Incidenten finns inte eller tillhör en annan organisation");
    expect(readRecurringSchedulesMock).toHaveBeenCalledWith("company-1");
    expect(listRecurringRunsMock).toHaveBeenCalledWith("company-1", expect.any(Object));
    expect(createRecurringIncidentEventMock).not.toHaveBeenCalled();
  });
});
