import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project detail save hash", () => {
  it("keeps the save form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-projekt"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-projekt"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !project");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});

describe("project activity panel first HTML", () => {
  it("renders comments while the project is still loading", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("project || loading ? <OperationalActivityPanel");
    expect(source).toContain("project?.id || id");
    expect(source).not.toContain("h-64 animate-pulse rounded-2xl bg-sand-100");
  });
});

describe("project leftover metrics first HTML", () => {
  it("keeps metrics in the first HTML and scrolls after load without stealing save", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="projektnyckeltal"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#projektnyckeltal"');
    expect(source).toContain('id="spara-projekt"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Nyckeltalen hämtas.");
    expect(source).not.toContain("h-40 animate-pulse rounded-2xl bg-sand-100");
  });
});

describe("project documents panel first HTML", () => {
  it("renders documents while the project is still loading", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("project || loading ? <OperationalDocumentsPanel");
    expect(source).toContain("project?.id || id");
  });
});
