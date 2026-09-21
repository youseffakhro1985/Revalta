import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ronder create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./ronder-page.tsx", import.meta.url), "utf8");

  it("opens the create dialog from the server search params", () => {
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
    expect(form).toContain("Ny rond");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).toContain('id="rond-editor"');
    expect(form).toContain('id="rond-namn"');
    expect(form).toContain('document.getElementById("rond-namn")?.focus()');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain("scrollIntoView");
    expect(form).not.toContain("＋");
  });
});

describe("ronder leftover list first HTML", () => {
  it("keeps leftover rounds in the first HTML and focuses Planerade after load without a second autoFocus", () => {
    const form = readFileSync(new URL("./ronder-page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(form).toContain('id="rondfilter"');
    expect(form).toContain('id="rond-sok"');
    expect(form).toContain('id="rondurval"');
    expect(form).toContain('id="rondurval-planerade"');
    expect(form).toContain('id="rond-editor"');
    expect(form).toContain('id="rond-namn"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#rondfilter"');
    expect(form).toContain('window.location.hash !== "#rondurval"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("rond-sok")?.focus()');
    expect(form).toContain('document.getElementById("rondurval-planerade")?.focus()');
    expect(form).toContain("Ny rond");
    expect(form).toContain("canManage || loading");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Ronderna hämtas.");
    expect(form).not.toContain("LoadingState");
    expect(form).not.toContain("Hämtar ronder…");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
    expect(form).not.toContain('id="rondurval-planerade" autoFocus');
    expect(sticky).toContain('href: "/dashboard/ronder?create=1"');
    expect(sticky).not.toContain("#rondurval");
    expect(sticky).not.toContain("#rondurval-planerade");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/ronder", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
