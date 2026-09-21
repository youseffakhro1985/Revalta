import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aterkommande create hash", () => {
  it("keeps the schema form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="nytt-schema"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#nytt-schema"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('id="schema-fastighet"');
    expect(source).toContain('document.getElementById("schema-fastighet")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="nytt-schema"');
  });
});

describe("aterkommande leftover list first HTML", () => {
  it("keeps leftover schedules in the first HTML without stealing Nytt schema", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="schemalista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#schemalista"');
    expect(source).toContain('id="nytt-schema"');
    expect(source).toContain('id="schema-fastighet"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Schemana hämtas.");
    expect(source).not.toContain("Hämtar scheman…");
  });
});

describe("aterkommande leftover run history first HTML", () => {
  it("keeps leftover run history in the first HTML without stealing Nytt schema", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="korhistorik"');
    expect(source).toContain('window.location.hash !== "#korhistorik"');
    expect(source).toContain("Körhistoriken hämtas.");
    expect(source).toContain('id="nytt-schema"');
    expect(source).toContain('id="schemalista"');
    expect(source).toContain("scrollIntoView");
  });
});
