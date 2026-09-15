import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician planning hash", () => {
  it("keeps the workload hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="arbetsbelastning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('href="#arbetsbelastning"');
    expect(source).toContain("Fördela arbete");
    expect(source).toContain("canAssign || loading");
    expect(source).toContain('window.location.hash !== "#arbetsbelastning"');
    expect(source).toContain("scrollIntoView");
  });
});
