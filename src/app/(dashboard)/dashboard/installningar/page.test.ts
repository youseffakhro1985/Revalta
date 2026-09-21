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
  it("keeps leftover account overview in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="kontooversikt"');
    expect(source).toContain('id="konto-uppdatera"');
    expect(source).toContain('window.location.hash !== "#kontooversikt"');
    expect(source).toContain('document.getElementById("konto-uppdatera")?.focus()');
    expect(source).toContain("Uppgifterna hämtas.");
    expect(source).toContain('id="losenord"');
    expect(source).toContain('id="current-password"');
    expect(source).toContain('document.getElementById("current-password")?.focus()');
    expect(source).toContain('id="profil"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={initialLoading || Boolean(saving)}");
    expect(source).not.toContain("autoFocus");
    expect(source).not.toContain("Laddar…");
    expect(sticky).toContain('href: "/dashboard/installningar#losenord"');
    expect(sticky).not.toContain("#kontooversikt");
    expect(sticky).not.toContain("#konto-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});

describe("installningar profil mutate first HTML", () => {
  it("focuses profil name after load without stealing Byt lösenord or leftover overview", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="profil"');
    expect(source).toContain('id="profil-namn"');
    expect(source).toContain('window.location.hash !== "#profil"');
    expect(source).toContain('document.getElementById("profil-namn")?.focus()');
    expect(source).toContain('id="current-password"');
    expect(source).toContain('document.getElementById("current-password")?.focus()');
    expect(source).toContain('id="kontooversikt"');
    expect(source).toContain('id="losenord"');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain("autoFocus");
    const profilIndex = source.indexOf('id="profil-namn"');
    const stickyIndex = source.indexOf('id="current-password"');
    expect(profilIndex).toBeGreaterThan(-1);
    expect(stickyIndex).toBeGreaterThan(profilIndex);
  });
});

describe("installningar organisation mutate first HTML", () => {
  it("focuses organisation name after load without stealing Byt lösenord or profil", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="organisation"');
    expect(source).toContain('id="organisationsnamn"');
    expect(source).toContain('window.location.hash !== "#organisation"');
    expect(source).toContain('document.getElementById("organisationsnamn")?.focus()');
    expect(source).toContain('id="profil-namn"');
    expect(source).toContain('id="current-password"');
    expect(source).toContain('document.getElementById("current-password")?.focus()');
    expect(source).toContain('id="kontooversikt"');
    expect(source).toContain('id="losenord"');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain("autoFocus");
    const orgIndex = source.indexOf('id="organisationsnamn"');
    const stickyIndex = source.indexOf('id="current-password"');
    const profilIndex = source.indexOf('id="profil-namn"');
    expect(orgIndex).toBeGreaterThan(-1);
    expect(orgIndex).toBeGreaterThan(profilIndex);
    expect(stickyIndex).toBeGreaterThan(orgIndex);
  });
});
