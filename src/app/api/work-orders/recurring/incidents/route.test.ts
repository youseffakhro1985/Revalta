import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  listRecurringIncidentEventsMock,
  userFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listRecurringIncidentEventsMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/recurring-incident-storage", () => ({
  listRecurringIncidentEvents: listRecurringIncidentEventsMock,
  createRecurringIncidentEvent: vi.fn(),
}));

vi.mock("@/lib/recurring-work-order-engine", () => ({
  listRecurringRuns: vi.fn(),
  readRecurringSchedules: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    user: { findMany: userFindManyMock, findFirst: vi.fn() },
  },
}));

import { GET } from "./route";

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
