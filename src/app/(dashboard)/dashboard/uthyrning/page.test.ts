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
    expect(form).toContain('id="lease-namn"');
    expect(form).toContain('document.getElementById("lease-namn")?.focus()');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain("scrollIntoView");
    expect(form).not.toContain("＋");
  });
});

describe("uthyrning occupancy filter first HTML", () => {
  it("keeps the vacancy filter in the first HTML and scrolls after load", () => {
    const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="bestandsfilter"');
    expect(form).toContain('id="bestand-sok"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#bestandsfilter"');
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain('id="lease-namn"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("bestand-sok")?.focus()');
    expect(form).toContain("autoFocus");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Nytt avtal");
    expect(form).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-sand-100" />)}');
    expect(form).not.toContain('{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});

describe("uthyrning leftover occupancy first HTML", () => {
  it("keeps leftover occupancy in the first HTML and focuses handover after load without a second autoFocus", () => {
    const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(form).toContain('id="uthyrningslage"');
    expect(form).toContain('id="uthyrningslage-overlamning"');
    expect(form).toContain('window.location.hash !== "#uthyrningslage"');
    expect(form).toContain("Uthyrningsläget hämtas.");
    expect(form).toContain("Nytt avtal");
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain('id="lease-namn"');
    expect(form).toContain('document.getElementById("lease-namn")?.focus()');
    expect(form).toContain('document.getElementById("uthyrningslage-overlamning")?.focus()');
    expect(form).toContain('id="bestand-sok"');
    expect(form).toContain('document.getElementById("bestand-sok")?.focus()');
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("canManage || loading");
    expect((form.match(/autoFocus/g) || []).length).toBe(2);
    expect(form).not.toContain('id="uthyrningslage-overlamning" autoFocus');
    expect(sticky).toContain('href: "/dashboard/uthyrning?create=1"');
    expect(sticky).not.toContain("#uthyrningslage");
    expect(sticky).not.toContain("#uthyrningslage-overlamning");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
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
    expect(form).toContain('id="bestand-sok"');
    expect(form).toContain('id="uthyrningslage"');
    expect(form).toContain('get("create") === "1"');
  });
});

describe("uthyrning leftover lease history first HTML", () => {
  it("keeps leftover lease history in the first HTML without stealing create", () => {
    const form = readFileSync(new URL("./uthyrning-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="avtalshistorik"');
    expect(form).toContain('window.location.hash !== "#avtalshistorik"');
    expect(form).toContain("Avtalen hämtas.");
    expect(form).not.toContain("Hämtar avtal…");
    expect(form).toContain("Nytt avtal");
    expect(form).toContain('id="lease-editor"');
    expect(form).toContain('get("create") === "1"');
  });
});
