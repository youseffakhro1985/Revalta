import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo request form", () => {
  it("länkar integritetspolicyn från samtyckestexten", () => {
    const source = readFileSync(new URL("./demo-request-form.tsx", import.meta.url), "utf8");
    expect(source).toContain('href="/juridik/integritet"');
    expect(source).toContain("Revaltas integritetspolicy");
  });
});
