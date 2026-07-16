import { describe, expect, it } from "vitest";
import { isStrongPassword, isValidEmail, normalizeEmail, safeInternalPath } from "@/lib/security";

describe("security helpers", () => {
  it("normalizes and validates email addresses", () => {
    expect(normalizeEmail("  Anna@Example.SE ")).toBe("anna@example.se");
    expect(isValidEmail("anna@example.se")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@example.se`)).toBe(false);
  });

  it("requires a practical password baseline", () => {
    expect(isStrongPassword("tryggtLosen9")).toBe(true);
    expect(isStrongPassword("kort1a")).toBe(false);
    expect(isStrongPassword("bara-bokstaver")).toBe(false);
    expect(isStrongPassword("1234567890")).toBe(false);
  });

  it("only accepts local redirect paths", () => {
    expect(safeInternalPath("/dashboard/felanmalan", "/dashboard")).toBe("/dashboard/felanmalan");
    expect(safeInternalPath("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/\\evil.example", "/dashboard")).toBe("/dashboard");
  });
});
