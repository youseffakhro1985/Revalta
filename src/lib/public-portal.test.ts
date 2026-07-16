import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { companyFindFirst, companyFindMany, propertyFindFirst } = vi.hoisted(() => ({
  companyFindFirst: vi.fn(),
  companyFindMany: vi.fn(),
  propertyFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: { findFirst: companyFindFirst, findMany: companyFindMany },
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
    companyFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.PUBLIC_PORTAL_COMPANY_ID;
  });

  it("does not resolve an ambiguous or empty shared portal", async () => {
    await expect(getPublicPortalCompany()).resolves.toBeNull();
    expect(companyFindFirst).not.toHaveBeenCalled();
    expect(propertyFindFirst).not.toHaveBeenCalled();
    expect(companyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, where: { status: "active", users: { some: { status: "active" } } } })
    );
  });

  it("safely resolves a single-company installation", async () => {
    companyFindMany.mockResolvedValue([activeCompany]);
    await expect(getPublicPortalCompany()).resolves.toEqual({
      company: activeCompany,
      owner: activeCompany.users[0],
    });
  });

  it("requires explicit configuration when several companies are active", async () => {
    companyFindMany.mockResolvedValue([
      activeCompany,
      { ...activeCompany, id: "company-2", name: "Annan organisation" },
    ]);
    await expect(getPublicPortalCompany()).resolves.toBeNull();
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
