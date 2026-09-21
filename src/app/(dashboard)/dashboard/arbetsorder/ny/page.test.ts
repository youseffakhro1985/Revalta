import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ny arbetsorder first HTML", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("keeps the create form in the first HTML and focuses the title after load", () => {
    expect(source).toContain("\"use client\"");
    expect(source).toContain('id="order-editor"');
    expect(source).toContain('id="order-rubrik"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("order-rubrik")?.focus()');
    expect(source).toContain("Ny arbetsorder");
    expect(source).not.toContain("＋");
  });
});
