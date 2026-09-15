import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("eskaleringar hash targets", () => {
  it("keeps regler, driftkontroll and historik in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="regler"');
    expect(source).toContain('id="driftkontroll"');
    expect(source).toContain('id="historik"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("window.location.hash");
    expect(source).toContain('hash !== "#regler"');
    expect(source).toContain('hash !== "#driftkontroll"');
    expect(source).toContain('hash !== "#historik"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#regler"');
    expect(source).toContain('href="#driftkontroll"');
    expect(source).toContain('href="#historik"');
  });
});
