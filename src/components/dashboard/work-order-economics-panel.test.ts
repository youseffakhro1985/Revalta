import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order economics invoice copy", () => {
  it("offers a server rebuild from attested rows and does not claim save generates lines", () => {
    const source = readFileSync(new URL("./work-order-economics-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('action: "rebuild"');
    expect(source).toContain("Bygg fakturaunderlag från attesterade rader");
    expect(source).not.toContain("spara underlaget för att generera rader");
    expect(source).toContain("spara utkast skapar inte rader av sig själv");
  });
});
