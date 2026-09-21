import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ny fastighet first HTML", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("keeps the create form in the first HTML and focuses the name after load", () => {
    expect(source).toContain("\"use client\"");
    expect(source).toContain('id="fastighet-editor"');
    expect(source).toContain('id="fastighet-namn"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("fastighet-namn")?.focus()');
    expect(source).toContain("Skapa fastighet");
    expect(source).not.toContain("＋");
  });
});
