import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hyresavisering focus", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./rent-notices-page.tsx", import.meta.url), "utf8");

  it("reads the avi id from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.id");
    expect(page).toContain("initialFocusedId");
  });

  it("scrolls the requested avi into view from ?id=", () => {
    expect(form).toContain("URLSearchParams(window.location.search)");
    expect(form).toContain("rent-notice-${notice.id}");
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("focusedId");
    expect(form).toContain("initialFocusedId");
    expect(form).toContain("useState(initialFocusedId)");
  });
});
