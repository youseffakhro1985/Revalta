import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("first-run onboarding first HTML", () => {
  it("keeps Markera verifierad in the first HTML without stealing dashboard stickies", () => {
    const source = readFileSync(new URL("./first-run-onboarding.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kom-igang"');
    expect(source).toContain('id="verifiera-felanmalan"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kom-igang"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("verifiera-felanmalan")?.focus()');
    expect(source).toContain("Markera verifierad");
    expect(source).toContain("disabled={verifying || loading}");
    expect(source).toContain("if (!loading && !error && (!eligible || !progress || progress.complete)) return null");
    expect(source).not.toContain("if (loading || !eligible || !progress || progress.complete) return null");
    expect(source).not.toContain("autoFocus");
    expect(source).not.toContain("hämtas");
    expect(source).not.toContain("Laddar");
  });
});
