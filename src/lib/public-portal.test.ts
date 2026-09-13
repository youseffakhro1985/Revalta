import { describe, expect, it } from "vitest";
import { extractPortalCompanySlug, generatePublicReference, toPortalSlug } from "./public-portal";

describe("public-portal helpers", () => {
  it("skapar stabila sluggar från bolagsnamn", () => {
    expect(toPortalSlug("Åkermans Fastigheter AB", "abc12345-xxxx")).toBe("akermans-fastigheter-ab");
    expect(toPortalSlug("!!!", "abc12345-xxxx")).toBe("abc12345");
  });

  it("läser companySlug från query, header eller body", () => {
    const request = new Request("https://www.revalta.se/api/public/properties?companySlug=demo-bolag", {
      headers: { "x-portal-company-slug": "header-bolag" },
    });
    expect(extractPortalCompanySlug(request)).toBe("header-bolag");
    expect(extractPortalCompanySlug(new Request("https://www.revalta.se/api/public/properties?companySlug=demo-bolag"))).toBe("demo-bolag");
    expect(extractPortalCompanySlug(new Request("https://www.revalta.se/api/public/properties"), "body-bolag")).toBe("body-bolag");
  });

  it("generates unique RV-year references without Math.random", () => {
    const refs = new Set(Array.from({ length: 20 }, () => generatePublicReference()));
    expect(refs.size).toBe(20);
    for (const value of refs) {
      expect(value).toMatch(/^RV-\d{4}-[A-F0-9]{6}$/);
    }
  });
});
