import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, updateMock, getCurrentUserMock, canCreatePropertiesMock, writeAuditLogMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  canCreatePropertiesMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { property: { findFirst: findFirstMock, update: updateMock } },
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canCreateProperties: canCreatePropertiesMock,
  tenantWhere: (user: { company_id: string }) => ({ company_id: user.company_id }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { PATCH } from "./route";

const request = () => new Request("https://www.revalta.se/api/properties/property-b", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Fastighet", address: "Gatan 1", city: "Stockholm" }),
});

describe("property tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "user-a", company_id: "company-a", role: "owner" });
    canCreatePropertiesMock.mockReturnValue(true);
  });

  it("returns 404 and performs no write for another tenant's property", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await PATCH(request(), { params: Promise.resolve({ id: "property-b" }) });

    expect(response.status).toBe(404);
    expect(findFirstMock).toHaveBeenCalledWith({ where: { id: "property-b", company_id: "company-a" } });
    expect(updateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects a role without property-management permission before lookup", async () => {
    canCreatePropertiesMock.mockReturnValue(false);
    const response = await PATCH(request(), { params: Promise.resolve({ id: "property-a" }) });
    expect(response.status).toBe(403);
    expect(findFirstMock).not.toHaveBeenCalled();
  });
});
