import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("arbetsorder notify copy", () => {
  it("tells staff that assigning a vendor emails the register contact", () => {
    const createPage = readFileSync(new URL("./ny/page.tsx", import.meta.url), "utf8");
    const detailPage = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
    expect(createPage).toContain("mejlas leverantörens kontaktadress i registret");
    expect(detailPage).toContain("Vid koppling, paus och avslut mejlas leverantörens kontaktadress i registret");
  });

  it("tells staff that pause and complete email the assignee", () => {
    const detailPage = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
    expect(detailPage).toContain("Vid tilldelning, paus och avslut mejlas den ansvariga");
  });
});
