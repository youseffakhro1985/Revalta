import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mina aviseringar hash target", () => {
  it("keeps mina-val in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="mina-val"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash');
    expect(source).toContain('hash !== "#mina-val"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#mina-val"');
    expect(source).toContain("disabled={loading || saving}");
    expect(source).not.toContain("h-52 animate-pulse");
  });
});

describe("mina aviseringar leftover status first HTML", () => {
  it("keeps leftover status in the first HTML and focuses save after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="minastatus"');
    expect(source).toContain('id="mina-spara"');
    expect(source).toContain('window.location.hash !== "#minastatus"');
    expect(source).toContain('document.getElementById("mina-spara")?.focus()');
    expect(source).toContain("Valen hämtas.");
    expect(source).toContain('id="mina-val"');
    expect(source).toContain('id="mina-val-toggle"');
    expect(source).toContain("Spara mina val");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={saving || loading}");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="mina-spara" autoFocus');
    expect(sticky).toContain('href: "/dashboard/installningar/mina-aviseringar#mina-val"');
    expect(sticky).not.toContain("#minastatus");
    expect(sticky).not.toContain("#mina-spara");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});

describe("mina aviseringar sticky mutate first HTML", () => {
  it("keeps Mina val focused after load without leftover status stealing the sticky", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="mina-val"');
    expect(source).toContain('id="mina-val-toggle"');
    expect(source).toContain("autoFocus");
    expect(source).toContain('window.location.hash !== "#mina-val"');
    expect(source).toContain('document.getElementById("mina-val-toggle")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('id="minastatus"');
    expect(source).toContain("disabled={saving || loading}");
    const stickyIndex = source.indexOf('id="mina-val-toggle"');
    const leftoverIndex = source.indexOf('id="minastatus"');
    expect(stickyIndex).toBeGreaterThan(-1);
    expect(leftoverIndex).toBeGreaterThan(stickyIndex);
  });
});
