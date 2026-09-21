import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bokningar create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-bokning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-bokning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain('id="bokning-boende"');
    expect(source).toContain('document.getElementById("bokning-boende")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-bokning"');
  });
});

describe("bokningar leftover create form first HTML", () => {
  it("keeps the create form in the first HTML without a leftover pulse", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-bokning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("saving || loading || !canManage");
    expect(source).toContain("autoFocus");
    expect(source).toContain("canManage || loading");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-100");
  });
});

describe("bokningar leftover list first HTML", () => {
  it("keeps leftover bookings in the first HTML without stealing Ny bokning", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="bokningsfilter"');
    expect(source).toContain('id="bokning-sok"');
    expect(source).toContain('id="bokningslista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#bokningsfilter"');
    expect(source).toContain('window.location.hash !== "#bokningslista"');
    expect(source).toContain('id="ny-bokning"');
    expect(source).toContain('id="bokning-boende"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("bokning-sok")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Bokningarna hämtas.");
    expect(source).not.toContain("LoadingState");
    expect(source).not.toContain("Hämtar bokningar…");
  });
});
