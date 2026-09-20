import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notiser create hash", () => {
  it("keeps the publish form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="nytt-meddelande"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#nytt-meddelande"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain('id="notis-rubrik"');
    expect(source).toContain('document.getElementById("notis-rubrik")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("fieldset");
    expect(source).not.toContain('<form id="nytt-meddelande"');
  });
});

describe("notiser leftover filter first HTML", () => {
  it("keeps leftover notifications in the first HTML without stealing Nytt meddelande", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="notisfilter"');
    expect(source).toContain('id="notislista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#notisfilter"');
    expect(source).toContain('window.location.hash !== "#notislista"');
    expect(source).toContain('id="nytt-meddelande"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Notiserna hämtas.");
    expect(source).toContain("canManage || loading");
  });
});

describe("notiser leftover activity first HTML", () => {
  it("keeps leftover activity in the first HTML without stealing Nytt meddelande", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="notisaktivitet"');
    expect(source).toContain('window.location.hash !== "#notisaktivitet"');
    expect(source).toContain("Aktiviteten hämtas.");
    expect(source).toContain('id="nytt-meddelande"');
    expect(source).toContain('id="notis-rubrik"');
    expect(source).toContain('id="notisfilter"');
    expect(source).toContain('id="notislista"');
    expect(source).toContain("canManage || loading");
  });
});
