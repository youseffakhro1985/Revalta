import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("logout button", () => {
  it("waits for the logout JSON body before navigating so the session cookie is cleared", () => {
    const source = readFileSync(new URL("./logout-button.tsx", import.meta.url), "utf8");
    expect(source).toContain("readResponseJson");
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain("body.success !== true");
    expect(source).toContain('router.push("/login")');
  });
});
