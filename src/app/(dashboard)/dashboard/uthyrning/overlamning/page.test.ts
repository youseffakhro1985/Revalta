import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("overlamning lease hash", () => {
  it("keeps the lease picker hash target in the first HTML", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain('href="#valj-avtal"');
    expect(page).toContain("Välj avtal");
  });

  it("scrolls to the lease picker after load", () => {
    const center = readFileSync(new URL("../../../../../components/leasing/lease-handover-center.tsx", import.meta.url), "utf8");
    expect(center).toContain('id="valj-avtal"');
    expect(center).toContain("scroll-mt-36");
    expect(center).toContain('window.location.hash !== "#valj-avtal"');
    expect(center).toContain("scrollIntoView");
    expect(center).toContain("autoFocus");
  });
});
