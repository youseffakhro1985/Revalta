import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("team invite hash", () => {
  it("keeps the invite form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="bjud-in"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#bjud-in"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={!canManage}");
    expect(source).not.toContain('<form id="bjud-in"');
  });
});

describe("team member list first HTML", () => {
  it("keeps the member list in the first HTML and scrolls after load without stealing invite", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="teamlista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#teamlista"');
    expect(source).toContain('id="bjud-in"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Teamet hämtas.");
    expect(source).not.toContain('{[1,2,3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});
