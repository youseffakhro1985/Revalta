import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audit filter hash", () => {
  it("keeps the filter hash target in the first HTML", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain('href="#auditfilter"');
    expect(page).toContain("Filtrera logg");
  });

  it("scrolls to the system log filters after load", () => {
    const center = readFileSync(new URL("../../../../components/settings/audit-log-center.tsx", import.meta.url), "utf8");
    expect(center).toContain('id="auditfilter"');
    expect(center).toContain("scroll-mt-36");
    expect(center).toContain('window.location.hash !== "#auditfilter"');
    expect(center).toContain("scrollIntoView");
    expect(center).toContain("autoFocus");
  });
});
