import { describe, expect, it, vi } from "vitest";
import {
  companyOwnedWhere,
  findCompanyOwned,
  relatedIdsMatchCompany,
  tenantSafeMissResponse,
  TENANT_SAFE_MISS_STATUS,
} from "./tenant-relations";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const PROPERTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TICKET_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("tenant-relations", () => {
  it("scopes lookups by both id and company", () => {
    expect(companyOwnedWhere(TENANT_A, PROPERTY_B)).toEqual({
      id: PROPERTY_B,
      company_id: TENANT_A,
    });
  });

  it("returns null when Tenant A asks for Tenant B related ids", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    await expect(findCompanyOwned(findFirst, { id: PROPERTY_B, companyId: TENANT_A })).resolves.toBeNull();
    await expect(findCompanyOwned(findFirst, { id: TICKET_B, companyId: TENANT_A })).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: PROPERTY_B, company_id: TENANT_A },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: TICKET_B, company_id: TENANT_A },
    });
  });

  it("does not return Tenant B rows even if the finder is misused after a company filter", async () => {
    const findFirst = vi.fn().mockImplementation(async ({ where }: { where: { company_id: string } }) => {
      if (where.company_id === TENANT_B) {
        return { id: PROPERTY_B, company_id: TENANT_B };
      }
      return null;
    });

    await expect(findCompanyOwned(findFirst, { id: PROPERTY_B, companyId: TENANT_A })).resolves.toBeNull();
  });

  it("returns the owned row only for the matching company", async () => {
    const row = { id: PROPERTY_B, company_id: TENANT_B, name: "B-fastighet" };
    const findFirst = vi.fn().mockImplementation(async ({ where }: { where: { id: string; company_id: string } }) => {
      if (where.id === row.id && where.company_id === row.company_id) return row;
      return null;
    });

    await expect(findCompanyOwned(findFirst, { id: PROPERTY_B, companyId: TENANT_B })).resolves.toEqual(row);
    await expect(findCompanyOwned(findFirst, { id: PROPERTY_B, companyId: TENANT_A })).resolves.toBeNull();
  });

  it("rejects mixed related records from another company", () => {
    const ticketA = { company_id: TENANT_A };
    const propertyB = { company_id: TENANT_B };
    expect(relatedIdsMatchCompany(TENANT_A, [ticketA, propertyB])).toBe(false);
    expect(relatedIdsMatchCompany(TENANT_A, [ticketA, { company_id: TENANT_A }])).toBe(true);
    expect(relatedIdsMatchCompany(TENANT_A, [ticketA, null])).toBe(false);
  });

  it("uses a tenant-safe 404 that does not confirm foreign existence", () => {
    expect(TENANT_SAFE_MISS_STATUS).toBe(404);
    expect(tenantSafeMissResponse()).toEqual({
      status: 404,
      error: "Posten hittades inte",
    });
  });

  it("ignores blank ids instead of querying", async () => {
    const findFirst = vi.fn();
    await expect(findCompanyOwned(findFirst, { id: "  ", companyId: TENANT_A })).resolves.toBeNull();
    await expect(findCompanyOwned(findFirst, { id: PROPERTY_B, companyId: "" })).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
