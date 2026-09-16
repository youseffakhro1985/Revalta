import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recurring incident escalation hash", () => {
  it("keeps the escalation action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kontrollera-eskalering"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kontrollera-eskalering"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
  });
});

describe("recurring incident leftover list first HTML", () => {
  it("keeps leftover incidents in the first HTML without stealing escalation", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="incidentlista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#incidentlista"');
    expect(source).toContain('id="kontrollera-eskalering"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Incidenterna hämtas.");
    expect(source).not.toContain("Hämtar incidenter…");
  });
});
