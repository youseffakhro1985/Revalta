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

  it("keeps the create form hash target in the first HTML", () => {
    expect(form).toContain('id="ny-hyresavi"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#ny-hyresavi"');
    expect(form).toContain("canManage || loading");
    expect(form).toContain("autoFocus");
    expect(form).not.toContain('<form id="ny-hyresavi"');
  });
});

describe("hyresavisering leftover list first HTML", () => {
  it("keeps leftover notices in the first HTML without stealing Ny hyresavi", () => {
    const form = readFileSync(new URL("./rent-notices-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="avilista"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#avilista"');
    expect(form).toContain('id="ny-hyresavi"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("Hyresavierna hämtas.");
    expect(form).not.toContain("Hämtar hyresavier…");
    expect(form).toContain("canManage || loading");
  });
});
