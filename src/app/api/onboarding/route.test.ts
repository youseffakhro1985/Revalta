import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  companyFindUniqueMock,
  propertyCountMock,
  userCountMock,
  teamInviteCountMock,
  auditFindFirstMock,
  writeAuditLogMock,
  getCompanyServicePreferencesMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  companyFindUniqueMock: vi.fn(),
  propertyCountMock: vi.fn(),
  userCountMock: vi.fn(),
  teamInviteCountMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  getCompanyServicePreferencesMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: { findUnique: companyFindUniqueMock },
    property: { count: propertyCountMock },
    user: { count: userCountMock },
    teamInvite: { count: teamInviteCountMock },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/service-notification-settings", () => ({
  getCompanyServicePreferences: getCompanyServicePreferencesMock,
}));

import { GET, POST } from "./route";

function postRequest(action = "verify-ticket-intake") {
  return new Request("https://www.revalta.se/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

describe("onboarding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyFindUniqueMock.mockResolvedValue({ name: "Revalta Fastigheter AB", org_number: "556000-0000" });
    propertyCountMock.mockResolvedValue(1);
    userCountMock.mockResolvedValue(2);
    teamInviteCountMock.mockResolvedValue(0);
    auditFindFirstMock.mockResolvedValue({ id: "audit-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
    getCompanyServicePreferencesMock.mockResolvedValue({
      preferences: { enabled: true, daysAhead: 30, roles: ["owner"] },
      updatedAt: new Date("2026-08-17T07:00:00.000Z"),
    });
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });

  it("does not expose organisation onboarding to managers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ eligible: false, progress: null });
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });

  it("derives owner progress only from the current company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.eligible).toBe(true);
    expect(body.progress.complete).toBe(true);
    expect(propertyCountMock).toHaveBeenCalledWith({ where: { company_id: "company-1", deleted_at: null } });
    expect(userCountMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-1" }) }));
    expect(teamInviteCountMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-1" }) }));
    expect(auditFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-1" }) }));
  });

  it("denies managers from verifying ticket intake", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await POST(postRequest());

    expect(response.status).toBe(403);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("requires a real property before ticket intake can be verified", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyCountMock.mockResolvedValueOnce(0);

    const response = await POST(postRequest());

    expect(response.status).toBe(409);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("writes a company-scoped verification audit event once", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyCountMock.mockResolvedValue(1);
    auditFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "audit-new" });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "onboarding",
        entityId: "company-1",
        action: "onboarding.ticket_intake_verified",
      }),
    );
  });
});
