import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, queryRawMock, sqlSoftDeleteGuardMock, runEngineMock, writeAuditLogMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
  runEngineMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
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

vi.mock("@/lib/preventive-maintenance-engine", () => ({
  runPreventiveMaintenanceEngine: runEngineMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

import { GET, POST } from "./route";

describe("preventive maintenance staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
    sqlSoftDeleteGuardMock.mockResolvedValue("");
  });

  it("rejects residents before querying assets or work orders", async () => {
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

  it("lets technicians load the preventive overview", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalled();
  });
});

describe("preventive maintenance POST staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runEngineMock.mockResolvedValue({ created: 0 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects residents before running the engine", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(runEngineMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(runEngineMock).not.toHaveBeenCalled();
  });
});
