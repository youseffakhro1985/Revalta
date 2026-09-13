import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function assertLinksDisablePrefetch(source: string) {
  const linkOpens = [...source.matchAll(/<Link\b/g)];
  const prefetchOff = [...source.matchAll(/prefetch=\{false\}/g)];
  expect(linkOpens.length).toBeGreaterThan(0);
  expect(prefetchOff.length).toBe(linkOpens.length);
}

describe("dashboard overview prefetch", () => {
  it("does not let shell, onboarding, portfolio or Fastigheter fan out module RSC behind Command Center search", () => {
    assertLinksDisablePrefetch(readFileSync(new URL("./dashboard-shell.tsx", import.meta.url), "utf8"));
    assertLinksDisablePrefetch(readFileSync(new URL("./first-run-onboarding.tsx", import.meta.url), "utf8"));
    assertLinksDisablePrefetch(readFileSync(new URL("./portfolio-dashboard.tsx", import.meta.url), "utf8"));
    assertLinksDisablePrefetch(readFileSync(new URL("./fastigheter-map-dock.tsx", import.meta.url), "utf8"));
    assertLinksDisablePrefetch(readFileSync(new URL("../../app/(dashboard)/dashboard/fastigheter/page.tsx", import.meta.url), "utf8"));
    expect(readFileSync(new URL("./dashboard-shell.tsx", import.meta.url), "utf8")).toContain("<GlobalSearch userId={userId} role={role} />");
  });
});
