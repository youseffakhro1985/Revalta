import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component audit report first HTML", () => {
  it("keeps export and refresh in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-audit-report.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportera-revision"');
    expect(source).toContain('id="revision-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportera-revision"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("revision-uppdatera")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Exportera CSV");
    expect(source).not.toContain('{loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}');
  });
});

describe("component audit leftover first HTML", () => {
  it("keeps leftover revision history in the first HTML without stealing export", () => {
    const source = readFileSync(new URL("./component-audit-report.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="revisionslista"');
    expect(source).toContain('window.location.hash !== "#revisionslista"');
    expect(source).toContain("Historiken hämtas.");
    expect(source).toContain('id="exportera-revision"');
    expect(source).toContain('id="revision-uppdatera"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain('id="auditlista"');
  });
});
