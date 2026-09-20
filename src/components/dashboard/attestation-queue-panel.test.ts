import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("attestation queue panel", () => {
  it("loads the finance queue and attests submitted rows without leaving Ekonomi", () => {
    const source = readFileSync(new URL("./attestation-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('/api/work-orders/attestation-queue');
    expect(source).toContain("/api/work-orders/${item.id}/attestation");
    expect(source).toContain("Attesteringskö");
    expect(source).toContain("Inget att attestera");
    expect(source).toContain("Godkänn inskickade");
    expect(source).toContain("Avvisa inskickade");
    expect(source).toContain("approveSubmitted");
    expect(source).toContain("rejectSubmitted");
    expect(source).toContain("window.confirm");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
  });
});

describe("attestation queue filter first HTML", () => {
  it("keeps the queue filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./attestation-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="attestfilter"');
    expect(source).toContain('id="attest-typ"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#attestfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("attest-typ")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});

describe("attestation leftover queue first HTML", () => {
  it("keeps leftover attestation queue in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./attestation-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="attestko"');
    expect(source).toContain('window.location.hash !== "#attestko"');
    expect(source).toContain("Kön hämtas.");
    expect(source).toContain('id="attestfilter"');
    expect(source).toContain('id="attest-typ"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
