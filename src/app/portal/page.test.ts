import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public portal pages", () => {
  it("pass created, ref, reason and token from the URL into the first HTML paint", () => {
    const root = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const company = readFileSync(new URL("./[companySlug]/page.tsx", import.meta.url), "utf8");
    for (const source of [root, company]) {
      expect(source).toContain("searchParams");
      expect(source).toContain("initialCreated={");
      expect(source).toContain("initialReference={");
      expect(source).toContain("initialReason={");
      expect(source).toContain("initialToken={");
      expect(source).toContain("initialTrackedTicket={");
      expect(source).toContain("loadPortalTrackedTicket");
      expect(source).not.toContain("initialEmail");
    }
  });
});
