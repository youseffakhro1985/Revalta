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
  it("keeps leftover schedules in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="schemalista"');
    expect(source).toContain('id="schemalista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#schemalista"');
    expect(source).toContain('id="nytt-schema"');
    expect(source).toContain('id="schema-fastighet"');
    expect(source).toContain('document.getElementById("schema-fastighet")?.focus()');
    expect(source).toContain('document.getElementById("schemalista-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Schemana hämtas.");
    expect(source).toContain('id="korhistorik"');
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="schemalista-uppdatera" autoFocus');
    expect(source).not.toContain("Hämtar scheman…");
    expect(sticky).toContain("/aterkommande#nytt-schema");
    expect(sticky).toContain("Nytt schema");
    expect(sticky).not.toContain("#schemalista");
    expect(sticky).not.toContain("#schemalista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});

describe("aterkommande leftover run history first HTML", () => {
  it("keeps leftover run history in the first HTML and focuses run after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="korhistorik"');
    expect(source).toContain('id="korhistorik-kor"');
    expect(source).toContain('window.location.hash !== "#korhistorik"');
    expect(source).toContain("Körhistoriken hämtas.");
    expect(source).toContain('id="nytt-schema"');
    expect(source).toContain('id="schema-fastighet"');
    expect(source).toContain('document.getElementById("schema-fastighet")?.focus()');
    expect(source).toContain('document.getElementById("korhistorik-kor")?.focus()');
    expect(source).toContain('id="schemalista"');
    expect(source).toContain('id="schemalista-uppdatera"');
    expect(source).toContain('document.getElementById("schemalista-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="korhistorik-kor" autoFocus');
    expect(sticky).toContain("/aterkommande#nytt-schema");
    expect(sticky).toContain("Nytt schema");
    expect(sticky).not.toContain("#korhistorik");
    expect(sticky).not.toContain("#korhistorik-kor");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
