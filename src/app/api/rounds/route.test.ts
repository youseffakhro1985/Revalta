import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, auditFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    auditLog: { findMany: auditFindManyMock },
    property: { findFirst: vi.fn() },
  },
}));

import { GET } from "./route";

describe("rounds route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindManyMock.mockResolvedValue([]);
  });

  it("uses audit scope for company users", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1" });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "round" },
    }));
  });

  it("uses actor scope for solo users", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { actor_user_id: "user-1", entity_type: "round" },
    }));
  });
});
