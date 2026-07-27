import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  listResidentMatchedLeasesMock,
  rentNoticeFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listResidentMatchedLeasesMock: vi.fn(),
  rentNoticeFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-leases", () => ({
  listResidentMatchedLeases: listResidentMatchedLeasesMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    rentNotice: { findMany: rentNoticeFindManyMock },
  },
}));

import { GET } from "./route";

describe("resident-portal notices route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResidentMatchedLeasesMock.mockResolvedValue([
      {
        id: "lease-1",
        lease_number: "L-1",
        property_id: "property-1",
        unit_id: "unit-1",
        property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
        unit: { id: "unit-1", designation: "1201" },
        lease_holder: { name: "Boende", contact_name: null },
      },
    ]);
    rentNoticeFindManyMock.mockResolvedValue([
      {
        id: "notice-1",
        lease_id: "lease-1",
        tenant_name: "Boende",
        unit: "1201",
        period: "2026-08",
        due_date: new Date("2026-08-01T00:00:00.000Z"),
        status: "sent",
        base_rent: 10000,
        index_percent: 0,
        indexed_rent: 10000,
        additions: 0,
        deductions: 0,
        total: 10000,
        note: null,
        created_at: new Date("2026-07-20T00:00:00.000Z"),
        property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
      },
    ]);
  });

  it("returns notices for email-matched leases", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notices).toHaveLength(1);
    expect(body.notices[0].total).toBe(10000);
    expect(rentNoticeFindManyMock).toHaveBeenCalled();
  });

  it("returns empty notices when no leases match", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    listResidentMatchedLeasesMock.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notices).toEqual([]);
    expect(rentNoticeFindManyMock).not.toHaveBeenCalled();
  });

  it("denies staff from the resident-only notices API", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      company_id: "company-1",
      role: "manager",
      email: "forvaltare@exempel.se",
    });

    const response = await GET();
    expect(response.status).toBe(403);
  });
});
