import { beforeEach, describe, expect, it, vi } from "vitest";

const leaseFindManyMock = vi.hoisted(() => vi.fn());
const leaseFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  default: {
    lease: {
      findMany: leaseFindManyMock,
      findFirst: leaseFindFirstMock,
    },
  },
}));

import {
  findResidentMatchedLease,
  listResidentMatchedLeases,
  residentMatchedLeaseWhere,
} from "./resident-portal-leases";

const TENANT_A = "company-a";
const TENANT_B = "company-b";
const RESIDENT_A_EMAIL = "boende-a@exempel.se";
const RESIDENT_B_EMAIL = "boende-b@exempel.se";
const LEASE_B = "lease-resident-b";

describe("residentMatchedLeaseWhere", () => {
  it("scopes to the session company, active leases and the resident email, never Tenant B", () => {
    const where = residentMatchedLeaseWhere(TENANT_A, `  ${RESIDENT_A_EMAIL.toUpperCase()} `);
    expect(where.company_id).toBe(TENANT_A);
    expect(where.company_id).not.toBe(TENANT_B);
    expect(where.deleted_at).toBeNull();
    expect(where.status).toEqual({ in: ["active", "notice"] });
    expect(where.property).toEqual({ deleted_at: null });
    expect(where.lease_holder).toEqual({
      deleted_at: null,
      email: { equals: RESIDENT_A_EMAIL, mode: "insensitive" },
    });
    expect(JSON.stringify(where)).not.toContain(TENANT_B);
    expect(JSON.stringify(where)).not.toContain(RESIDENT_B_EMAIL);
  });
});

describe("listResidentMatchedLeases tenant and resident scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindManyMock.mockResolvedValue([]);
    leaseFindFirstMock.mockResolvedValue(null);
  });

  it("queries only Tenant A with Resident A email and a bounded take", async () => {
    await listResidentMatchedLeases(TENANT_A, RESIDENT_A_EMAIL);

    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      take: 100,
      where: expect.objectContaining({
        company_id: TENANT_A,
        deleted_at: null,
        status: { in: ["active", "notice"] },
        property: { deleted_at: null },
        lease_holder: {
          deleted_at: null,
          email: { equals: RESIDENT_A_EMAIL, mode: "insensitive" },
        },
      }),
    }));
    expect(leaseFindManyMock.mock.calls[0][0].where.company_id).not.toBe(TENANT_B);
  });

  it("does not match Resident B email even in the same company", async () => {
    await listResidentMatchedLeases(TENANT_A, RESIDENT_A_EMAIL);
    expect(leaseFindManyMock.mock.calls[0][0].where.lease_holder.email.equals).toBe(RESIDENT_A_EMAIL);
    expect(leaseFindManyMock.mock.calls[0][0].where.lease_holder.email.equals).not.toBe(RESIDENT_B_EMAIL);
  });
});

describe("findResidentMatchedLease tenant and resident scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue(null);
  });

  it("looks up a submitted id inside Tenant A + Resident A email, not Tenant B", async () => {
    await findResidentMatchedLease(TENANT_A, RESIDENT_A_EMAIL, LEASE_B);

    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: LEASE_B,
        company_id: TENANT_A,
        lease_holder: {
          deleted_at: null,
          email: { equals: RESIDENT_A_EMAIL, mode: "insensitive" },
        },
      }),
    }));
    expect(leaseFindFirstMock.mock.calls[0][0].where.company_id).not.toBe(TENANT_B);
    expect(leaseFindFirstMock.mock.calls[0][0].where.lease_holder.email.equals).not.toBe(RESIDENT_B_EMAIL);
  });

  it("returns null without querying when the submitted id is empty", async () => {
    await expect(findResidentMatchedLease(TENANT_A, RESIDENT_A_EMAIL, "   ")).resolves.toBeNull();
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("does not inherit staff company-scope: email match is always required", async () => {
    await findResidentMatchedLease(TENANT_A, RESIDENT_A_EMAIL, LEASE_B);
    const where = leaseFindFirstMock.mock.calls[0][0].where;
    expect(where.lease_holder).toBeDefined();
    expect(where.company_id).toBe(TENANT_A);
  });
});
