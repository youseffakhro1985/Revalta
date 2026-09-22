import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, propertyFindFirstMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import { PATCH } from "./route";

const params = { params: Promise.resolve({ id: "property-1" }) };

function request() {
  return new Request("https://www.revalta.se/api/properties/property-1/maintenance-plan/action", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionId: "action-1", title: "Takbyte", plannedYear: 2028, estimatedCost: 100000 }),
  });
}

describe("maintenance-plan action PATCH staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before looking up a property", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await PATCH(request(), params);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("denies technicians with the operations copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(request(), params);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });
});
