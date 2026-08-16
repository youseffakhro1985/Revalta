import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyCountMock,
  userCountMock,
  ticketCountMock,
  companyFindUniqueMock,
  companyUpdateMock,
  writeAuditLogMock,
  recordPaymentEventMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyCountMock: vi.fn(),
  userCountMock: vi.fn(),
  ticketCountMock: vi.fn(),
  companyFindUniqueMock: vi.fn(),
  companyUpdateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { count: propertyCountMock },
    user: { count: userCountMock },
    ticket: { count: ticketCountMock },
    company: { findUnique: companyFindUniqueMock, update: companyUpdateMock },
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: recordPaymentEventMock }));

function patchRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/billing", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

import { GET, PATCH } from "./route";

describe("billing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyCountMock.mockResolvedValue(0);
    userCountMock.mockResolvedValue(0);
    ticketCountMock.mockResolvedValue(0);
    companyFindUniqueMock.mockResolvedValue({
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    recordPaymentEventMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies technicians from reading billing and Stripe identifiers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });

  it("denies managers from reading billing administration", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("allows owners to read billing summary", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(companyFindUniqueMock).toHaveBeenCalled();
    expect(body.canDirectChangePlan).toBe(true);
  });

  it("reports canDirectChangePlan as false in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

    const response = await GET();
    const body = await response.json();

    expect(body.canDirectChangePlan).toBe(false);
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await PATCH(patchRequest({ plan: "enterprise" }));

      expect(response.status).toBe(401);
      expect(companyUpdateMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot manage billing", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

      const response = await PATCH(patchRequest({ plan: "enterprise" }));

      expect(response.status).toBe(403);
      expect(companyUpdateMock).not.toHaveBeenCalled();
    });

    it("blocks direct plan changes in production — must go through Stripe Checkout", async () => {
      // Regression test for the billing-integrity gap: without this gate any
      // billing manager could grant their own company a higher paid tier
      // without ever paying for it, since this endpoint bypasses Stripe entirely.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("Stripe Checkout");
      expect(companyUpdateMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a plan not in the allowed set outside production", async () => {
      vi.stubEnv("NODE_ENV", "test");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

      const response = await PATCH(patchRequest({ plan: "unlimited" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Ogiltig plan");
      expect(companyUpdateMock).not.toHaveBeenCalled();
    });

    it("allows a direct plan change outside production and writes an audit log", async () => {
      vi.stubEnv("NODE_ENV", "test");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
      companyUpdateMock.mockResolvedValue({ id: "company-1", name: "Testfastigheter AB", plan: "enterprise" });

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        success: true,
        company: { id: "company-1", name: "Testfastigheter AB", plan: "enterprise" },
      });
      expect(companyUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "company-1" }, data: { plan: "enterprise" } }),
      );
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "owner-1" }),
        expect.objectContaining({ action: "billing.plan_changed", metadata: { plan: "enterprise" } }),
      );
    });
  });
});
