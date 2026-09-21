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
    expect(page).toContain('id="behorighetsmatris"');
  });
});
