import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("skador create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./skador-page.tsx", import.meta.url), "utf8");

  it("opens the create form from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain('params.create === "1"');
    expect(page).toContain("initialCreate");
  });

  it("opens the create form from the sticky header query and clears it on close", () => {
    expect(form).toContain("useState(initialCreate)");
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("closeCreate");
    expect(form).toContain("router.replace");
    expect(form).toContain("Nytt skadeärende");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).toContain('id="skade-editor"');
    expect(form).toContain('id="skade-rubrik"');
    expect(form).toContain('document.getElementById("skade-rubrik")?.focus()');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain("scrollIntoView");
    expect(form).not.toContain("＋");
    expect(form).toContain("Skapa arbetsorder");
    expect(form).toContain("/api/insurance-claims/${claim.id}/work-order");
  });
});

describe("skador leftover list first HTML", () => {
  it("keeps leftover claims in the first HTML and focuses export after load without a second autoFocus", () => {
    const form = readFileSync(new URL("./skador-page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(form).toContain('id="skadefilter"');
    expect(form).toContain('id="skadelista"');
    expect(form).toContain('id="skadelista-csv"');
    expect(form).toContain('id="skada-sok"');
    expect(form).toContain('id="skade-editor"');
    expect(form).toContain('id="skade-rubrik"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#skadefilter"');
    expect(form).toContain('window.location.hash !== "#skadelista"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("skada-sok")?.focus()');
    expect(form).toContain('document.getElementById("skadelista-csv")?.focus()');
    expect(form).toContain("Nytt skadeärende");
    expect(form).toContain("canManage || loading");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Skadeärendena hämtas.");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
    expect(form).not.toContain('id="skadelista-csv" autoFocus');
    expect(form).not.toContain("LoadingState");
    expect(form).not.toContain("Läser skadeärenden…");
    expect(sticky).toContain('const claimsRoot = "/dashboard/skador"');
    expect(sticky).toContain("Nytt skadeärende");
    expect(sticky).not.toContain("#skadelista");
    expect(sticky).not.toContain("#skadelista-csv");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('href: "/dashboard/skador?create=1"');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/skador", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
