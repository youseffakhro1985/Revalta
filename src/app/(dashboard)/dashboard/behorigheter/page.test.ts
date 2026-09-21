import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("behorigheter hash targets", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const scroll = readFileSync(new URL("./hash-scroll.tsx", import.meta.url), "utf8");
  const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");

  it("keeps matris and users in the first HTML and focuses Hantera roller after load", () => {
    expect(page).toContain('id="behorighetsmatris"');
    expect(page).toContain('id="anvandare"');
    expect(page).toContain('id="hantera-roller"');
    expect(page).toContain("scroll-mt-36");
    expect(page).toContain('href="#behorighetsmatris"');
    expect(page).toContain('href="#anvandare"');
    expect(page).toContain('href="/dashboard/team#bjud-in"');
    expect(page).toContain("autoFocus");
    expect(scroll).toContain("window.location.hash");
    expect(scroll).toContain("scrollIntoView");
    expect(scroll).toContain('hash === "#anvandare"');
    expect(scroll).toContain('document.getElementById("hantera-roller")?.focus()');
  });

  it("does not steal Hantera roller sticky or leftover matris", () => {
    expect(sticky).toContain('current === "/dashboard/behorigheter"');
    expect(sticky).toContain('href: "/dashboard/team#bjud-in"');
    expect(sticky).not.toContain("#hantera-roller");
    expect(sticky).not.toContain("#anvandare");
    expect(sticky).not.toContain("#behorighetsmatris");
    expect(sticky).not.toContain("#behorighetsmatris-lank");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(page).toContain('id="behorighetsmatris"');
  });
});

describe("behorigheter leftover matrix first HTML", () => {
  it("keeps leftover matrix in the first HTML and focuses the section after load without a second autoFocus", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const scroll = readFileSync(new URL("./hash-scroll.tsx", import.meta.url), "utf8");
    expect(page).toContain('id="behorighetsmatris"');
    expect(page).toContain('id="behorighetsmatris-lank"');
    expect(page).toContain("scroll-mt-36");
    expect(scroll).toContain('hash === "#behorighetsmatris"');
    expect(scroll).toContain('document.getElementById("behorighetsmatris-lank")?.focus()');
    expect(scroll).toContain('hash === "#anvandare"');
    expect(scroll).toContain('document.getElementById("hantera-roller")?.focus()');
    expect(page).toContain('id="hantera-roller"');
    expect(page).toContain("autoFocus");
    expect((page.match(/autoFocus/g) || []).length).toBe(1);
    expect(page).not.toContain('id="behorighetsmatris-lank" autoFocus');
  });
});
