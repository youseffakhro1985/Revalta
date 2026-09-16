import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order reporting first HTML", () => {
  it("keeps the attestation form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./work-order-reporting-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-intygande"');
    expect(source).toContain('id="intygande-namn"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-intygande"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("intygande-namn")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("inte e-legitimation eller BankID");
    expect(source).toContain("saving || loading");
    expect(source).toContain("canCreateInvoiceBasis || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-80 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
