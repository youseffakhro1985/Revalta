import { beforeEach, describe, expect, it, vi } from "vitest";

const { companyFindFirstMock, companyFindManyMock, propertyFindFirstMock } = vi.hoisted(() => ({
  companyFindFirstMock: vi.fn(),
  companyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: { findFirst: companyFindFirstMock, findMany: companyFindManyMock },
    property: { findFirst: propertyFindFirstMock },
  },
}));

import {
  getConfiguredPortalCompanyId,
  getPublicPortalCompany,
  getPublicPortalCompanyBySlug,
  REVALTA_PORTAL_COMPANY_ID,
} from "./public-portal";

const PORTAL_COMPANY = REVALTA_PORTAL_COMPANY_ID;
const OTHER_COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PORTAL_PROPERTY = "property-portal";
const OTHER_PROPERTY = "property-other";

function portalCompanyRow(id = PORTAL_COMPANY, name = "Revalta Portalbolag") {
  return {
    id,
    name,
    users: [{ id: "owner-1", email: "owner@example.se" }],
  };
}

describe("public portal tenant fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    companyFindFirstMock.mockResolvedValue(portalCompanyRow());
    propertyFindFirstMock.mockResolvedValue({ id: PORTAL_PROPERTY });
  });

  it("does not resolve a tenant without an explicit portal company", async () => {
    expect(getConfiguredPortalCompanyId()).toBeNull();
    await expect(getPublicPortalCompany()).resolves.toBeNull();
    await expect(getPublicPortalCompany(OTHER_PROPERTY)).resolves.toBeNull();
    await expect(getPublicPortalCompanyBySlug("nagon-slug")).resolves.toBeNull();
    expect(companyFindFirstMock).not.toHaveBeenCalled();
    expect(companyFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects another company's UUID as a portal slug", async () => {
    vi.stubEnv("PUBLIC_PORTAL_COMPANY_ID", PORTAL_COMPANY);
    await expect(getPublicPortalCompanyBySlug(OTHER_COMPANY)).resolves.toBeNull();
    expect(companyFindFirstMock).not.toHaveBeenCalled();
    expect(companyFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects a slug that does not belong to the configured portal tenant", async () => {
    vi.stubEnv("PUBLIC_PORTAL_COMPANY_ID", PORTAL_COMPANY);
    await expect(getPublicPortalCompanyBySlug("annan-hyresvard")).resolves.toBeNull();
    expect(companyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PORTAL_COMPANY, status: "active" },
    }));
  });

  it("resolves only the configured portal tenant and its own properties", async () => {
    vi.stubEnv("PUBLIC_PORTAL_COMPANY_ID", PORTAL_COMPANY);
    const portal = await getPublicPortalCompany(PORTAL_PROPERTY);
    expect(portal?.company.id).toBe(PORTAL_COMPANY);
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: PORTAL_PROPERTY,
        company_id: PORTAL_COMPANY,
        status: "active",
        deleted_at: null,
      },
    }));
  });

  it("does not attach another tenant's property to the portal company", async () => {
    vi.stubEnv("PUBLIC_PORTAL_COMPANY_ID", PORTAL_COMPANY);
    propertyFindFirstMock.mockResolvedValue(null);
    await expect(getPublicPortalCompany(OTHER_PROPERTY)).resolves.toBeNull();
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: OTHER_PROPERTY,
        company_id: PORTAL_COMPANY,
      }),
    }));
  });
});
