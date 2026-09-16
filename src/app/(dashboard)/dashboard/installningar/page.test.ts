import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("installningar overview hash targets", () => {
  it("keeps profil, organisation and losenord in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="profil"');
    expect(source).toContain('id="organisation"');
    expect(source).toContain('id="losenord"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("window.location.hash");
    expect(source).toContain('hash !== "#profil"');
    expect(source).toContain('hash !== "#organisation"');
    expect(source).toContain('hash !== "#losenord"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#profil"');
    expect(source).toContain('href="#organisation"');
    expect(source).toContain('href="#losenord"');
    expect(source).toContain('id="current-password"');
    expect(source).toContain('document.getElementById("current-password")?.focus()');
    expect(source).not.toContain('<form id="losenord"');
  });
});

describe("installningar leftover account overview first HTML", () => {
  it("keeps leftover account overview in the first HTML without stealing Byt lösenord", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kontooversikt"');
    expect(source).toContain('window.location.hash !== "#kontooversikt"');
    expect(source).toContain("Uppgifterna hämtas.");
    expect(source).toContain('id="losenord"');
    expect(source).toContain('id="profil"');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain("Laddar…");
  });
});
