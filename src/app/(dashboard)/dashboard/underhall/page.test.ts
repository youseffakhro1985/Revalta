import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("underhall create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-underhallsatgard"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-underhallsatgard"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("permissions.canManage || loading");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-underhallsatgard"');
  });
});

describe("underhall leftover plan first HTML", () => {
  it("keeps the create form and plan in the first HTML without stealing Ny åtgärd", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="flerarsplan"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#flerarsplan"');
    expect(source).toContain('id="ny-underhallsatgard"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading || !permissions.canManage");
    expect(source).toContain("Åtgärderna hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-100");
    expect(source).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});
