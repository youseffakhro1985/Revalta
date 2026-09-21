import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, auditFindManyMock, auditCountMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditCountMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    auditLog: { findMany: auditFindManyMock, count: auditCountMock },
  },
}));

import { GET } from "./route";

function auditRequest() {
  return new Request("http://localhost/api/audit");
}

describe("GET /api/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindManyMock.mockResolvedValue([]);
    auditCountMock.mockResolvedValue(0);
  });

  it("denies technicians from reading actor emails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(auditRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa systemloggen");
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing audit actor emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(auditRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("scopes the log to the owner's company instead of actor_user_id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    const response = await GET(auditRequest());
    expect(response.status).toBe(200);
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ company_id: "company-1" }] },
    }));
  });
});
