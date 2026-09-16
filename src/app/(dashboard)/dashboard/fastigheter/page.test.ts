import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fastigheter index", () => {
  it("opens each property through a real href instead of a clickable row", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('href={`/dashboard/fastigheter/${property.id}`}');
    expect(source).toContain("aria-label={`Öppna ${property.name}`}");
    expect(source).not.toContain('role="link"');
    expect(source).not.toContain("router.push(`/dashboard/fastigheter/${property.id}`)");
  });
});

describe("fastigheter leftover filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="fastighetsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#fastighetsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="/dashboard/fastigheter/ny"');
    expect(source).toContain("Ny fastighet");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Fastigheterna hämtas.");
    expect(source).not.toContain('className="h-12 animate-pulse rounded-xl bg-sand-100"');
  });
});
