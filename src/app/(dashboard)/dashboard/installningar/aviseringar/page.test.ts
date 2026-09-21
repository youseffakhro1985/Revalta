import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aviseringar hash targets", () => {
  it("keeps aviseringsval, mottagare and historik in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringsinstallningar"');
    expect(source).toContain('id="mottagare"');
    expect(source).toContain('id="korningshistorik"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("window.location.hash");
    expect(source).toContain('hash !== "#aviseringsinstallningar"');
    expect(source).toContain('hash !== "#mottagare"');
    expect(source).toContain('hash !== "#korningshistorik"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#aviseringsinstallningar"');
    expect(source).toContain('href="#mottagare"');
    expect(source).toContain('href="#korningshistorik"');
  });
});

describe("aviseringar history filter first HTML", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");

  it("keeps the history filter in the first HTML and focuses the status after load", () => {
    expect(source).toContain('id="historikfilter"');
    expect(source).toContain('id="historik-status"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#historikfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("historik-status")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading && !data ? <div className=\"h-48 animate-pulse rounded-xl bg-sand-100\" /> : null}");
  });

  it("does not steal Aviseringsval or leftover hashes", () => {
    expect(sticky).toContain('current === "/dashboard/installningar/aviseringar"');
    expect(sticky).toContain('href: "/dashboard/installningar/aviseringar#aviseringsinstallningar"');
    expect(sticky).not.toContain("#historikfilter");
    expect(sticky).not.toContain("#historik-status");
    expect(source).toContain('id="days-ahead"');
    expect(source).toContain('document.getElementById("days-ahead")?.focus()');
    expect(source).toContain('id="korninglista"');
    expect(source).toContain('id="mottagarfilter"');
  });
});

describe("aviseringar recipient filter first HTML", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");

  it("keeps the recipient role filter in the first HTML and focuses the role after load", () => {
    expect(source).toContain('id="mottagarfilter"');
    expect(source).toContain('id="avi-roll"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#mottagarfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("avi-roll")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain('id="aviseringsinstallningar"');
    expect(source).not.toContain("{loading && !data ? <div className=\"h-40 animate-pulse rounded-xl bg-sand-100\" /> : null}");
  });

  it("does not steal Aviseringsval, #historik-status or leftover hashes", () => {
    expect(sticky).toContain('current === "/dashboard/installningar/aviseringar"');
    expect(sticky).toContain('href: "/dashboard/installningar/aviseringar#aviseringsinstallningar"');
    expect(sticky).not.toContain("#mottagarfilter");
    expect(sticky).not.toContain("#avi-roll");
    expect(source).toContain('id="days-ahead"');
    expect(source).toContain('document.getElementById("days-ahead")?.focus()');
    expect(source).toContain('id="historik-status"');
    expect(source).toContain('id="mottagarlista"');
  });
});

describe("aviseringar leftover recipients first HTML", () => {
  it("keeps leftover recipients in the first HTML and focuses nav after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="mottagarlista"');
    expect(source).toContain('id="mottagarlista-lank"');
    expect(source).toContain('window.location.hash !== "#mottagarlista"');
    expect(source).toContain("Mottagarna hämtas.");
    expect(source).toContain('id="aviseringsinstallningar"');
    expect(source).toContain('id="mottagarfilter"');
    expect(source).toContain('id="historikfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("mottagarlista-lank")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('id="mottagarlista-lank" autoFocus');
    expect(source).toContain('href="#mottagare"');
    expect(source).toContain('id="days-ahead"');
    expect(source).toContain('document.getElementById("days-ahead")?.focus()');
    expect(source).toContain('id="korninglista-uppdatera"');
    expect(source).toContain('document.getElementById("korninglista-uppdatera")?.focus()');
    expect(sticky).toContain('href: "/dashboard/installningar/aviseringar#aviseringsinstallningar"');
    expect(sticky).not.toContain("#mottagarlista");
    expect(sticky).not.toContain("#mottagarlista-lank");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});

describe("aviseringar leftover run history first HTML", () => {
  it("keeps leftover run history in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="korninglista"');
    expect(source).toContain('id="korninglista-uppdatera"');
    expect(source).toContain('window.location.hash !== "#korninglista"');
    expect(source).toContain("Körningshistoriken hämtas.");
    expect(source).toContain('id="aviseringsinstallningar"');
    expect(source).toContain('id="historikfilter"');
    expect(source).toContain('id="korningshistorik"');
    expect(source).toContain('id="mottagarlista"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("korninglista-uppdatera")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('id="korninglista-uppdatera" autoFocus');
    expect(source).toContain('id="days-ahead"');
    expect(source).toContain('document.getElementById("days-ahead")?.focus()');
    expect(source).toContain('id="historik-status"');
    expect(source).toContain('document.getElementById("historik-status")?.focus()');
    expect(source).toContain('id="avi-roll"');
    expect(sticky).toContain('href: "/dashboard/installningar/aviseringar#aviseringsinstallningar"');
    expect(sticky).not.toContain("#korninglista");
    expect(sticky).not.toContain("#korninglista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});

describe("aviseringar sticky mutate first HTML", () => {
  it("keeps Aviseringsval focused after load without leftover hashes stealing the sticky", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringsinstallningar"');
    expect(source).toContain('id="days-ahead"');
    expect(source).toContain("autoFocus");
    expect(source).toContain('window.location.hash !== "#aviseringsinstallningar"');
    expect(source).toContain('document.getElementById("days-ahead")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('id="mottagarlista"');
    expect(source).toContain('id="korninglista"');
    expect(source).toContain("disabled={loading}");
    const stickyIndex = source.indexOf('id="days-ahead"');
    const leftoverIndex = source.indexOf('id="mottagarlista"');
    expect(stickyIndex).toBeGreaterThan(-1);
    expect(leftoverIndex).toBeGreaterThan(stickyIndex);
  });
});
