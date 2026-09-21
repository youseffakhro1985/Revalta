import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("projekt create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./projekt-page.tsx", import.meta.url), "utf8");

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
    expect(form).toContain("Nytt projekt");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).toContain('id="projekt-editor"');
    expect(form).toContain('id="projekt-titel"');
    expect(form).toContain('document.getElementById("projekt-titel")?.focus()');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain("scrollIntoView");
    expect(form).not.toContain("＋");
  });
});

describe("projekt portfolio filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const form = readFileSync(new URL("./projekt-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="projektfilter"');
    expect(form).toContain('id="projekt-sok"');
    expect(form).toContain('id="projekt-editor"');
    expect(form).toContain('id="projekt-titel"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#projektfilter"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("projekt-sok")?.focus()');
    expect(form).toContain("Nytt projekt");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Projekten hämtas.");
    expect(form).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});

describe("projekt leftover portfolio first HTML", () => {
  it("keeps leftover projects in the first HTML and focuses clear after load without a second autoFocus", () => {
    const form = readFileSync(new URL("./projekt-page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(form).toContain('id="projektlista"');
    expect(form).toContain('id="projektlista-rensa"');
    expect(form).toContain('window.location.hash !== "#projektlista"');
    expect(form).toContain("Projekten hämtas.");
    expect(form).toContain("Nytt projekt");
    expect(form).toContain('id="projekt-editor"');
    expect(form).toContain('id="projekt-titel"');
    expect(form).toContain('document.getElementById("projekt-titel")?.focus()');
    expect(form).toContain('document.getElementById("projektlista-rensa")?.focus()');
    expect(form).toContain('id="projektfilter"');
    expect(form).toContain('id="projekt-sok"');
    expect(form).toContain('document.getElementById("projekt-sok")?.focus()');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("disabled={loading}");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
    expect(form).not.toContain('id="projektlista-rensa" autoFocus');
    expect(sticky).toContain('href: "/dashboard/projekt?create=1"');
    expect(sticky).not.toContain("#projektlista");
    expect(sticky).not.toContain("#projektlista-rensa");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/projekt", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
