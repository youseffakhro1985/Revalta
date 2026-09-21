import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  queryRawMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: queryRawMock,
  },
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "property-1" }) };

describe("maintenance-plan export GET staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before loading the plan or contractor rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/properties/property-1/maintenance-plan/export"),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
