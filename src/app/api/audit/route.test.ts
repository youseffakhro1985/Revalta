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

  it("quotes formula-like CSV cells and keeps export inside the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    auditFindManyMock.mockResolvedValue([{
      created_at: new Date("2026-09-22T12:00:00.000Z"),
      entity_type: "ticket",
      entity_id: "ticket-1",
      action: "=CMD(TenantB)",
      metadata: { title: "+Hyra" },
      actor: { name: "+Hyra", email: "a@example.se" },
    }]);

    const response = await GET(new Request("http://localhost/api/audit?format=csv"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ company_id: "company-1" }] },
    }));
    expect(csv).toContain("\"'=CMD(TenantB)\"");
    expect(csv).toContain("\"'+Hyra\"");
    expect(csv).not.toContain("\"=CMD(TenantB)\"");
  });
});
