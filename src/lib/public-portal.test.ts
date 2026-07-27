import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  company: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  property: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ default: dbMock }));

import {
  extractPortalCompanySlug,
  generatePublicReference,
  getPublicPortalCompany,
  getPublicPortalCompanyBySlug,
  toPortalSlug,
} from "./public-portal";

describe("public-portal helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("skapar stabila sluggar från bolagsnamn", () => {
    expect(toPortalSlug("Åkermans Fastigheter AB", "abc12345-xxxx")).toBe("akermans-fastigheter-ab");
    expect(toPortalSlug("!!!", "abc12345-xxxx")).toBe("abc12345");
  });

  it("läser companySlug från query, header eller body i säker prioritetsordning", () => {
    const request = new Request("https://www.revalta.se/api/public/properties?companySlug=demo-bolag", {
      headers: { "x-portal-company-slug": "header-bolag" },
    });
    expect(extractPortalCompanySlug(request)).toBe("header-bolag");
    expect(extractPortalCompanySlug(new Request("https://www.revalta.se/api/public/properties?companySlug=demo-bolag"))).toBe("demo-bolag");
    expect(extractPortalCompanySlug(new Request("https://www.revalta.se/api/public/properties"), "body-bolag")).toBe("body-bolag");
  });

  it("avvisar onormalt långa sluggar innan databasuppslag", async () => {
    const oversized = "a".repeat(65);
    expect(extractPortalCompanySlug(new Request("https://www.revalta.se"), oversized)).toBeNull();
    await expect(getPublicPortalCompanyBySlug(oversized)).resolves.toBeNull();
    expect(dbMock.company.findFirst).not.toHaveBeenCalled();
    expect(dbMock.company.findMany).not.toHaveBeenCalled();
  });

  it("skapar kryptografiskt formaterade publika referenser", () => {
    const references = new Set(Array.from({ length: 50 }, () => generatePublicReference()));
    expect(references.size).toBe(50);
    for (const reference of references) {
      expect(reference).toMatch(/^RV-\d{4}-[0-9A-F]{10}$/);
    }
  });

  it("prioriterar owner framför äldre tekniker som portalägare", async () => {
    vi.stubEnv("PUBLIC_PORTAL_COMPANY_ID", "company-1");
    dbMock.company.findFirst.mockResolvedValue({
      id: "company-1",
      name: "Demo Fastigheter",
      users: [
        { id: "tech-1", email: "tech@example.se", role: "technician" },
        { id: "owner-1", email: "owner@example.se", role: "owner" },
      ],
    });

    const portal = await getPublicPortalCompany();
    expect(portal?.owner).toEqual({ id: "owner-1", email: "owner@example.se", role: "owner" });
  });

  it("avvisar företag som bara har viewer eller resident som aktiva användare", async () => {
    vi.stubEnv("PUBLIC_PORTAL_COMPANY_ID", "company-1");
    dbMock.company.findFirst.mockResolvedValue({
      id: "company-1",
      name: "Demo Fastigheter",
      users: [
        { id: "viewer-1", email: "viewer@example.se", role: "viewer" },
        { id: "resident-1", email: "resident@example.se", role: "resident" },
      ],
    });

    await expect(getPublicPortalCompany()).resolves.toBeNull();
  });

  it("gissar aldrig mellan flera aktiva företag", async () => {
    dbMock.company.findMany.mockResolvedValue([
      { id: "company-1", name: "A", users: [{ id: "owner-1", email: "a@example.se", role: "owner" }] },
      { id: "company-2", name: "B", users: [{ id: "owner-2", email: "b@example.se", role: "owner" }] },
    ]);

    await expect(getPublicPortalCompany()).resolves.toBeNull();
  });
});
