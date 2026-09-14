import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolvePublicPortalCompanyMock, propertyFindManyMock } = vi.hoisted(() => ({
  resolvePublicPortalCompanyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findMany: propertyFindManyMock },
  },
}));

vi.mock("@/lib/public-portal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-portal")>()),
  resolvePublicPortalCompany: resolvePublicPortalCompanyMock,
}));

import { loadPublicPortalCatalog, loadPublicPortalCatalogSafe } from "./public-portal-properties";

describe("loadPublicPortalCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicPortalCompanyMock.mockResolvedValue({
      company: { id: "company-1", name: "Demo Fastigheter" },
      owner: { id: "owner-1", email: "owner@example.com" },
    });
    propertyFindManyMock.mockResolvedValue([
      {
        id: "property-1",
        name: "Storgatan 1",
        address: "Storgatan 1",
        postal_code: "12345",
        city: "Stockholm",
        company: { name: "Demo Fastigheter" },
      },
    ]);
  });

  it("scopes properties to the resolved company", async () => {
    const catalog = await loadPublicPortalCatalog("demo");
    expect(resolvePublicPortalCompanyMock).toHaveBeenCalledWith({ companySlug: "demo" });
    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", status: "active", deleted_at: null },
    }));
    expect(catalog.error).toBe("");
    expect(catalog.company?.slug).toBeTruthy();
    expect(catalog.properties).toHaveLength(1);
  });

  it("returns a portal-unavailable catalog without leaking other tenants when resolve fails", async () => {
    resolvePublicPortalCompanyMock.mockResolvedValue(null);
    const catalog = await loadPublicPortalCatalog("missing");
    expect(catalog.properties).toEqual([]);
    expect(catalog.company).toBeNull();
    expect(catalog.error).toMatch(/konfigurerad/i);
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("keeps the portal page renderable when the catalog lookup throws", async () => {
    propertyFindManyMock.mockRejectedValue(new Error("db unavailable"));
    const catalog = await loadPublicPortalCatalogSafe("demo");
    expect(catalog.properties).toEqual([]);
    expect(catalog.error).toMatch(/tillgänglig/i);
  });
});
