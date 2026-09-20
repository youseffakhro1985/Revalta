import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("budget create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-budgetrad"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-budgetrad"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-budgetrad"');
  });
});

describe("budget leftover filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="budgetfilter"');
    expect(source).toContain('id="budget-sok"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#budgetfilter"');
    expect(source).toContain('id="ny-budgetrad"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("budget-sok")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Budgetraderna hämtas.");
    expect(source).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});

describe("budget leftover rows first HTML", () => {
  it("keeps leftover budget rows in the first HTML without stealing create or filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="budgetlista"');
    expect(source).toContain('window.location.hash !== "#budgetlista"');
    expect(source).toContain("Budgetraderna hämtas.");
    expect(source).toContain('id="ny-budgetrad"');
    expect(source).toContain('id="budgetfilter"');
    expect(source).toContain('id="budget-sok"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("autoFocus");
  });
});
