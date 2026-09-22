import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, queryRawMock, sqlSoftDeleteGuardMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: { $queryRaw: queryRawMock },
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: sqlSoftDeleteGuardMock,
}));

import { GET } from "./route";

describe("maintenance portfolio staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
    sqlSoftDeleteGuardMock.mockResolvedValue("");
  });

  it("rejects residents before exposing planned maintenance costs", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(sqlSoftDeleteGuardMock).not.toHaveBeenCalled();
  });

  it("denies technicians from reading portfolio costs and plans", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(sqlSoftDeleteGuardMock).not.toHaveBeenCalled();
  });

  it("keeps manager portfolio rows in the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      company_id: "company-1",
      role: "manager",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalled();
    const sql = queryRawMock.mock.calls[0]?.[0] as { values?: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining(["company-1", "company-1"]));
    expect(sql.values).not.toEqual(expect.arrayContaining(["company-tenant-b"]));
  });
});
