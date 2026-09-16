import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("uthyrning create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");

  it("opens the create form from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain('params.create === "1"');
    expect(page).toContain("initialCreate");
  });

  it("keeps the sticky-header create contract and native close", () => {
    expect(form).toContain("useState(initialCreate)");
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("closeCreate");
    expect(form).toContain("router.replace");
    expect(form).toContain("Nytt avtal");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).toContain("canManage || loading");
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain("scrollIntoView");
    expect(form).not.toContain("＋");
  });
});

describe("uthyrning occupancy filter first HTML", () => {
  it("keeps the vacancy filter in the first HTML and scrolls after load", () => {
    const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="bestandsfilter"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#bestandsfilter"');
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("autoFocus");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Nytt avtal");
    expect(form).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-sand-100" />)}');
    expect(form).not.toContain('{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});

describe("uthyrning leftover occupancy first HTML", () => {
  it("keeps leftover occupancy in the first HTML without stealing create", () => {
    const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="uthyrningslage"');
    expect(form).toContain('window.location.hash !== "#uthyrningslage"');
    expect(form).toContain("Uthyrningsläget hämtas.");
    expect(form).toContain("Nytt avtal");
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("scrollIntoView");
  });
});

describe("uthyrning leftover objects first HTML", () => {
  it("keeps leftover objects in the first HTML without stealing create", () => {
    const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="objektlista"');
    expect(form).toContain('window.location.hash !== "#objektlista"');
    expect(form).toContain("Objekten hämtas.");
    expect(form).toContain("Nytt avtal");
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain('id="bestandsfilter"');
    expect(form).toContain('id="uthyrningslage"');
    expect(form).toContain('get("create") === "1"');
  });
});
