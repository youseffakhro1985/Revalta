import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyCountMock,
  userCountMock,
  ticketCountMock,
  companyFindUniqueMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyCountMock: vi.fn(),
  userCountMock: vi.fn(),
  ticketCountMock: vi.fn(),
  companyFindUniqueMock: vi.fn(),
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
    company: { findUnique: companyFindUniqueMock },
  },
}));

import { GET } from "./route";

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

    expect(response.status).toBe(200);
    expect(companyFindUniqueMock).toHaveBeenCalled();
  });
});
