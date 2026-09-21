import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ny utbetalning first HTML", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");

  it("keeps the payout form in the first HTML and focuses the property after load", () => {
    expect(source).toContain("\"use client\"");
    expect(source).toContain('id="utbetalning-editor"');
    expect(source).toContain('id="utbetalning-fastighet"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("utbetalning-fastighet")?.focus()');
    expect(source).toContain("Registrera utbetalning");
    expect(source).not.toContain("＋");
  });

  it("does not add a page sticky on Ny utbetalning", () => {
    expect(sticky).toContain('href: "/dashboard/ekonomi/ny-utbetalning"');
    expect(sticky).toContain('current === "/dashboard/ekonomi"');
    expect(sticky).not.toContain('current === "/dashboard/ekonomi/ny-utbetalning"');
    expect(sticky).not.toContain("#utbetalning-editor");
    expect(sticky).not.toContain("#utbetalning-fastighet");
  });
});
