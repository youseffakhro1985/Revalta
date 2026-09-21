import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("integrationer hash targets", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");

  it("keeps fakturaexport focused after load without leftover events stealing it", () => {
    expect(source).toContain('id="fakturaexport"');
    expect(source).toContain('id="handelser"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('href="#fakturaexport"');
    expect(source).toContain('href="#handelser"');
    expect(source).toContain('window.location.hash !== "#fakturaexport"');
    expect(source).toContain('window.location.hash !== "#handelser"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("fakturaexport")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain('href="/dashboard/integrationer/fakturaexporter"');
  });

  it("does not steal the Fakturaexport page sticky", () => {
    expect(sticky).toContain('current === "/dashboard/integrationer"');
    expect(sticky).toContain('href: "/dashboard/integrationer/fakturaexporter"');
    expect(sticky).not.toContain("#fakturaexport");
    expect(sticky).not.toContain("#handelser");
    expect(sticky).not.toContain("#handelser-lank");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});

describe("integrationer leftover events first HTML", () => {
  it("keeps leftover events in the first HTML and focuses the section after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="handelser"');
    expect(source).toContain('id="handelser-lank"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('hash !== "#handelser"');
    expect(source).toContain('document.getElementById("handelser-lank")?.focus()');
    expect(source).toContain('id="fakturaexport"');
    expect(source).toContain('document.getElementById("fakturaexport")?.focus()');
    expect(source).toContain("Händelserna hämtas.");
    expect(source).toContain("autoFocus");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="handelser-lank" autoFocus');
    expect(source).not.toContain('{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-sand-100" />)}');
  });
});
