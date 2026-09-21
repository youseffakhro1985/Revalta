import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("felanmalan create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./felanmalan-page.tsx", import.meta.url), "utf8");

  it("opens the create dialog from the server search params", () => {
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
    expect(form).toContain("Nytt ärende");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).toContain('id="arende-editor"');
    expect(form).toContain('id="arende-titel"');
    expect(form).toContain('document.getElementById("arende-titel")?.focus()');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain("scrollIntoView");
    expect(form).not.toContain("＋");
  });
});

describe("felanmalan leftover list first HTML", () => {
  it("keeps the recent list in the first HTML and scrolls after load without stealing create", () => {
    const form = readFileSync(new URL("./felanmalan-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="senastearenden"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#senastearenden"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("Nytt ärende");
    expect(form).toContain('id="arende-editor"');
    expect(form).toContain('id="arende-titel"');
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("Ärendena hämtas.");
    expect(form).not.toContain('{[1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}');
  });

  it("keeps the list filter hash in the first HTML without stealing create or #arendefilter", () => {
    const form = readFileSync(new URL("./felanmalan-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="arendeurval"');
    expect(form).toContain('window.location.hash !== "#arendeurval"');
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("permissions.canManage || loading");
    expect(form).toContain("Nytt ärende");
    expect(form).toContain('id="arende-editor"');
    expect(form).toContain('id="arende-titel"');
    expect(form).toContain('get("create") === "1"');
    expect(form).not.toContain('id="arendefilter"');
    expect(form).not.toContain("#arendefilter");
  });
});
