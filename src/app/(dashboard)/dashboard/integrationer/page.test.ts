import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("integrationer hash targets", () => {
  it("keeps fakturaexport and events in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="fakturaexport"');
    expect(source).toContain('id="handelser"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('href="#fakturaexport"');
    expect(source).toContain('href="#handelser"');
    expect(source).toContain('hash !== "#fakturaexport"');
    expect(source).toContain('hash !== "#handelser"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="/dashboard/integrationer/fakturaexporter"');
  });
});
