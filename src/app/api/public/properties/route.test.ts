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

vi.mock("@/lib/public-portal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/public-portal")>("@/lib/public-portal");
  return {
    ...actual,
    resolvePublicPortalCompany: resolvePublicPortalCompanyMock,
  };
});

import { GET } from "./route";

describe("GET /api/public/properties", () => {
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

  it("returns properties scoped to the resolved company via companySlug", async () => {
    const response = await GET(
      new Request("https://www.revalta.se/api/public/properties?companySlug=demo"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(resolvePublicPortalCompanyMock).toHaveBeenCalledWith(
      expect.objectContaining({ companySlug: "demo" }),
    );
    expect(propertyFindManyMock).toHaveBeenCalledWith({
      where: { company_id: "company-1", status: "active", deleted_at: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        postal_code: true,
        city: true,
        company: { select: { name: true } },
      },
    });

    expect(body).toEqual({
      company: {
        id: "company-1",
        name: "Demo Fastigheter",
        slug: expect.any(String),
      },
      properties: [
        {
          id: "property-1",
          name: "Storgatan 1",
          address: "Storgatan 1",
          postal_code: "12345",
          city: "Stockholm",
          company: { name: "Demo Fastigheter" },
        },
      ],
    });
  });

  it("only exposes public-safe fields (no other tenant's company_id, no internal/financial data)", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/public/properties?companySlug=demo"));
    const body = await response.json();

    expect(Object.keys(body.properties[0]).sort()).toEqual(
      ["address", "city", "company", "id", "name", "postal_code"].sort(),
    );
    expect(Object.keys(body.company).sort()).toEqual(["id", "name", "slug"].sort());
  });

  it("reads companySlug from the x-portal-company-slug header when no query param is present", async () => {
    await GET(
      new Request("https://www.revalta.se/api/public/properties", {
        headers: { "x-portal-company-slug": "header-slug" },
      }),
    );

    expect(resolvePublicPortalCompanyMock).toHaveBeenCalledWith(
      expect.objectContaining({ companySlug: "header-slug" }),
    );
  });

  it("returns 503 when no identifying slug is provided and the portal cannot resolve", async () => {
    resolvePublicPortalCompanyMock.mockResolvedValue(null);

    const response = await GET(new Request("https://www.revalta.se/api/public/properties"));
    const body = await response.json();

    expect(resolvePublicPortalCompanyMock).toHaveBeenCalledWith(
      expect.objectContaining({ companySlug: null }),
    );
    expect(response.status).toBe(503);
    expect(body.error).toBe("Boendeportalen är inte konfigurerad ännu");
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 503 for an unresolvable/invalid companySlug", async () => {
    resolvePublicPortalCompanyMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://www.revalta.se/api/public/properties?companySlug=does-not-exist"),
    );

    expect(response.status).toBe(503);
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the database lookup fails", async () => {
    propertyFindManyMock.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(new Request("https://www.revalta.se/api/public/properties?companySlug=demo"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internt serverfel");
  });
});
