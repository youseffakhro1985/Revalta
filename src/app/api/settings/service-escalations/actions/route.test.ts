import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, createMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    serviceEscalationAdminAction: {
      create: createMock,
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
}));

import { POST } from "./route";

describe("service-escalations actions POST staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before creating an admin action", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/settings/service-escalations/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("denies technicians with the admin-action copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(new Request("http://localhost/api/settings/service-escalations/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Endast ägare och administratörer får utföra åtgärden");
    expect(createMock).not.toHaveBeenCalled();
  });
});
