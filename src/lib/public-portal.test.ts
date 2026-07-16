import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { companyFindFirst, propertyFindFirst } = vi.hoisted(() => ({
  companyFindFirst: vi.fn(),
  propertyFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: { findFirst: companyFindFirst },
    property: { findFirst: propertyFindFirst },
  },
}));

import { getPublicPortalCompany } from "@/lib/public-portal";

const activeCompany = {
  id: "company-1",
  name: "Revalta Test",
  users: [{ id: "owner-1", email: "owner@example.se" }],
};

describe("public portal tenant resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PUBLIC_PORTAL_COMPANY_ID;
  });

  afterEach(() => {
    delete process.env.PUBLIC_PORTAL_COMPANY_ID;
  });

  it("never guesses a tenant for the shared portal", async () => {
    await expect(getPublicPortalCompany()).resolves.toBeNull();
    expect(companyFindFirst).not.toHaveBeenCalled();
    expect(propertyFindFirst).not.toHaveBeenCalled();
  });

  it("resolves only the explicitly configured active company", async () => {
    process.env.PUBLIC_PORTAL_COMPANY_ID = "company-1";
    companyFindFirst.mockResolvedValue(activeCompany);

    await expect(getPublicPortalCompany()).resolves.toEqual({
      company: activeCompany,
      owner: activeCompany.users[0],
    });
    expect(companyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "company-1", status: "active" } })
    );
  });

  it("rejects a property outside the configured company", async () => {
    process.env.PUBLIC_PORTAL_COMPANY_ID = "company-1";
    companyFindFirst.mockResolvedValue(activeCompany);
    propertyFindFirst.mockResolvedValue(null);

    await expect(getPublicPortalCompany("property-other")).resolves.toBeNull();
    expect(propertyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "property-other", company_id: "company-1", status: "active" },
      })
    );
  });

  it("can derive the tenant from an active property", async () => {
    propertyFindFirst.mockResolvedValue({ company: activeCompany });

    await expect(getPublicPortalCompany("property-1")).resolves.toEqual({
      company: activeCompany,
      owner: activeCompany.users[0],
    });
    expect(propertyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "property-1", status: "active", company: { status: "active" } },
      })
    );
  });
});
