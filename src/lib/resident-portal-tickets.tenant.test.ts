import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
  },
}));

import type { CompanyUser } from "@/lib/current-user";
import { findAccessibleResidentPortalTicket } from "./resident-portal-tickets";

const TENANT_A = "company-a";
const TENANT_B = "company-b";
const TICKET_B = "ticket-resident-b";
const RESIDENT_A = {
  id: "resident-a",
  company_id: TENANT_A,
  role: "resident",
  email: "boende-a@exempel.se",
  name: "Boende A",
} as CompanyUser;

describe("findAccessibleResidentPortalTicket tenant and resident scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindFirstMock.mockResolvedValue(null);
  });

  it("scopes residents by company, portal source and reporter email, not company-wide tickets", async () => {
    await findAccessibleResidentPortalTicket(RESIDENT_A, TICKET_B);

    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: TICKET_B,
        company_id: TENANT_A,
        source: "resident_portal",
        deleted_at: null,
        reporter_email: { equals: "boende-a@exempel.se", mode: "insensitive" },
      }),
    }));
  });

  it("does not let a resident inherit staff company-scope without an email match", async () => {
    await findAccessibleResidentPortalTicket(RESIDENT_A, TICKET_B);
    const where = ticketFindFirstMock.mock.calls[0][0].where;
    expect(where.company_id).toBe(TENANT_A);
    expect(where.reporter_email).toEqual({ equals: "boende-a@exempel.se", mode: "insensitive" });
    expect(where).not.toEqual(expect.objectContaining({ user_id: RESIDENT_A.id }));
  });

  it("never queries another company even when the ticket id belongs to Tenant B", async () => {
    await findAccessibleResidentPortalTicket(
      { ...RESIDENT_A, company_id: TENANT_A },
      TICKET_B,
    );
    expect(ticketFindFirstMock.mock.calls[0][0].where.company_id).toBe(TENANT_A);
    expect(ticketFindFirstMock.mock.calls[0][0].where.company_id).not.toBe(TENANT_B);
  });

  it("does not email-filter leasing staff, but still requires the session company", async () => {
    await findAccessibleResidentPortalTicket({
      id: "manager-1",
      company_id: TENANT_A,
      role: "manager",
      email: "forvaltare@exempel.se",
      name: "Förvaltare",
    } as CompanyUser, TICKET_B);

    const where = ticketFindFirstMock.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({
      id: TICKET_B,
      company_id: TENANT_A,
      source: "resident_portal",
    }));
    expect(where.reporter_email).toBeUndefined();
  });

  it("returns null without querying for technicians who must not use the portal dump", async () => {
    await expect(findAccessibleResidentPortalTicket({
      id: "tech-1",
      company_id: TENANT_A,
      role: "technician",
      email: "tech@exempel.se",
      name: "Tekniker",
    } as CompanyUser, TICKET_B)).resolves.toBeNull();
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });
});
