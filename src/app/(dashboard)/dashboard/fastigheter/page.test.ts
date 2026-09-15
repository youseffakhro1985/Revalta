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
