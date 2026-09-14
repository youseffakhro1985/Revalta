import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("skador create query", () => {
  it("opens the create form from the sticky header query and clears it on close", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('get("create") === "1"');
    expect(source).toContain("closeCreate");
    expect(source).toContain("router.replace");
    expect(source).toContain("Nytt skadeärende");
    expect(source).toContain("Skapa arbetsorder");
    expect(source).toContain("/api/insurance-claims/${claim.id}/work-order");
  });
});
