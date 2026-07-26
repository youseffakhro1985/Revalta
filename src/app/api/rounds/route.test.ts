import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, auditFindManyMock, inspectionRoundFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  inspectionRoundFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    inspectionRound: { findMany: inspectionRoundFindManyMock },
    auditLog: { findMany: auditFindManyMock },
    property: { findFirst: vi.fn() },
  },
}));

import { GET } from "./route";

describe("rounds route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindManyMock.mockResolvedValue([]);
    inspectionRoundFindManyMock.mockResolvedValue([]);
  });

  it("uses company-scoped table + legacy audit rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1" });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(inspectionRoundFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "round" },
    }));
  });

  it("requires organisation for rounds", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null });
    const response = await GET();

    expect(response.status).toBe(400);
    expect(inspectionRoundFindManyMock).not.toHaveBeenCalled();
  });
});
