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

  it("rejects passwords that bcrypt would truncate after 72 UTF-8 bytes", () => {
    expect(isStrongPassword(`A1${"x".repeat(70)}`)).toBe(true); // exactly 72 bytes
    expect(isStrongPassword(`A1${"x".repeat(71)}`)).toBe(false); // 73 bytes
    expect(isStrongPassword(`${"Å".repeat(35)}A1`)).toBe(true); // 72 UTF-8 bytes
    expect(isStrongPassword(`${"Å".repeat(36)}A1`)).toBe(false); // 74 UTF-8 bytes
  });

  it("only accepts local redirect paths", () => {
    expect(safeInternalPath("/dashboard/felanmalan", "/dashboard")).toBe("/dashboard/felanmalan");
    expect(safeInternalPath("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/\\evil.example", "/dashboard")).toBe("/dashboard");
  });
});
