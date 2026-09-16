import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("accept invite first HTML", () => {
  it("keeps the accept form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./accept-invite-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="accept-invite-form"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#accept-invite-form"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading || Boolean(message)}");
    expect(source).not.toContain('{loadingPreview ? <div className="mt-6 h-24 animate-pulse rounded-2xl bg-sand-100" aria-hidden="true" /> : null}');
  });
});

describe("accept invite leftover preview first HTML", () => {
  it("keeps leftover invite preview in the first HTML without stealing the form", () => {
    const source = readFileSync(new URL("./accept-invite-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="inbjudan"');
    expect(source).toContain('window.location.hash !== "#inbjudan"');
    expect(source).toContain("Inbjudan hämtas.");
    expect(source).toContain('id="accept-invite-form"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading || Boolean(message)}");
  });
});
